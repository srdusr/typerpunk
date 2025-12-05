use crate::auth::{current_user, format_timestamp};
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use time::OffsetDateTime;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/stats", post(submit_result))
        .route("/api/stats/me", get(my_stats))
        .route("/api/leaderboard", get(leaderboard))
        .route("/api/users/:username/public", get(public_profile))
}

#[derive(Debug, Deserialize)]
pub struct SubmitResult {
    pub mode_key: String,
    pub wpm: f64,
    pub raw_wpm: f64,
    pub accuracy: f64,
    pub time_seconds: f64,
    #[serde(default)]
    pub device_type: Option<String>,
    /// Milliseconds between consecutive keystrokes, in order. Optional --
    /// older/other clients that don't send it just skip the timing-variance
    /// half of the anti-cheat check (see anticheat::should_flag).
    #[serde(default)]
    pub keystroke_intervals_ms: Option<Vec<f64>>,
}

// Bounds a client could never legitimately produce - rejecting them keeps
// obviously-fabricated rows out of personal bests and the public
// leaderboard without trying to fully police what "legitimate" means.
fn validate_result(r: &SubmitResult) -> Result<(), AppError> {
    if r.mode_key.is_empty() || r.mode_key.len() > 64 {
        return Err(AppError::InvalidInput("invalid mode_key".into()));
    }
    if !(0.0..=500.0).contains(&r.wpm) || !(0.0..=500.0).contains(&r.raw_wpm) {
        return Err(AppError::InvalidInput("wpm out of range".into()));
    }
    if !(0.0..=100.0).contains(&r.accuracy) {
        return Err(AppError::InvalidInput("accuracy out of range".into()));
    }
    if !(0.0..3600.0).contains(&r.time_seconds) {
        return Err(AppError::InvalidInput("time_seconds out of range".into()));
    }
    if let Some(d) = &r.device_type {
        if d != "desktop" && d != "mobile" {
            return Err(AppError::InvalidInput("device_type must be 'desktop' or 'mobile'".into()));
        }
    }
    Ok(())
}

async fn submit_result(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(body): Json<SubmitResult>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    if !state.stats_rate_limiter.check(user.id.clone()) {
        return Err(AppError::RateLimited);
    }
    validate_result(&body)?;

    let device_type = body.device_type.as_deref().unwrap_or("desktop");
    let flagged = crate::anticheat::should_flag(body.wpm, &body.keystroke_intervals_ms);

    sqlx::query(
        "INSERT INTO test_results (id, user_id, mode_key, wpm, raw_wpm, accuracy, time_seconds, created_at, device_type, flagged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(&body.mode_key)
    .bind(body.wpm)
    .bind(body.raw_wpm)
    .bind(body.accuracy)
    .bind(body.time_seconds)
    .bind(format_timestamp(OffsetDateTime::now_utc()))
    .bind(device_type)
    .bind(flagged)
    .execute(&state.db)
    .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Serialize)]
pub struct PersonalBest {
    pub mode_key: String,
    pub wpm: f64,
    pub date: String,
}

#[derive(Debug, Serialize)]
pub struct MyStats {
    pub tests_completed: i64,
    pub total_time_seconds: f64,
    pub average_wpm: f64,
    pub average_accuracy: f64,
    pub best_wpm: f64,
    pub personal_bests: Vec<PersonalBest>,
}

// Shared by /api/stats/me (the signed-in caller's own id) and the public
// profile endpoint (an arbitrary user_id looked up by username) - same
// aggregate, same window-function best-per-mode query either way.
async fn fetch_stats_summary(state: &AppState, user_id: &str) -> Result<MyStats, AppError> {
    let summary = sqlx::query(
        "SELECT COUNT(*) as tests_completed,
                COALESCE(SUM(time_seconds), 0) as total_time_seconds,
                COALESCE(AVG(wpm), 0) as average_wpm,
                COALESCE(AVG(accuracy), 0) as average_accuracy,
                COALESCE(MAX(wpm), 0) as best_wpm
         FROM test_results WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    // Window function picks each mode's single highest-wpm row (and that
    // row's own date) rather than independently maxing wpm and date, which
    // could otherwise pair a best score with the date of a different run.
    let bests = sqlx::query(
        "SELECT mode_key, wpm, created_at FROM (
            SELECT mode_key, wpm, created_at,
                   ROW_NUMBER() OVER (PARTITION BY mode_key ORDER BY wpm DESC) as rn
            FROM test_results WHERE user_id = ?
         ) WHERE rn = 1",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    let personal_bests = bests
        .into_iter()
        .map(|row| PersonalBest {
            mode_key: row.try_get("mode_key").unwrap_or_default(),
            wpm: row.try_get("wpm").unwrap_or_default(),
            date: row.try_get("created_at").unwrap_or_default(),
        })
        .collect();

    Ok(MyStats {
        tests_completed: summary.try_get("tests_completed").unwrap_or_default(),
        total_time_seconds: summary.try_get("total_time_seconds").unwrap_or_default(),
        average_wpm: summary.try_get("average_wpm").unwrap_or_default(),
        average_accuracy: summary.try_get("average_accuracy").unwrap_or_default(),
        best_wpm: summary.try_get("best_wpm").unwrap_or_default(),
        personal_bests,
    })
}

async fn my_stats(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    Ok(Json(fetch_stats_summary(&state, &user.id).await?))
}

#[derive(Debug, Serialize)]
pub struct PublicProfile {
    pub username: String,
    pub joined_at: String,
    pub flair: Option<String>,
    #[serde(flatten)]
    pub stats: MyStats,
}

// Deliberately excludes anything not meant for other people to see (no
// email, no password hash, no session/friendship data) - just the same
// aggregate/personal-bests shape /api/stats/me returns for yourself, plus
// the username, join date, and equipped flair (cosmetics only mean anything
// if other people can actually see them), for anyone looking someone up.
async fn public_profile(State(state): State<Arc<AppState>>, Path(username): Path<String>) -> Result<impl IntoResponse, AppError> {
    // LEFT JOIN cosmetics for the flair's *value* ("star"), not the raw
    // cosmetic id ("flair-star") stored on the user row - the frontend's
    // FLAIR_ICONS map is keyed by value, and hardcoding the id->value
    // mapping client-side would silently drift the moment the catalog
    // changes.
    let row = sqlx::query(
        "SELECT users.id as id, users.created_at as created_at, cosmetics.value as flair_value
         FROM users LEFT JOIN cosmetics ON cosmetics.id = users.equipped_flair
         WHERE users.username = ?",
    )
    .bind(&username)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let user_id: String = row.try_get("id").map_err(|e| AppError::Internal(e.into()))?;
    let joined_at: String = row.try_get("created_at").map_err(|e| AppError::Internal(e.into()))?;
    // See cosmetics.rs's comment on this exact pattern - .ok() alone left
    // T ambiguous enough to decode NULL as "" instead of None.
    let flair: Option<String> = row.try_get::<Option<String>, _>("flair_value").unwrap_or(None);
    let stats = fetch_stats_summary(&state, &user_id).await?;

    Ok(Json(PublicProfile { username, joined_at, flair, stats }))
}

#[derive(Debug, Deserialize)]
pub struct LeaderboardQuery {
    pub mode: String,
    pub limit: Option<u32>,
    /// "desktop" to show desktop-only results; omitted/anything else means
    /// no device filter. Mobile is intentionally still counted by default --
    /// this is an opt-in filter for viewers who want a keyboard-only board,
    /// not a default exclusion of mobile players.
    pub device: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LeaderboardEntry {
    pub username: String,
    pub wpm: f64,
    pub accuracy: f64,
    pub date: String,
    pub device_type: String,
    pub flair: Option<String>,
    /// Surfaced so the client can label the row. A board that mixes synthetic
    /// scores into human ones without saying which is which is lying to the
    /// people reading it.
    pub is_bot: bool,
}

async fn leaderboard(State(state): State<Arc<AppState>>, Query(q): Query<LeaderboardQuery>) -> Result<impl IntoResponse, AppError> {
    if q.mode.is_empty() || q.mode.len() > 64 {
        return Err(AppError::InvalidInput("invalid mode".into()));
    }
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let desktop_only = q.device.as_deref() == Some("desktop");

    // One row per user: their single best NON-FLAGGED run in this mode,
    // ranked by wpm. A flagged run doesn't just rank lower - it's excluded
    // entirely, since a flagged score sitting on the board (even far down)
    // is still a false signal to everyone who sees it.
    // Same reasoning as public_profile: join through to the flair's value,
    // not the raw cosmetic id.
    let rows = sqlx::query(
        "SELECT username, wpm, accuracy, created_at, device_type, flair_value, is_bot FROM (
            SELECT users.username as username, test_results.wpm as wpm,
                   test_results.accuracy as accuracy, test_results.created_at as created_at,
                   test_results.device_type as device_type, cosmetics.value as flair_value,
                   users.is_bot as is_bot,
                   ROW_NUMBER() OVER (PARTITION BY test_results.user_id ORDER BY test_results.wpm DESC) as rn
            FROM test_results
            JOIN users ON users.id = test_results.user_id
            LEFT JOIN cosmetics ON cosmetics.id = users.equipped_flair
            WHERE test_results.mode_key = ? AND test_results.flagged = 0
              AND (? = 0 OR test_results.device_type = 'desktop')
         ) WHERE rn = 1
         ORDER BY wpm DESC
         LIMIT ?",
    )
    .bind(&q.mode)
    .bind(desktop_only)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let entries: Vec<LeaderboardEntry> = rows
        .into_iter()
        .map(|row| LeaderboardEntry {
            username: row.try_get("username").unwrap_or_default(),
            wpm: row.try_get("wpm").unwrap_or_default(),
            accuracy: row.try_get("accuracy").unwrap_or_default(),
            date: row.try_get("created_at").unwrap_or_default(),
            device_type: row.try_get("device_type").unwrap_or_default(),
            flair: row.try_get::<Option<String>, _>("flair_value").unwrap_or(None),
            is_bot: row.try_get::<i64, _>("is_bot").unwrap_or(0) != 0,
        })
        .collect();

    Ok(Json(entries))
}
