use crate::auth::{current_user, format_timestamp};
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Path, State};
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
        .route("/api/cosmetics", get(list_catalog))
        .route("/api/cosmetics/me", get(my_cosmetics))
        .route("/api/cosmetics/:id/purchase", post(purchase))
        .route("/api/cosmetics/:id/equip", post(equip))
        .route("/api/cosmetics/unequip", post(unequip))
}

#[derive(Debug, Serialize)]
struct Cosmetic {
    id: String,
    name: String,
    category: String,
    price_cents: i64,
    value: String,
}

async fn list_catalog(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query("SELECT id, name, category, price_cents, value FROM cosmetics ORDER BY category, price_cents")
        .fetch_all(&state.db)
        .await?;
    let items: Vec<Cosmetic> = rows
        .into_iter()
        .map(|row| Cosmetic {
            id: row.try_get("id").unwrap_or_default(),
            name: row.try_get("name").unwrap_or_default(),
            category: row.try_get("category").unwrap_or_default(),
            price_cents: row.try_get("price_cents").unwrap_or_default(),
            value: row.try_get("value").unwrap_or_default(),
        })
        .collect();
    Ok(Json(items))
}

#[derive(Debug, Serialize)]
struct MyCosmetics {
    owned: Vec<String>,
    equipped_caret: Option<String>,
    equipped_flair: Option<String>,
}

async fn my_cosmetics(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let owned_rows = sqlx::query("SELECT cosmetic_id FROM user_cosmetics WHERE user_id = ?")
        .bind(&user.id)
        .fetch_all(&state.db)
        .await?;
    let owned: Vec<String> = owned_rows.into_iter().filter_map(|r| r.try_get("cosmetic_id").ok()).collect();

    let equip_row = sqlx::query("SELECT equipped_caret, equipped_flair FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&state.db)
        .await?;

    Ok(Json(MyCosmetics {
        owned,
        // Explicit Option<String> turbofish - try_get(...).ok() here was
        // ambiguous enough that type inference picked plain String, and
        // sqlx's SQLite decode of a NULL column into String silently
        // produced an empty string instead of erroring the way decoding
        // into Option<String> correctly does. Found via a real NULL column
        // round-tripping as "" instead of JSON null.
        equipped_caret: equip_row.try_get::<Option<String>, _>("equipped_caret").unwrap_or(None),
        equipped_flair: equip_row.try_get::<Option<String>, _>("equipped_flair").unwrap_or(None),
    }))
}

// Stub: grants ownership immediately with no actual charge. Wiring a real
// payment processor (Stripe or otherwise) needs the project owner's own
// merchant account - same situation as the Spotify integration needing its
// own developer credentials. This endpoint is the seam a real charge would
// slot into later without changing the ownership/equip logic around it.
async fn purchase(State(state): State<Arc<AppState>>, jar: CookieJar, Path(cosmetic_id): Path<String>) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let exists = sqlx::query("SELECT id FROM cosmetics WHERE id = ?")
        .bind(&cosmetic_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    sqlx::query("INSERT OR IGNORE INTO user_cosmetics (user_id, cosmetic_id, acquired_at) VALUES (?, ?, ?)")
        .bind(&user.id)
        .bind(&cosmetic_id)
        .bind(format_timestamp(OffsetDateTime::now_utc()))
        .execute(&state.db)
        .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

async fn equip(State(state): State<Arc<AppState>>, jar: CookieJar, Path(cosmetic_id): Path<String>) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let row = sqlx::query(
        "SELECT cosmetics.category as category FROM cosmetics
         JOIN user_cosmetics ON user_cosmetics.cosmetic_id = cosmetics.id
         WHERE cosmetics.id = ? AND user_cosmetics.user_id = ?",
    )
    .bind(&cosmetic_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::InvalidInput("you don't own this cosmetic".into()))?;

    let category: String = row.try_get("category").map_err(|e| AppError::Internal(e.into()))?;
    let column = match category.as_str() {
        "caret" => "equipped_caret",
        "flair" => "equipped_flair",
        _ => return Err(AppError::Internal(anyhow::anyhow!("unknown cosmetic category"))),
    };

    // Column name comes from a hardcoded match above, never from request
    // input, so this is safe despite not being a bind parameter.
    let query = format!("UPDATE users SET {column} = ? WHERE id = ?");
    sqlx::query(&query).bind(&cosmetic_id).bind(&user.id).execute(&state.db).await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
struct UnequipRequest {
    category: String,
}

async fn unequip(State(state): State<Arc<AppState>>, jar: CookieJar, Json(body): Json<UnequipRequest>) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    let column = match body.category.as_str() {
        "caret" => "equipped_caret",
        "flair" => "equipped_flair",
        _ => return Err(AppError::InvalidInput("category must be 'caret' or 'flair'".into())),
    };
    let query = format!("UPDATE users SET {column} = NULL WHERE id = ?");
    sqlx::query(&query).bind(&user.id).execute(&state.db).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
