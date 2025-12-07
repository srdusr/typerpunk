//! Bot results for the leaderboard.
//!
//! A brand-new game has an empty board, and an empty board tells a new player
//! that nobody is here. These bots race the standard leaderboard modes on a
//! slow interval so there is always something to measure yourself against.
//!
//! They are ordinary users carrying `is_bot = 1`, which the leaderboard
//! returns and the client labels. Presenting synthetic scores as human ones
//! would be dishonest, so the flag travels with the row rather than the bots
//! being disguised.

use crate::state::AppState;
use rand::Rng;
use std::sync::Arc;
use std::time::Duration;
use time::OffsetDateTime;

/// The names bot racers use. Distinct from the multiplayer bot pool so a
/// leaderboard name is not mistaken for someone you just raced.
const BOT_USERNAMES: &[&str] = &[
    "circuit", "lumen", "kestrel", "vantablack", "moth", "cinder",
    "halide", "wren", "obsidian", "tallow", "juniper", "signal",
];

/// Which modes get populated - the same fixed-length ones the leaderboard
/// screen offers, since an open-ended quote category has no comparable score.
const MODES: &[&str] = &[
    "time-15", "time-30", "time-60", "time-120",
    "words-10", "words-25", "words-50", "words-100",
];

/// How often a bot posts a result. Slow on purpose: the board should look
/// lived-in, not busy, and every insert is a write on a single-writer database.
const POST_INTERVAL: Duration = Duration::from_secs(90);

/// A bot's ceiling. Deliberately short of a strong human: the board exists to
/// give a new player something to chase, not to make the top unreachable.
/// How many results each mode is seeded with on first run.
const SEED_PER_MODE: i64 = 8;
const BOT_MIN_WPM: f64 = 38.0;
const BOT_MAX_WPM: f64 = 96.0;

pub fn spawn(state: Arc<AppState>) {
    tokio::spawn(async move {
        if let Err(err) = ensure_bot_users(&state).await {
            tracing::warn!("could not create leaderboard bots: {err}");
            return;
        }
        if let Err(err) = seed_backlog(&state).await {
            tracing::warn!("could not seed leaderboard backlog: {err}");
        }
        let mut ticker = tokio::time::interval(POST_INTERVAL);
        // The immediate first tick would post a result at boot; skip it so a
        // restart does not stack results at the same timestamp.
        ticker.tick().await;
        loop {
            ticker.tick().await;
            if let Err(err) = post_one_result(&state).await {
                tracing::warn!("bot leaderboard result failed: {err}");
            }
        }
    });
}

async fn ensure_bot_users(state: &AppState) -> Result<(), sqlx::Error> {
    for name in BOT_USERNAMES {
        // A bot has no usable password hash: these accounts are never signed
        // into, and the auth path compares against a hash that cannot match.
        sqlx::query(
            "INSERT INTO users (id, username, password_hash, created_at, is_bot)
             VALUES ($1, $2, '!', $3, TRUE)
             ON CONFLICT(username) DO NOTHING",
        )
        .bind(format!("bot-{name}"))
        .bind(*name)
        .bind(crate::auth::format_timestamp(OffsetDateTime::now_utc()))
        .execute(&state.db)
        .await?;
    }
    Ok(())
}

async fn post_one_result(state: &AppState) -> Result<(), sqlx::Error> {
    let (name, mode, wpm, accuracy, seconds) = {
        let mut rng = rand::thread_rng();
        let name = BOT_USERNAMES[rng.gen_range(0..BOT_USERNAMES.len())];
        let mode = MODES[rng.gen_range(0..MODES.len())];
        let wpm = rng.gen_range(BOT_MIN_WPM..BOT_MAX_WPM);
        // Accuracy tracks speed, the same way it does for the racing bots.
        let t = (wpm - BOT_MIN_WPM) / (BOT_MAX_WPM - BOT_MIN_WPM);
        let accuracy = (88.0 + t * 10.0 + rng.gen_range(-1.5..1.5)).clamp(85.0, 100.0);
        let seconds = mode_seconds(mode, wpm);
        (name, mode, wpm, accuracy, seconds)
    };

    sqlx::query(
        "INSERT INTO test_results (id, user_id, mode_key, wpm, raw_wpm, accuracy, time_seconds, created_at, device_type, flagged)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'desktop', FALSE)",
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(format!("bot-{name}"))
    .bind(mode)
    .bind(wpm)
    .bind(wpm * 1.05)
    .bind(accuracy)
    .bind(seconds)
    .bind(crate::auth::format_timestamp(OffsetDateTime::now_utc()))
    .execute(&state.db)
    .await?;
    Ok(())
}

/// Fills each mode on first run so the board is worth looking at immediately.
/// Without this a fresh install shows an empty leaderboard and then gains one
/// row every ninety seconds, which is hours before it reads as populated.
/// Dated backwards across the past fortnight so it does not look like every
/// score was set in the same instant.
async fn seed_backlog(state: &AppState) -> Result<(), sqlx::Error> {
    for mode in MODES {
        // Checked per mode, not once overall: a single result posted by the
        // live ticker used to satisfy an "any bot results at all" guard and
        // leave every other mode permanently empty. This also means a mode
        // added later gets seeded on the next start.
        let existing: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM test_results WHERE user_id LIKE 'bot-%' AND mode_key = $1",
        )
        .bind(*mode)
        .fetch_one(&state.db)
        .await?;
        if existing >= SEED_PER_MODE {
            continue;
        }

        for _ in existing..SEED_PER_MODE {
            let (name, wpm, accuracy, seconds, age_hours) = {
                let mut rng = rand::thread_rng();
                let name = BOT_USERNAMES[rng.gen_range(0..BOT_USERNAMES.len())];
                let wpm = rng.gen_range(BOT_MIN_WPM..BOT_MAX_WPM);
                let t = (wpm - BOT_MIN_WPM) / (BOT_MAX_WPM - BOT_MIN_WPM);
                let accuracy = (88.0 + t * 10.0 + rng.gen_range(-1.5..1.5)).clamp(85.0, 100.0);
                let seconds = mode_seconds(mode, wpm);
                (name, wpm, accuracy, seconds, rng.gen_range(1..336))
            };
            let created = OffsetDateTime::now_utc() - time::Duration::hours(age_hours);
            sqlx::query(
                "INSERT INTO test_results (id, user_id, mode_key, wpm, raw_wpm, accuracy, time_seconds, created_at, device_type, flagged)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'desktop', FALSE)",
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(format!("bot-{name}"))
            .bind(*mode)
            .bind(wpm)
            .bind(wpm * 1.05)
            .bind(accuracy)
            .bind(seconds)
            .bind(crate::auth::format_timestamp(created))
            .execute(&state.db)
            .await?;
        }
    }
    tracing::info!("seeded leaderboard backlog for {} modes", MODES.len());
    Ok(())
}

/// How long a run of this mode takes at the given pace.
fn mode_seconds(mode: &str, wpm: f64) -> f64 {
    if let Some(rest) = mode.strip_prefix("time-") {
        return rest.parse().unwrap_or(30.0);
    }
    let words: f64 = mode.strip_prefix("words-").and_then(|w| w.parse().ok()).unwrap_or(25.0);
    // Five characters to a word, at this pace.
    (words * 5.0) / (wpm * 5.0 / 60.0)
}
