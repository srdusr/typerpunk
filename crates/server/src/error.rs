use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

// A single error type for every handler, so failure modes map to HTTP status
// consistently instead of each handler picking its own. Messages returned to
// the client are deliberately generic for anything auth-related - see
// AppError::InvalidCredentials - so a failed login never reveals whether
// the username exists.
#[derive(Debug)]
pub enum AppError {
    InvalidCredentials,
    UsernameTaken,
    InvalidInput(String),
    Unauthorized,
    NotFound,
    NotConfigured(String),
    RateLimited,
    Internal(anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::InvalidCredentials => (StatusCode::UNAUTHORIZED, "invalid username or password".to_string()),
            AppError::UsernameTaken => (StatusCode::CONFLICT, "username already taken".to_string()),
            AppError::InvalidInput(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "not signed in".to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, "not found".to_string()),
            AppError::NotConfigured(msg) => (StatusCode::NOT_IMPLEMENTED, msg.clone()),
            AppError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "too many attempts, try again later".to_string()),
            AppError::Internal(err) => {
                tracing::error!("internal error: {err:#}");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal server error".to_string())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError::Internal(err.into())
    }
}
