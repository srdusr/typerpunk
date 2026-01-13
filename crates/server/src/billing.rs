//! Payments, through Stripe Checkout.
//!
//! Three rules shape this module.
//!
//! Checkout is hosted by Stripe. The customer is redirected there, enters
//! their card there, and comes back. No card details reach this server, which
//! keeps it outside PCI scope entirely. That is worth more than the small
//! amount of control a self-hosted form would buy.
//!
//! Price is decided here, never by the caller. The client asks to buy a
//! cosmetic by id; the amount comes from this server's own catalogue row.
//!
//! Nothing is granted until Stripe says so, through a webhook whose signature
//! is verified. A request that merely claims a payment succeeded is worthless.

use crate::auth::{current_user, format_timestamp};
use crate::error::AppError;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use axum_extra::extract::CookieJar;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use sqlx::Row;
use std::sync::Arc;
use subtle::ConstantTimeEq;
use time::{Duration as TimeDuration, OffsetDateTime};

/// What the supporter subscription costs, and how long it lasts.
const SUPPORTER_PRICE_CENTS: i32 = 300;
const SUPPORTER_DAYS: i64 = 30;

/// A Stripe timestamp older than this is not accepted, so a captured webhook
/// cannot be replayed later.
const WEBHOOK_TOLERANCE_SECS: i64 = 300;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/billing/checkout/:cosmetic_id", post(checkout_cosmetic))
        .route("/api/billing/bundle/:bundle_id", post(checkout_bundle))
        .route("/api/billing/supporter", post(checkout_supporter))
        .route("/api/billing/webhook", post(webhook))
}

#[derive(Debug, Clone, Default)]
pub struct StripeConfig {
    pub secret_key: String,
    pub webhook_secret: String,
}

impl StripeConfig {
    pub fn is_configured(&self) -> bool {
        !self.secret_key.is_empty() && !self.webhook_secret.is_empty()
    }
}

fn require_stripe(state: &AppState) -> Result<&StripeConfig, AppError> {
    if !state.stripe.is_configured() {
        return Err(AppError::NotConfigured(
            "payments are not configured on this server".into(),
        ));
    }
    Ok(&state.stripe)
}

/// Creates a Checkout session and records it as pending. The item is not
/// granted here; the webhook does that once Stripe confirms payment.
async fn create_session(
    state: &AppState,
    user_id: &str,
    kind: &str,
    cosmetic_id: Option<&str>,
    bundle_id: Option<&str>,
    name: &str,
    amount_cents: i32,
) -> Result<String, AppError> {
    let stripe = require_stripe(state)?;

    // Nothing is ever sold for nothing. A zero here would mean a price that
    // failed to decode or a catalogue row that was never given one, and the
    // result would be a session that grants the item without charging.
    if amount_cents <= 0 {
        tracing::error!("refusing to create a checkout session for {name} at {amount_cents} cents");
        return Err(AppError::Internal(anyhow::anyhow!("could not start checkout")));
    }

    let purchase_id = uuid::Uuid::new_v4().to_string();

    let success = format!("{}/?purchase=done", state.frontend_origin);
    let cancel = format!("{}/?purchase=cancelled", state.frontend_origin);
    let amount = amount_cents.to_string();

    // Stripe's API is form-encoded, not JSON.
    let mut form: Vec<(String, String)> = vec![
        ("mode".into(), "payment".to_string()),
        ("success_url".into(), success),
        ("cancel_url".into(), cancel),
        ("client_reference_id".into(), purchase_id.clone()),
        ("line_items[0][quantity]".into(), "1".into()),
        ("line_items[0][price_data][currency]".into(), "usd".into()),
        ("line_items[0][price_data][unit_amount]".into(), amount),
        ("line_items[0][price_data][product_data][name]".into(), name.to_string()),
        // Echoed back on the webhook, so fulfilment does not have to trust
        // anything the browser sends.
        ("metadata[purchase_id]".into(), purchase_id.clone()),
        ("metadata[user_id]".into(), user_id.to_string()),
    ];
    if let Some(id) = cosmetic_id {
        form.push(("metadata[cosmetic_id]".into(), id.to_string()));
    }

    let res = state
        .http
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(&stripe.secret_key, Some(""))
        .form(&form)
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        // Logged in full, returned as a generic failure: a processor error can
        // carry account detail that does not belong in a browser.
        tracing::error!("stripe checkout failed ({status}): {body}");
        return Err(AppError::Internal(anyhow::anyhow!("could not start checkout")));
    }

    #[derive(Deserialize)]
    struct Session {
        id: String,
        url: String,
    }
    let session: Session = res.json().await.map_err(|e| AppError::Internal(e.into()))?;

    sqlx::query(
        "INSERT INTO purchases (id, user_id, kind, cosmetic_id, bundle_id, amount_cents, currency, status, session_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'usd', 'pending', $7, $8)",
    )
    .bind(&purchase_id)
    .bind(user_id)
    .bind(kind)
    .bind(cosmetic_id)
    .bind(bundle_id)
    .bind(amount_cents)
    .bind(&session.id)
    .bind(format_timestamp(OffsetDateTime::now_utc()))
    .execute(&state.db)
    .await?;

    Ok(session.url)
}

async fn checkout_cosmetic(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Path(cosmetic_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    // Price and name come from our own row, never from the request.
    let row = sqlx::query("SELECT name, price_cents FROM cosmetics WHERE id = $1")
        .bind(&cosmetic_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let name: String = row.try_get("name")?;
    let price: i32 = row.try_get("price_cents")?;

    // Already owned: charging again would be taking money for nothing.
    let owned = sqlx::query("SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND cosmetic_id = $2")
        .bind(&user.id)
        .bind(&cosmetic_id)
        .fetch_optional(&state.db)
        .await?;
    if owned.is_some() {
        return Err(AppError::InvalidInput("you already own that".into()));
    }

    let url = create_session(&state, &user.id, "cosmetic", Some(&cosmetic_id), None, &name, price).await?;
    Ok(Json(serde_json::json!({ "url": url })))
}

async fn checkout_bundle(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Path(bundle_id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;

    let row = sqlx::query("SELECT name, price_cents FROM bundles WHERE id = $1")
        .bind(&bundle_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let name: String = row.try_get("name")?;
    let price: i32 = row.try_get("price_cents")?;

    // A bundle whose every item is already owned has nothing to sell.
    let remaining: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM bundle_items bi
         WHERE bi.bundle_id = $1
           AND NOT EXISTS (SELECT 1 FROM user_cosmetics uc
                           WHERE uc.user_id = $2 AND uc.cosmetic_id = bi.cosmetic_id)",
    )
    .bind(&bundle_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await?;
    if remaining == 0 {
        return Err(AppError::InvalidInput("you already own everything in that bundle".into()));
    }

    let url = create_session(&state, &user.id, "bundle", None, Some(&bundle_id), &name, price).await?;
    Ok(Json(serde_json::json!({ "url": url })))
}

async fn checkout_supporter(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<impl IntoResponse, AppError> {
    let user = current_user(&state.db, &jar).await.ok_or(AppError::Unauthorized)?;
    let url = create_session(
        &state,
        &user.id,
        "supporter",
        None,
        None,
        "TyperPunk supporter, 30 days",
        SUPPORTER_PRICE_CENTS,
    )
    .await?;
    Ok(Json(serde_json::json!({ "url": url })))
}

/// Verifies Stripe's `Stripe-Signature` header against the raw request body.
///
/// This is the whole security of the payment path. Without it, anyone who
/// knows the URL can post a message claiming a payment succeeded and be given
/// the goods. Compared in constant time, and the timestamp is checked so a
/// captured request cannot be replayed.
fn verify_signature(secret: &str, header: &str, body: &[u8]) -> bool {
    let mut timestamp = None;
    let mut signatures = Vec::new();
    for part in header.split(',') {
        let Some((key, value)) = part.trim().split_once('=') else { continue };
        match key {
            "t" => timestamp = value.parse::<i64>().ok(),
            "v1" => signatures.push(value),
            _ => {}
        }
    }
    let Some(timestamp) = timestamp else { return false };
    if signatures.is_empty() {
        return false;
    }

    let now = OffsetDateTime::now_utc().unix_timestamp();
    if (now - timestamp).abs() > WEBHOOK_TOLERANCE_SECS {
        return false;
    }

    let mut mac = match Hmac::<Sha256>::new_from_slice(secret.as_bytes()) {
        Ok(m) => m,
        Err(_) => return false,
    };
    mac.update(timestamp.to_string().as_bytes());
    mac.update(b".");
    mac.update(body);
    let expected = mac.finalize().into_bytes();
    let expected_hex = hex_encode(&expected);

    signatures.iter().any(|candidate| {
        candidate.as_bytes().ct_eq(expected_hex.as_bytes()).into()
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

#[derive(Deserialize)]
struct WebhookEvent {
    #[serde(rename = "type")]
    kind: String,
    data: WebhookData,
}

#[derive(Deserialize)]
struct WebhookData {
    object: WebhookObject,
}

#[derive(Deserialize)]
struct WebhookObject {
    id: String,
}

async fn webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, AppError> {
    let stripe = require_stripe(&state)?;
    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();

    if !verify_signature(&stripe.webhook_secret, signature, &body) {
        tracing::warn!("rejected a webhook with an invalid signature");
        return Err(AppError::Unauthorized);
    }

    let event: WebhookEvent =
        serde_json::from_slice(&body).map_err(|e| AppError::InvalidInput(e.to_string()))?;

    if event.kind != "checkout.session.completed" {
        // Everything else is acknowledged and ignored, so Stripe stops
        // retrying it.
        return Ok(axum::http::StatusCode::OK);
    }

    // Fulfilment keys off our own pending row, matched by session id. A
    // webhook delivered twice updates a row that is already paid and grants
    // nothing further.
    let row = sqlx::query(
        "SELECT id, user_id, kind, cosmetic_id, bundle_id, status FROM purchases WHERE session_id = $1",
    )
    .bind(&event.data.object.id)
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        tracing::warn!("webhook for an unknown session {}", event.data.object.id);
        return Ok(axum::http::StatusCode::OK);
    };
    let status: String = row.try_get("status").unwrap_or_default();
    if status == "paid" {
        return Ok(axum::http::StatusCode::OK);
    }

    let purchase_id: String = row.try_get("id").unwrap_or_default();
    let user_id: String = row.try_get("user_id").unwrap_or_default();
    let kind: String = row.try_get("kind").unwrap_or_default();
    let cosmetic_id: Option<String> = row.try_get("cosmetic_id").unwrap_or(None);
    let now = OffsetDateTime::now_utc();

    let mut tx = state.db.begin().await?;
    sqlx::query("UPDATE purchases SET status = 'paid', paid_at = $1 WHERE id = $2")
        .bind(format_timestamp(now))
        .bind(&purchase_id)
        .execute(&mut *tx)
        .await?;

    match kind.as_str() {
        "cosmetic" => {
            if let Some(cid) = cosmetic_id {
                sqlx::query(
                    "INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_at)
                     VALUES ($1, $2, $3) ON CONFLICT (user_id, cosmetic_id) DO NOTHING",
                )
                .bind(&user_id)
                .bind(&cid)
                .bind(format_timestamp(now))
                .execute(&mut *tx)
                .await?;
            }
        }
        "bundle" => {
            let bundle_id: Option<String> = row.try_get("bundle_id").unwrap_or(None);
            if let Some(bid) = bundle_id {
                // One statement rather than a loop: the set is defined by the
                // bundle, so it cannot drift from what was paid for.
                sqlx::query(
                    "INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_at)
                     SELECT $1, bi.cosmetic_id, $2 FROM bundle_items bi WHERE bi.bundle_id = $3
                     ON CONFLICT (user_id, cosmetic_id) DO NOTHING",
                )
                .bind(&user_id)
                .bind(format_timestamp(now))
                .bind(&bid)
                .execute(&mut *tx)
                .await?;
            }
        }
        "supporter" => {
            // Extends from whichever is later, so renewing early does not
            // throw away the time already paid for.
            let until = now + TimeDuration::days(SUPPORTER_DAYS);
            sqlx::query(
                "UPDATE users SET is_supporter = TRUE,
                        supporter_until = GREATEST(COALESCE(supporter_until, $1), $1)
                 WHERE id = $2",
            )
            .bind(format_timestamp(until))
            .bind(&user_id)
            .execute(&mut *tx)
            .await?;
        }
        _ => {}
    }
    tx.commit().await?;

    tracing::info!("fulfilled {kind} purchase {purchase_id}");
    Ok(axum::http::StatusCode::OK)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(secret: &str, timestamp: i64, body: &[u8]) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(timestamp.to_string().as_bytes());
        mac.update(b".");
        mac.update(body);
        format!("t={timestamp},v1={}", hex_encode(&mac.finalize().into_bytes()))
    }

    #[test]
    fn accepts_a_correct_signature() {
        let now = OffsetDateTime::now_utc().unix_timestamp();
        let body = br#"{"type":"checkout.session.completed"}"#;
        assert!(verify_signature("whsec_test", &sign("whsec_test", now, body), body));
    }

    #[test]
    fn rejects_a_forged_signature() {
        let now = OffsetDateTime::now_utc().unix_timestamp();
        let body = br#"{"type":"checkout.session.completed"}"#;
        // Anyone can post this body; without the secret they cannot sign it.
        assert!(!verify_signature("whsec_test", &format!("t={now},v1=deadbeef"), body));
        assert!(!verify_signature("whsec_test", &sign("wrong_secret", now, body), body));
    }

    #[test]
    fn rejects_a_replayed_request() {
        let old = OffsetDateTime::now_utc().unix_timestamp() - (WEBHOOK_TOLERANCE_SECS + 60);
        let body = br#"{"type":"checkout.session.completed"}"#;
        // Correctly signed, but captured and replayed later.
        assert!(!verify_signature("whsec_test", &sign("whsec_test", old, body), body));
    }

    #[test]
    fn rejects_a_tampered_body() {
        let now = OffsetDateTime::now_utc().unix_timestamp();
        let signed = br#"{"amount":100}"#;
        let tampered = br#"{"amount":999}"#;
        assert!(!verify_signature("whsec_test", &sign("whsec_test", now, signed), tampered));
    }

    #[test]
    fn rejects_a_missing_or_malformed_header() {
        let body = br#"{}"#;
        assert!(!verify_signature("whsec_test", "", body));
        assert!(!verify_signature("whsec_test", "nonsense", body));
        assert!(!verify_signature("whsec_test", "v1=abc", body));
    }
}
