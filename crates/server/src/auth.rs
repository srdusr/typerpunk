use crate::error::AppError;
use crate::state::AppState;
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{ConnectInfo, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::net::SocketAddr;
use std::sync::Arc;
use time::{Duration as TimeDuration, OffsetDateTime};

pub const SESSION_COOKIE: &str = "typerpunk_session";
const SESSION_LIFETIME_DAYS: i64 = 30;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/auth/token", post(issue_token))
}

#[derive(Debug, Serialize)]
pub struct UserView {
    pub id: String,
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct Credentials {
    pub username: String,
    pub password: String,
}

// Deliberately permissive-but-bounded: rejects the empty/absurdly-long
// inputs that would either be meaningless or a resource-exhaustion vector
// against argon2 hashing, without being a picky validator of what a
// username "should" look like.
fn validate_username(username: &str) -> Result<(), AppError> {
    if username.len() < 3 || username.len() > 24 {
        return Err(AppError::InvalidInput("username must be 3-24 characters".into()));
    }
    if !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(AppError::InvalidInput("username may only contain letters, numbers, and underscores".into()));
    }
    Ok(())
}

fn validate_password(password: &str) -> Result<(), AppError> {
    if password.len() < 8 || password.len() > 256 {
        return Err(AppError::InvalidInput("password must be 8-256 characters".into()));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, AppError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("password hashing failed: {e}")))
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else { return false };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

// `OffsetDateTime::to_string()` is NOT RFC3339 (it's e.g. "2024-01-01
// 12:34:56.0 +00:00:00"), so timestamps are always written and read back via
// this explicit RFC3339 formatter - mismatching the two silently broke
// session lookups (parse failure treated as "no session found").
pub(crate) fn format_timestamp(dt: OffsetDateTime) -> String {
    dt.format(&time::format_description::well_known::Rfc3339).expect("valid RFC3339 timestamp")
}

async fn create_session(db: &sqlx::SqlitePool, user_id: &str) -> Result<String, AppError> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let expires_at = OffsetDateTime::now_utc() + TimeDuration::days(SESSION_LIFETIME_DAYS);
    sqlx::query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(&session_id)
        .bind(user_id)
        .bind(format_timestamp(expires_at))
        .execute(db)
        .await?;
    Ok(session_id)
}

fn session_cookie(id: String, secure: bool) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, id))
        .http_only(true)
        .secure(secure)
        .same_site(SameSite::Lax)
        .path("/")
        .max_age(TimeDuration::days(SESSION_LIFETIME_DAYS))
        .build()
}

/// Resolves the signed-in user from the session cookie, if any and unexpired.
pub async fn current_user(db: &sqlx::SqlitePool, jar: &CookieJar) -> Option<UserView> {
    let session_id = jar.get(SESSION_COOKIE)?.value().to_string();
    let row = sqlx::query(
        "SELECT users.id as id, users.username as username, sessions.expires_at as expires_at
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ?",
    )
    .bind(&session_id)
    .fetch_optional(db)
    .await
    .ok()??;

    let expires_at: String = row.try_get("expires_at").ok()?;
    let expires_at = OffsetDateTime::parse(&expires_at, &time::format_description::well_known::Rfc3339).ok()?;
    if expires_at < OffsetDateTime::now_utc() {
        return None;
    }

    Some(UserView { id: row.try_get("id").ok()?, username: row.try_get("username").ok()? })
}

fn client_ip(addr: &SocketAddr) -> std::net::IpAddr {
    addr.ip()
}

async fn register(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    jar: CookieJar,
    Json(creds): Json<Credentials>,
) -> Result<impl IntoResponse, AppError> {
    if !state.auth_rate_limiter.check(client_ip(&addr)) {
        return Err(AppError::RateLimited);
    }
    validate_username(&creds.username)?;
    validate_password(&creds.password)?;

    let existing = sqlx::query("SELECT id FROM users WHERE username = ?")
        .bind(&creds.username)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::UsernameTaken);
    }

    let user_id = uuid::Uuid::new_v4().to_string();
    let password_hash = hash_password(&creds.password)?;
    sqlx::query("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)")
        .bind(&user_id)
        .bind(&creds.username)
        .bind(&password_hash)
        .bind(format_timestamp(OffsetDateTime::now_utc()))
        .execute(&state.db)
        .await?;

    let session_id = create_session(&state.db, &user_id).await?;
    let jar = jar.add(session_cookie(session_id, state.cookie_secure));
    Ok((jar, Json(UserView { id: user_id, username: creds.username })))
}

/// Verifies username/password against the users table. Shared by the
/// cookie-session login and the CLI-style token login below, so a
/// nonexistent username always takes the same dummy-hash timing path
/// regardless of which endpoint is asking.
async fn authenticate(db: &sqlx::SqlitePool, creds: &Credentials) -> Result<UserView, AppError> {
    let row = sqlx::query("SELECT id, username, password_hash FROM users WHERE username = ?")
        .bind(&creds.username)
        .fetch_optional(db)
        .await?;

    let Some(row) = row else {
        let _ = verify_password(&creds.password, "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$dummydummydummydummydummydummy");
        return Err(AppError::InvalidCredentials);
    };

    let user_id: String = row.try_get("id").map_err(|e| AppError::Internal(e.into()))?;
    let username: String = row.try_get("username").map_err(|e| AppError::Internal(e.into()))?;
    let password_hash: String = row.try_get("password_hash").map_err(|e| AppError::Internal(e.into()))?;

    if !verify_password(&creds.password, &password_hash) {
        return Err(AppError::InvalidCredentials);
    }

    Ok(UserView { id: user_id, username })
}

async fn login(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    jar: CookieJar,
    Json(creds): Json<Credentials>,
) -> Result<impl IntoResponse, AppError> {
    if !state.auth_rate_limiter.check(client_ip(&addr)) {
        return Err(AppError::RateLimited);
    }
    let user = authenticate(&state.db, &creds).await?;
    let session_id = create_session(&state.db, &user.id).await?;
    let jar = jar.add(session_cookie(session_id, state.cookie_secure));
    Ok((jar, Json(user)))
}

#[derive(Debug, Serialize)]
struct TokenResponse {
    token: String,
    user: UserView,
}

// CLI-style clients (the TUI) have no cookie jar to hold a session, and
// replicating browser cookie semantics in a terminal app isn't worth it --
// this hands back a long-lived bearer token instead, meant to be saved in a
// local config file and sent as `Authorization: Bearer <token>`.
async fn issue_token(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(creds): Json<Credentials>,
) -> Result<impl IntoResponse, AppError> {
    if !state.auth_rate_limiter.check(client_ip(&addr)) {
        return Err(AppError::RateLimited);
    }
    let user = authenticate(&state.db, &creds).await?;
    let token = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO api_tokens (token, user_id, created_at) VALUES (?, ?, ?)")
        .bind(&token)
        .bind(&user.id)
        .bind(format_timestamp(OffsetDateTime::now_utc()))
        .execute(&state.db)
        .await?;
    Ok(Json(TokenResponse { token, user }))
}

/// Resolves a signed-in user from a bearer token (see api_tokens above),
/// for clients with no cookie jar.
pub async fn user_from_token(db: &sqlx::SqlitePool, token: &str) -> Option<UserView> {
    let row = sqlx::query(
        "SELECT users.id as id, users.username as username
         FROM api_tokens JOIN users ON users.id = api_tokens.user_id
         WHERE api_tokens.token = ?",
    )
    .bind(token)
    .fetch_optional(db)
    .await
    .ok()??;
    Some(UserView { id: row.try_get("id").ok()?, username: row.try_get("username").ok()? })
}

/// Cookie session first (the browser's path), then an `Authorization:
/// Bearer <token>` header (the CLI's path) - lets a handler serve both
/// kinds of client without needing to know which one it's talking to.
pub async fn current_user_or_token(
    db: &sqlx::SqlitePool,
    jar: &CookieJar,
    headers: &axum::http::HeaderMap,
) -> Option<UserView> {
    if let Some(user) = current_user(db, jar).await {
        return Some(user);
    }
    let token = headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")?;
    user_from_token(db, token).await
}

async fn logout(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(cookie.value())
            .execute(&state.db)
            .await?;
    }
    let jar = jar.remove(Cookie::from(SESSION_COOKIE));
    Ok(jar)
}

async fn me(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    match current_user(&state.db, &jar).await {
        Some(user) => Ok(Json(user)),
        None => Err(AppError::Unauthorized),
    }
}
