use crate::auth::{current_user, format_timestamp};
use time::OffsetDateTime;
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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/cosmetics", get(list_catalog))
        .route("/api/cosmetics/me", get(my_cosmetics))
        .route("/api/cosmetics/bundles", get(list_bundles))
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
    equipped_sprite: Option<String>,
    is_supporter: bool,
}

/// Bundles, with the items each contains so the store can show what is in one
/// and what the buyer already owns.
async fn list_bundles(State(state): State<Arc<AppState>>) -> Result<impl IntoResponse, AppError> {
    let rows = sqlx::query(
        "SELECT b.id, b.name, b.description, b.price_cents,
                COALESCE(SUM(c.price_cents), 0) AS full_price,
                COALESCE(ARRAY_AGG(c.id ORDER BY c.id) FILTER (WHERE c.id IS NOT NULL), '{}') AS items
         FROM bundles b
         LEFT JOIN bundle_items bi ON bi.bundle_id = b.id
         LEFT JOIN cosmetics c ON c.id = bi.cosmetic_id
         GROUP BY b.id, b.name, b.description, b.price_cents, b.sort_order
         ORDER BY b.sort_order",
    )
    .fetch_all(&state.db)
    .await?;

    let bundles: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let items: Vec<String> = r.try_get("items").unwrap_or_default();
            serde_json::json!({
                "id": r.try_get::<String, _>("id").unwrap_or_default(),
                "name": r.try_get::<String, _>("name").unwrap_or_default(),
                "description": r.try_get::<Option<String>, _>("description").unwrap_or(None),
                "price_cents": r.try_get::<i32, _>("price_cents").unwrap_or(0),
                // What the same items cost bought one at a time, so the store
                // can show the saving rather than asserting one.
                "full_price_cents": r.try_get::<i64, _>("full_price").unwrap_or(0),
                "items": items,
            })
        })
        .collect();

    Ok(Json(bundles))
}

async fn my_cosmetics(State(state): State<Arc<AppState>>, jar: CookieJar) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let owned_rows = sqlx::query("SELECT cosmetic_id FROM user_cosmetics WHERE user_id = $1")
        .bind(&user.id)
        .fetch_all(&state.db)
        .await?;
    let owned: Vec<String> = owned_rows.into_iter().filter_map(|r| r.try_get("cosmetic_id").ok()).collect();

    // is_supporter is computed from the expiry here for the same reason it is
    // in /api/auth/me: the stored flag is set on payment and never cleared.
    let equip_row = sqlx::query(
        "SELECT equipped_caret, equipped_flair, equipped_sprite,
                (is_supporter AND supporter_until IS NOT NULL AND supporter_until > $2) AS active_supporter
         FROM users WHERE id = $1",
    )
    .bind(&user.id)
    .bind(format_timestamp(OffsetDateTime::now_utc()))
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
        equipped_sprite: equip_row.try_get::<Option<String>, _>("equipped_sprite").unwrap_or(None),
        equipped_flair: equip_row.try_get::<Option<String>, _>("equipped_flair").unwrap_or(None),
        is_supporter: equip_row.try_get::<Option<bool>, _>("active_supporter").unwrap_or(None).unwrap_or(false),
    }))
}

async fn equip(State(state): State<Arc<AppState>>, jar: CookieJar, Path(cosmetic_id): Path<String>) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let row = sqlx::query(
        "SELECT cosmetics.category as category FROM cosmetics
         JOIN user_cosmetics ON user_cosmetics.cosmetic_id = cosmetics.id
         WHERE cosmetics.id = $1 AND user_cosmetics.user_id = $2",
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
        "sprite" => "equipped_sprite",
        _ => return Err(AppError::Internal(anyhow::anyhow!("unknown cosmetic category"))),
    };

    // Column name comes from a hardcoded match above, never from request
    // input, so this is safe despite not being a bind parameter.
    let query = format!("UPDATE users SET {column} = $1 WHERE id = $2");
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
        "sprite" => "equipped_sprite",
        _ => return Err(AppError::InvalidInput("category must be 'caret', 'flair' or 'sprite'".into())),
    };
    let query = format!("UPDATE users SET {column} = NULL WHERE id = $1");
    sqlx::query(&query).bind(&user.id).execute(&state.db).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}
