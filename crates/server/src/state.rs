use crate::multiplayer::{new_registry, RoomRegistry};
use crate::rate_limit::RateLimiter;
use reqwest::Client;
use sqlx::SqlitePool;
use std::time::Duration;

#[derive(Clone, Default)]
pub struct SpotifyConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

impl SpotifyConfig {
    pub fn is_configured(&self) -> bool {
        !self.client_id.is_empty() && !self.client_secret.is_empty()
    }
}

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub auth_rate_limiter: RateLimiter,
    /// Keyed by user id, not IP - this guards an authenticated endpoint
    /// (stats submission) against a single compromised/scripted account
    /// hammering it, which an IP-keyed limiter wouldn't catch behind NAT or
    /// a VPN and would over-punish for a shared IP.
    pub stats_rate_limiter: RateLimiter<String>,
    /// Set from COOKIE_SECURE. Off for plain-HTTP local dev, must be on
    /// behind TLS in production or browsers silently drop the cookie.
    pub cookie_secure: bool,
    pub rooms: RoomRegistry,
    /// Race passages every multiplayer room draws from, so every player in
    /// a room types the identical text - loaded once at startup rather
    /// than per-room, since the pool itself never changes at runtime.
    pub race_texts: Vec<String>,
    pub spotify: SpotifyConfig,
    pub frontend_origin: String,
    pub http: Client,
}

impl AppState {
    pub fn new(
        db: SqlitePool,
        cookie_secure: bool,
        race_texts: Vec<String>,
        spotify: SpotifyConfig,
        frontend_origin: String,
    ) -> Self {
        Self {
            db,
            auth_rate_limiter: RateLimiter::new(10, Duration::from_secs(5 * 60)),
            // A genuine player finishes a test at most every several
            // seconds; 60 submissions in 5 minutes is generous headroom for
            // rapid Words-10 sessions while still capping scripted spam.
            stats_rate_limiter: RateLimiter::new(60, Duration::from_secs(5 * 60)),
            cookie_secure,
            rooms: new_registry(),
            race_texts,
            spotify,
            frontend_origin,
            http: Client::new(),
        }
    }
}
