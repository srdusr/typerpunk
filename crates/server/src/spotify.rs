use crate::auth::{current_user, format_timestamp};
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::response::{IntoResponse, Redirect};
use axum::routing::get;
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;
use std::sync::Arc;
use time::{Duration as TimeDuration, OffsetDateTime};

const STATE_COOKIE: &str = "spotify_oauth_state";
const SCOPES: &str = "user-read-currently-playing user-read-playback-state";

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/spotify/login", get(login))
        .route("/api/spotify/callback", get(callback))
        .route("/api/spotify/now-playing", get(now_playing))
}

fn random_state() -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..32).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

async fn login(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    if !state.spotify.is_configured() {
        return Err(AppError::NotConfigured(
            "Spotify isn't configured on this server - SPOTIFY_CLIENT_ID/SECRET are unset.".into(),
        ));
    }

    let csrf_state = random_state();
    let auth_url = format!(
        "https://accounts.spotify.com/authorize?client_id={}&response_type=code&redirect_uri={}&scope={}&state={}",
        urlencoding_encode(&state.spotify.client_id),
        urlencoding_encode(&state.spotify.redirect_uri),
        urlencoding_encode(SCOPES),
        urlencoding_encode(&csrf_state),
    );

    let cookie = Cookie::build((STATE_COOKIE, csrf_state))
        .http_only(true)
        .secure(state.cookie_secure)
        .same_site(SameSite::Lax)
        .path("/api/spotify")
        .max_age(TimeDuration::minutes(5))
        .build();

    Ok((jar.add(cookie), Redirect::to(&auth_url)))
}

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

async fn callback(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Query(q): Query<CallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    if let Some(err) = q.error {
        return Err(AppError::InvalidInput(format!("Spotify denied the request: {err}")));
    }
    let code = q.code.ok_or(AppError::InvalidInput("missing code".into()))?;
    let returned_state = q.state.ok_or(AppError::InvalidInput("missing state".into()))?;
    let expected_state = jar.get(STATE_COOKIE).map(|c| c.value().to_string());
    if expected_state.as_deref() != Some(returned_state.as_str()) {
        return Err(AppError::InvalidInput("state mismatch - possible CSRF, try connecting again".into()));
    }

    let token: TokenResponse = state
        .http
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(&state.spotify.client_id, Some(&state.spotify.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &state.spotify.redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("bad token response: {e}")))?;

    let Some(refresh_token) = token.refresh_token else {
        return Err(AppError::Internal(anyhow::anyhow!("Spotify did not return a refresh token")));
    };
    let expires_at = format_timestamp(OffsetDateTime::now_utc() + TimeDuration::seconds(token.expires_in));

    sqlx::query(
        "INSERT INTO spotify_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at",
    )
    .bind(&user.id)
    .bind(&token.access_token)
    .bind(&refresh_token)
    .bind(&expires_at)
    .execute(&state.db)
    .await?;

    let jar = jar.remove(Cookie::from(STATE_COOKIE));
    Ok((jar, Redirect::to(&state.frontend_origin)))
}

async fn get_valid_access_token(state: &AppState, user_id: &str) -> Result<Option<String>, AppError> {
    let row = sqlx::query("SELECT access_token, refresh_token, expires_at FROM spotify_tokens WHERE user_id = ?")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(row) = row else { return Ok(None) };

    let access_token: String = row.try_get("access_token").map_err(|e| AppError::Internal(e.into()))?;
    let refresh_token: String = row.try_get("refresh_token").map_err(|e| AppError::Internal(e.into()))?;
    let expires_at: String = row.try_get("expires_at").map_err(|e| AppError::Internal(e.into()))?;

    let expired = OffsetDateTime::parse(&expires_at, &time::format_description::well_known::Rfc3339)
        .map(|t| t < OffsetDateTime::now_utc())
        .unwrap_or(true);

    if !expired {
        return Ok(Some(access_token));
    }

    // Access tokens are short-lived (Spotify: ~1 hour) - refreshed
    // transparently here so the caller never has to think about expiry.
    let refreshed: TokenResponse = state
        .http
        .post("https://accounts.spotify.com/api/token")
        .basic_auth(&state.spotify.client_id, Some(&state.spotify.client_secret))
        .form(&[("grant_type", "refresh_token"), ("refresh_token", &refresh_token)])
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("bad refresh response: {e}")))?;

    let new_refresh_token = refreshed.refresh_token.unwrap_or(refresh_token);
    let new_expires_at = format_timestamp(OffsetDateTime::now_utc() + TimeDuration::seconds(refreshed.expires_in));
    sqlx::query("UPDATE spotify_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?")
        .bind(&refreshed.access_token)
        .bind(&new_refresh_token)
        .bind(&new_expires_at)
        .bind(user_id)
        .execute(&state.db)
        .await?;

    Ok(Some(refreshed.access_token))
}

#[derive(Debug, Serialize)]
struct NowPlaying {
    is_playing: bool,
    track: Option<String>,
    artist: Option<String>,
    duration_ms: Option<u64>,
    progress_ms: Option<u64>,
}

impl NowPlaying {
    fn nothing() -> Self {
        Self { is_playing: false, track: None, artist: None, duration_ms: None, progress_ms: None }
    }
}

async fn now_playing(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    let Some(access_token) = get_valid_access_token(&state, &user.id).await? else {
        return Err(AppError::NotFound); // not connected to Spotify
    };

    let res = state
        .http
        .get("https://api.spotify.com/v1/me/player/currently-playing")
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if res.status() == reqwest::StatusCode::NO_CONTENT {
        return Ok(Json(NowPlaying::nothing()));
    }
    if !res.status().is_success() {
        return Ok(Json(NowPlaying::nothing()));
    }

    let body: Value = res.json().await.map_err(|e| AppError::Internal(e.into()))?;
    let is_playing = body.get("is_playing").and_then(Value::as_bool).unwrap_or(false);
    let item = body.get("item");
    let track = item.and_then(|i| i.get("name")).and_then(Value::as_str).map(str::to_string);
    let artist = item
        .and_then(|i| i.get("artists"))
        .and_then(Value::as_array)
        .and_then(|a| a.first())
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let duration_ms = item.and_then(|i| i.get("duration_ms")).and_then(Value::as_u64);
    let progress_ms = body.get("progress_ms").and_then(Value::as_u64);

    Ok(Json(NowPlaying { is_playing, track, artist, duration_ms, progress_ms }))
}

// Minimal percent-encoding - avoids pulling in the `url` crate just to
// build a couple of query string values for the authorize URL.
fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
