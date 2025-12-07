use crate::auth::{current_user_or_token, format_timestamp};
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use axum_extra::extract::cookie::CookieJar;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::Arc;
use time::OffsetDateTime;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/friends", get(list_friends))
        .route("/api/friends/request", post(send_request))
        .route("/api/friends/:id/accept", post(accept_request))
        .route("/api/friends/:id", delete(remove_friendship))
}

#[derive(Debug, Serialize)]
struct FriendEntry {
    friendship_id: String,
    user_id: String,
    username: String,
    /// Only meaningful for accepted friends; a pending request has no
    /// presence worth reporting, so it is always false there.
    online: bool,
}

#[derive(Debug, Serialize)]
struct FriendsList {
    friends: Vec<FriendEntry>,
    incoming_requests: Vec<FriendEntry>,
    outgoing_requests: Vec<FriendEntry>,
}

fn row_to_entry(row: &sqlx::postgres::PgRow, friendship_id_col: &str, user_id_col: &str, username_col: &str) -> FriendEntry {
    FriendEntry {
        friendship_id: row.try_get(friendship_id_col).unwrap_or_default(),
        user_id: row.try_get(user_id_col).unwrap_or_default(),
        username: row.try_get(username_col).unwrap_or_default(),
        // Absent on the pending-request queries, which do not select it.
        online: row.try_get::<bool, _>("online").unwrap_or(false),
    }
}

async fn list_friends(State(state): State<Arc<AppState>>, jar: CookieJar, headers: HeaderMap) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers).await.ok_or(AppError::Unauthorized)?;

    // Accepted, in either direction - the "other" user is whichever side
    // isn't us, so this always returns the friend's identity regardless of
    // who originally sent the request.
    // last_seen within the presence window marks a friend as online. Compared
    // in SQL rather than in Rust so the list arrives ready to render.
    let presence_cutoff = crate::auth::format_timestamp(
        time::OffsetDateTime::now_utc() - time::Duration::seconds(crate::auth::PRESENCE_WINDOW_SECS),
    );
    let accepted = sqlx::query(
        "SELECT friendships.id as friendship_id, users.id as user_id, users.username as username,
                (users.last_seen IS NOT NULL AND users.last_seen > $1) as online
         FROM friendships
         JOIN users ON users.id = CASE WHEN friendships.requester_id = $2 THEN friendships.addressee_id ELSE friendships.requester_id END
         WHERE friendships.status = 'accepted' AND (friendships.requester_id = $3 OR friendships.addressee_id = $4)",
    )
    .bind(&presence_cutoff)
    .bind(&user.id).bind(&user.id).bind(&user.id)
    .fetch_all(&state.db)
    .await?;

    let incoming = sqlx::query(
        "SELECT friendships.id as friendship_id, users.id as user_id, users.username as username
         FROM friendships JOIN users ON users.id = friendships.requester_id
         WHERE friendships.status = 'pending' AND friendships.addressee_id = $1",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;

    let outgoing = sqlx::query(
        "SELECT friendships.id as friendship_id, users.id as user_id, users.username as username
         FROM friendships JOIN users ON users.id = friendships.addressee_id
         WHERE friendships.status = 'pending' AND friendships.requester_id = $1",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(FriendsList {
        friends: accepted.iter().map(|r| row_to_entry(r, "friendship_id", "user_id", "username")).collect(),
        incoming_requests: incoming.iter().map(|r| row_to_entry(r, "friendship_id", "user_id", "username")).collect(),
        outgoing_requests: outgoing.iter().map(|r| row_to_entry(r, "friendship_id", "user_id", "username")).collect(),
    }))
}

#[derive(Debug, Deserialize)]
struct FriendRequestBody {
    username: String,
}

async fn send_request(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Json(body): Json<FriendRequestBody>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers).await.ok_or(AppError::Unauthorized)?;

    let target = sqlx::query("SELECT id FROM users WHERE username = $1")
        .bind(&body.username)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let target_id: String = target.try_get("id").map_err(|e| AppError::Internal(e.into()))?;

    if target_id == user.id {
        return Err(AppError::InvalidInput("can't friend yourself".into()));
    }

    let existing = sqlx::query(
        "SELECT id, requester_id, status FROM friendships
         WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $3 AND addressee_id = $4)",
    )
    .bind(&user.id).bind(&target_id)
    .bind(&target_id).bind(&user.id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(row) = existing {
        let status: String = row.try_get("status").unwrap_or_default();
        let requester_id: String = row.try_get("requester_id").unwrap_or_default();
        if status == "accepted" {
            return Err(AppError::InvalidInput("already friends".into()));
        }
        // The other person already sent a request - accept it instead of
        // creating a second, redundant pending row in the opposite direction.
        if requester_id == target_id {
            let id: String = row.try_get("id").map_err(|e| AppError::Internal(e.into()))?;
            sqlx::query("UPDATE friendships SET status = 'accepted' WHERE id = $1")
                .bind(&id)
                .execute(&state.db)
                .await?;
            return Ok(axum::http::StatusCode::NO_CONTENT);
        }
        return Err(AppError::InvalidInput("request already pending".into()));
    }

    sqlx::query("INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&user.id)
        .bind(&target_id)
        .bind(format_timestamp(OffsetDateTime::now_utc()))
        .execute(&state.db)
        .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

async fn accept_request(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers).await.ok_or(AppError::Unauthorized)?;

    let result = sqlx::query(
        "UPDATE friendships SET status = 'accepted' WHERE id = $1 AND addressee_id = $2 AND status = 'pending'",
    )
    .bind(&id)
    .bind(&user.id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

// Covers declining an incoming request, cancelling one you sent, and
// unfriending an accepted one - all three are just "delete the row", scoped
// to rows the caller is actually a party to.
async fn remove_friendship(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user_or_token(&state.db, &jar, &headers).await.ok_or(AppError::Unauthorized)?;

    let result = sqlx::query("DELETE FROM friendships WHERE id = $1 AND (requester_id = $2 OR addressee_id = $3)")
        .bind(&id)
        .bind(&user.id)
        .bind(&user.id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}
