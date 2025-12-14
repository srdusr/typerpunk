//! Community text submissions.
//!
//! A bundled dataset can only get so large before it stops belonging in a
//! repository. TypeRacer's corpus is roughly twelve thousand passages, and it
//! got there through submissions rather than authoring. This is that path:
//! anyone signed in can propose a passage, and nothing reaches players until
//! a moderator approves it.

use crate::auth::current_user_or_token;
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use time::OffsetDateTime;

/// Long enough to be worth typing, short enough to stay a single race.
const MIN_CONTENT: usize = 40;
const MAX_CONTENT: usize = 600;
const MAX_ATTRIBUTION: usize = 120;

/// Where a submission may be filed. Kept in step with the bundled packs so a
/// submission cannot invent a category the mode picker will never show.
const CATEGORIES: &[&str] = &[
    "anime", "business", "general", "hacking", "history", "literature",
    "movies", "nature", "philosophy", "programming", "quotes", "science",
    "shell", "sysadmin", "technology",
];

/// Syntax languages the client can highlight. Anything else is prose.
const LANGUAGES: &[&str] = &["javascript", "python", "rust", "clike", "shell"];

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/texts", post(submit).get(approved))
        .route("/api/texts/mine", get(mine))
        .route("/api/texts/queue", get(queue))
        .route("/api/texts/:id/review", post(review))
}

#[derive(Debug, Deserialize)]
pub struct SubmitBody {
    pub category: String,
    pub content: String,
    pub attribution: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SubmissionView {
    pub id: String,
    pub category: String,
    pub content: String,
    pub attribution: Option<String>,
    pub language: Option<String>,
    pub status: String,
    pub reject_reason: Option<String>,
    pub created_at: String,
    /// Only populated on the moderation queue.
    pub submitted_by: Option<String>,
}

fn row_to_view(row: &sqlx::postgres::PgRow) -> SubmissionView {
    SubmissionView {
        id: row.try_get("id").unwrap_or_default(),
        category: row.try_get("category").unwrap_or_default(),
        content: row.try_get("content").unwrap_or_default(),
        attribution: row.try_get("attribution").unwrap_or(None),
        language: row.try_get("language").unwrap_or(None),
        status: row.try_get("status").unwrap_or_default(),
        reject_reason: row.try_get("reject_reason").unwrap_or(None),
        created_at: row.try_get("created_at").unwrap_or_default(),
        submitted_by: row.try_get("submitted_by").unwrap_or(None),
    }
}

/// Rejects the things a passage must never contain, whatever else it says.
/// Control characters break the per-character rendering, and a newline makes
/// the passage untypeable in a single-line input.
fn clean(content: &str) -> Result<String, AppError> {
    let trimmed = content.trim();
    if trimmed.chars().any(|c| c.is_control()) {
        return Err(AppError::InvalidInput(
            "a passage must be a single line with no control characters".into(),
        ));
    }
    let count = trimmed.chars().count();
    if count < MIN_CONTENT || count > MAX_CONTENT {
        return Err(AppError::InvalidInput(format!(
            "a passage must be between {MIN_CONTENT} and {MAX_CONTENT} characters"
        )));
    }
    Ok(trimmed.to_string())
}

async fn submit(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(body): Json<SubmitBody>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers)
        .await
        .ok_or(AppError::Unauthorized)?;

    // Shares the stats limiter's shape: keyed by user, generous enough for a
    // genuine contributor and mean enough to stop a script filling the queue.
    if !state.submission_rate_limiter.check(user.id.clone()) {
        return Err(AppError::RateLimited);
    }

    if !CATEGORIES.contains(&body.category.as_str()) {
        return Err(AppError::InvalidInput("unknown category".into()));
    }
    let content = clean(&body.content)?;
    let attribution = body.attribution.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
    if attribution.as_ref().is_some_and(|a| a.chars().count() > MAX_ATTRIBUTION) {
        return Err(AppError::InvalidInput("attribution is too long".into()));
    }
    let language = body.language.filter(|l| LANGUAGES.contains(&l.as_str()));

    let result = sqlx::query(
        "INSERT INTO text_submissions (id, user_id, category, content, attribution, language, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(&body.category)
    .bind(&content)
    .bind(&attribution)
    .bind(&language)
    .bind(crate::auth::format_timestamp(OffsetDateTime::now_utc()))
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Ok(Json(serde_json::json!({ "status": "pending" }))),
        // The unique index on the normalised content is the dedupe: someone
        // has already proposed this passage, which is not the submitter's
        // mistake and should not read like an error.
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Err(AppError::InvalidInput(
            "that passage has already been submitted".into(),
        )),
        Err(e) => Err(AppError::Internal(e.into())),
    }
}

#[derive(Debug, Deserialize)]
pub struct ApprovedQuery {
    pub since: Option<String>,
}

/// Everything approved, for the client to merge into its bundled pool. Public
/// and unauthenticated: these are the passages the app types.
async fn approved(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ApprovedQuery>,
) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        "SELECT id, category, content, attribution, language, status, reject_reason, created_at,
                NULL::text as submitted_by
         FROM text_submissions
         WHERE status = 'approved' AND ($1::text IS NULL OR created_at > $1)
         ORDER BY created_at DESC
         LIMIT 5000",
    )
    .bind(&q.since)
    .fetch_all(&state.db)
    .await?;

    let items: Vec<SubmissionView> = rows.iter().map(row_to_view).collect();
    Ok(Json(items))
}

async fn mine(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers)
        .await
        .ok_or(AppError::Unauthorized)?;
    let rows = sqlx::query(
        "SELECT id, category, content, attribution, language, status, reject_reason, created_at,
                NULL::text as submitted_by
         FROM text_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;
    let items: Vec<SubmissionView> = rows.iter().map(row_to_view).collect();
    Ok(Json(items))
}

async fn require_moderator(
    state: &AppState,
    jar: &CookieJar,
    headers: &HeaderMap,
) -> Result<(), AppError> {
    let user = current_user_or_token(&state.db, jar, headers)
        .await
        .ok_or(AppError::Unauthorized)?;
    let is_moderator: bool = sqlx::query_scalar("SELECT is_moderator FROM users WHERE id = $1")
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or(false);
    if !is_moderator {
        // Unauthorized rather than NotFound: the caller is signed in, they
        // simply are not a moderator, and saying so is not a leak.
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

async fn queue(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    require_moderator(&state, &jar, &headers).await?;
    let rows = sqlx::query(
        "SELECT s.id, s.category, s.content, s.attribution, s.language, s.status,
                s.reject_reason, s.created_at, u.username as submitted_by
         FROM text_submissions s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'pending'
         ORDER BY s.created_at ASC
         LIMIT 200",
    )
    .fetch_all(&state.db)
    .await?;
    let items: Vec<SubmissionView> = rows.iter().map(row_to_view).collect();
    Ok(Json(items))
}

#[derive(Debug, Deserialize)]
pub struct ReviewBody {
    /// "approve" or "reject".
    pub decision: String,
    pub reason: Option<String>,
}

async fn review(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<ReviewBody>,
) -> Result<impl IntoResponse, AppError> {
    require_moderator(&state, &jar, &headers).await?;
    let reviewer = current_user_or_token(&state.db, &jar, &headers)
        .await
        .ok_or(AppError::Unauthorized)?;

    let status = match body.decision.as_str() {
        "approve" => "approved",
        "reject" => "rejected",
        _ => return Err(AppError::InvalidInput("decision must be approve or reject".into())),
    };

    let affected = sqlx::query(
        "UPDATE text_submissions
         SET status = $1, reject_reason = $2, reviewed_by = $3, reviewed_at = $4
         WHERE id = $5 AND status = 'pending'",
    )
    .bind(status)
    .bind(body.reason.as_deref().filter(|r| !r.trim().is_empty()))
    .bind(&reviewer.id)
    .bind(crate::auth::format_timestamp(OffsetDateTime::now_utc()))
    .bind(&id)
    .execute(&state.db)
    .await?
    .rows_affected();

    if affected == 0 {
        // Either it does not exist or someone else already reviewed it.
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "status": status })))
}
