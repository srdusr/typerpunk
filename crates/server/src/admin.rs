//! Administration: appointing and removing moderators.
//!
//! Moderator used to be a column somebody set with psql. That works exactly
//! once, on a machine you have a shell on, and is the sort of step that gets
//! done wrong at three in the morning. An administrator is bootstrapped from
//! the environment at startup; everything after that happens in the app.

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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/admin/users", get(list_users))
        .route("/api/admin/users/:username/role", post(set_role))
}

#[derive(Debug, Serialize)]
pub struct AdminUserView {
    pub username: String,
    pub is_moderator: bool,
    pub is_admin: bool,
    pub is_bot: bool,
    pub created_at: String,
}

/// Names the administrator given in TYPERPUNK_ADMIN_USERNAME, if that account
/// exists. Run at every startup so the flag can be restored by restarting with
/// the variable set, which is the recovery path if the last admin is removed.
pub async fn bootstrap_admin(state: &AppState) {
    let Ok(username) = std::env::var("TYPERPUNK_ADMIN_USERNAME") else {
        return;
    };
    let username = username.trim().to_string();
    if username.is_empty() {
        return;
    }
    match sqlx::query("UPDATE users SET is_admin = TRUE, is_moderator = TRUE WHERE username = $1")
        .bind(&username)
        .execute(&state.db)
        .await
    {
        Ok(r) if r.rows_affected() > 0 => {
            tracing::info!("{username} is an administrator");
        }
        Ok(_) => {
            tracing::warn!("TYPERPUNK_ADMIN_USERNAME is set to {username}, which is not a registered account");
        }
        Err(e) => tracing::error!("could not set the administrator: {e}"),
    }
}

async fn require_admin(state: &AppState, jar: &CookieJar, headers: &HeaderMap) -> Result<String, AppError> {
    let user = current_user_or_token(&state.db, jar, headers)
        .await
        .ok_or(AppError::Unauthorized)?;
    let is_admin: bool = sqlx::query_scalar("SELECT is_admin FROM users WHERE id = $1")
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await?
        .unwrap_or(false);
    if !is_admin {
        return Err(AppError::Unauthorized);
    }
    Ok(user.id)
}

#[derive(Debug, Deserialize)]
pub struct UserQuery {
    pub q: Option<String>,
}

async fn list_users(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Query(q): Query<UserQuery>,
) -> Result<impl IntoResponse, AppError> {
    require_admin(&state, &jar, &headers).await?;
    // Anyone already carrying a role is always listed, so an admin can see and
    // revoke without knowing who to search for.
    let search = q.q.unwrap_or_default();
    let rows = sqlx::query(
        "SELECT username, is_moderator, is_admin, is_bot, created_at FROM users
         WHERE ($1 = '' AND (is_moderator OR is_admin))
            OR ($1 <> '' AND username ILIKE '%' || $1 || '%')
         ORDER BY is_admin DESC, is_moderator DESC, username ASC
         LIMIT 50",
    )
    .bind(&search)
    .fetch_all(&state.db)
    .await?;

    let users: Vec<AdminUserView> = rows
        .iter()
        .map(|row| AdminUserView {
            username: row.try_get("username").unwrap_or_default(),
            is_moderator: row.try_get("is_moderator").unwrap_or(false),
            is_admin: row.try_get("is_admin").unwrap_or(false),
            is_bot: row.try_get("is_bot").unwrap_or(false),
            created_at: row.try_get("created_at").unwrap_or_default(),
        })
        .collect();
    Ok(Json(users))
}

#[derive(Debug, Deserialize)]
pub struct RoleBody {
    pub moderator: bool,
}

async fn set_role(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(username): Path<String>,
    Json(body): Json<RoleBody>,
) -> Result<impl IntoResponse, AppError> {
    let admin_id = require_admin(&state, &jar, &headers).await?;

    // An administrator is not demoted through this route, so a mistake here
    // cannot lock everyone out of moderation.
    let target_is_admin: bool = sqlx::query_scalar("SELECT is_admin FROM users WHERE username = $1")
        .bind(&username)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    if target_is_admin {
        return Err(AppError::InvalidInput(
            "an administrator's moderator role cannot be changed here".into(),
        ));
    }

    sqlx::query("UPDATE users SET is_moderator = $1 WHERE username = $2")
        .bind(body.moderator)
        .bind(&username)
        .execute(&state.db)
        .await?;

    tracing::info!(
        "admin {admin_id} set moderator={} for {username}",
        body.moderator
    );
    Ok(Json(serde_json::json!({ "username": username, "moderator": body.moderator })))
}
