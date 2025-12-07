use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{ConnectInfo, Query, State};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/lyrics", get(get_lyrics))
}

#[derive(Debug, Deserialize)]
pub struct LyricsQuery {
    pub artist: String,
    pub track: String,
    pub duration: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct LrclibResponse {
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LyricsResult {
    /// Synced (.lrc-format) lyrics, when lrclib has them - feed straight
    /// into the same parseCustomContent('lyrics.lrc') path Custom Text
    /// already uses for uploaded .lrc files.
    pub lrc: Option<String>,
    /// Untimed fallback when only plain lyrics exist - still typeable, just
    /// without the sync-to-playback behavior the Lyrics mode is built for.
    pub plain: Option<String>,
}

/// Beyond this, a value is not a track or artist name - it is someone using
/// this endpoint to push a large query at lrclib.
const MAX_FIELD_LEN: usize = 200;

/// The upstream body is read into memory, so it needs a ceiling that does not
/// depend on the third party behaving. Lyrics for a song are a few kilobytes.
const MAX_RESPONSE_BYTES: usize = 256 * 1024;

async fn get_lyrics(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    Query(q): Query<LyricsQuery>,
) -> Result<impl IntoResponse, AppError> {
    // This endpoint makes an outbound request on the caller's behalf. The
    // destination is fixed, so it cannot be pointed at anything else, but
    // without a limit it is still a free relay for hammering lrclib from our
    // address rather than the caller's.
    if !state.lyrics_rate_limiter.check(addr.ip()) {
        return Err(AppError::RateLimited);
    }
    if q.artist.trim().is_empty() || q.track.trim().is_empty() {
        return Err(AppError::InvalidInput("artist and track are required".into()));
    }
    if q.artist.len() > MAX_FIELD_LEN || q.track.len() > MAX_FIELD_LEN {
        return Err(AppError::InvalidInput("artist and track are too long".into()));
    }

    let mut req = state
        .http
        .get("https://lrclib.net/api/get")
        .query(&[("artist_name", q.artist.as_str()), ("track_name", q.track.as_str())]);
    if let Some(duration) = q.duration {
        req = req.query(&[("duration", duration)]);
    }

    let res = req.send().await.map_err(|e| AppError::Internal(e.into()))?;
    if let Some(len) = res.content_length() {
        if len as usize > MAX_RESPONSE_BYTES {
            return Err(AppError::Internal(anyhow::anyhow!("lrclib response too large")));
        }
    }
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::NotFound);
    }
    if !res.status().is_success() {
        return Err(AppError::Internal(anyhow::anyhow!("lrclib returned {}", res.status())));
    }

    let body: LrclibResponse = res.json().await.map_err(|e| AppError::Internal(e.into()))?;
    if body.synced_lyrics.is_none() && body.plain_lyrics.is_none() {
        return Err(AppError::NotFound);
    }

    Ok(Json(LyricsResult { lrc: body.synced_lyrics, plain: body.plain_lyrics }))
}
