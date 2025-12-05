mod anticheat;
mod bot_results;
mod auth;
mod cosmetics;
mod error;
mod friends;
mod lyrics;
mod multiplayer;
mod rate_limit;
mod spotify;
mod state;
mod stats;

use crate::state::RaceText;
use axum::http::{HeaderValue, Method};
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use state::{AppState, SpotifyConfig};
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Deserialize)]
struct TextEntry {
    content: String,
    #[serde(default)]
    attribution: Option<String>,
}

// Every multiplayer room draws from this same pool so every player in a
// room races the identical passage. Reuses the dataset already shared by
// the CLI and web app instead of maintaining a separate word list here --
// falls back to a couple of plain sentences if the file isn't reachable
// (e.g. the server binary run from somewhere other than the repo root),
// so a room can still start rather than erroring on an empty pool.
fn load_race_texts() -> Vec<RaceText> {
    let path = std::env::var("TEXTS_JSON_PATH").unwrap_or_else(|_| "texts.json".to_string());
    match std::fs::read_to_string(&path).ok().and_then(|raw| serde_json::from_str::<Vec<TextEntry>>(&raw).ok()) {
        Some(entries) if !entries.is_empty() => entries
            .into_iter()
            .map(|e| RaceText { text: e.content, attribution: e.attribution })
            .collect(),
        _ => {
            tracing::warn!("could not load race texts from {path} - using a small built-in fallback pool");
            vec![
                RaceText { text: "The quick brown fox jumps over the lazy dog.".to_string(), attribution: None },
                RaceText { text: "Pack my box with five dozen liquor jugs.".to_string(), attribution: None },
            ]
        }
    }
}

// Pulled out of main() so tests can assemble the exact same router against
// an in-memory test database, instead of a parallel hand-maintained copy of
// this list drifting out of sync with the real one.
fn build_app(app_state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .merge(auth::router())
        .merge(stats::router())
        .merge(friends::router())
        .merge(cosmetics::router())
        .merge(multiplayer::router())
        .merge(spotify::router())
        .merge(lyrics::router())
        .with_state(app_state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Ignored if absent - production deployments are expected to set real
    // env vars directly rather than ship a .env file.
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://typerpunk.db".to_string());
    let cookie_secure = std::env::var("COOKIE_SECURE").map(|v| v == "1" || v == "true").unwrap_or(false);
    let frontend_origin = std::env::var("FRONTEND_ORIGIN").unwrap_or_else(|_| "http://localhost:4173".to_string());
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);

    let connect_options = sqlx::sqlite::SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);
    let db = sqlx::sqlite::SqlitePoolOptions::new().max_connections(10).connect_with(connect_options).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    if !cookie_secure {
        tracing::warn!("COOKIE_SECURE is off - session cookies will be sent over plain HTTP. Set COOKIE_SECURE=1 behind TLS in production.");
    }

    let cors = CorsLayer::new()
        .allow_origin(frontend_origin.parse::<HeaderValue>()?)
        .allow_credentials(true)
        .allow_methods([Method::GET, Method::POST, Method::DELETE])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let spotify_config = SpotifyConfig {
        client_id: std::env::var("SPOTIFY_CLIENT_ID").unwrap_or_default(),
        client_secret: std::env::var("SPOTIFY_CLIENT_SECRET").unwrap_or_default(),
        redirect_uri: std::env::var("SPOTIFY_REDIRECT_URI")
            .unwrap_or_else(|_| format!("http://localhost:{port}/api/spotify/callback")),
    };
    if !spotify_config.is_configured() {
        tracing::warn!("SPOTIFY_CLIENT_ID/SECRET not set - the Lyrics mode's Spotify connection will return 501 until configured.");
    }

    let race_texts = load_race_texts();
    let app_state = Arc::new(AppState::new(db, cookie_secure, race_texts, spotify_config, frontend_origin.clone()));
    bot_results::spawn(app_state.clone());

    let app = build_app(app_state).layer(cors).layer(TraceLayer::new_for_http());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("typerpunk-server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await?;

    Ok(())
}

// Real HTTP integration tests: each spins up the actual router (build_app,
// the same function main() uses) against an in-memory database on a random
// local port, and drives it with a real reqwest client - exercising the
// full stack (routing, extractors, cookies, JSON) rather than calling
// handler functions directly, which only proves the inner logic works and
// not that the wiring around it does too.
#[cfg(test)]
mod tests {
    use super::*;
    use state::SpotifyConfig;

    async fn spawn_test_server() -> String {
        let db = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory test database");
        sqlx::migrate!("./migrations").run(&db).await.expect("failed to run migrations");

        let app_state = Arc::new(AppState::new(
            db,
            false,
            vec![RaceText {
                text: "The quick brown fox jumps over the lazy dog.".to_string(),
                attribution: None,
            }],
            SpotifyConfig::default(),
            "http://localhost:4173".to_string(),
        ));
        let app = build_app(app_state);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("failed to bind test listener");
        let addr = listener.local_addr().expect("test listener has no local addr");
        tokio::spawn(async move {
            axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.ok();
        });
        format!("http://{addr}")
    }

    fn test_client() -> reqwest::Client {
        reqwest::Client::builder().cookie_store(true).build().expect("failed to build test http client")
    }

    async fn register(client: &reqwest::Client, base: &str, username: &str) {
        let resp = client
            .post(format!("{base}/api/auth/register"))
            .json(&serde_json::json!({ "username": username, "password": "correcthorsebattery1" }))
            .send()
            .await
            .expect("register request failed");
        assert!(resp.status().is_success(), "register failed for {username}: {}", resp.status());
    }

    #[tokio::test]
    async fn mutual_friend_request_accept() {
        let base = spawn_test_server().await;
        let alice = test_client();
        let bob = test_client();
        register(&alice, &base, "alice_friend_test").await;
        register(&bob, &base, "bob_friend_test").await;

        let resp = alice
            .post(format!("{base}/api/friends/request"))
            .json(&serde_json::json!({ "username": "bob_friend_test" }))
            .send()
            .await
            .expect("friend request failed");
        assert!(resp.status().is_success(), "friend request should succeed: {}", resp.status());

        // Bob should see Alice as an incoming request before accepting.
        let bob_list: serde_json::Value =
            bob.get(format!("{base}/api/friends")).send().await.unwrap().json().await.unwrap();
        let incoming = bob_list["incoming_requests"].as_array().expect("incoming_requests missing");
        assert_eq!(incoming.len(), 1, "bob should have exactly one incoming request");
        let friendship_id = incoming[0]["friendship_id"].as_str().expect("friendship_id missing").to_string();
        assert_eq!(incoming[0]["username"], "alice_friend_test");

        let resp = bob.post(format!("{base}/api/friends/{friendship_id}/accept")).send().await.unwrap();
        assert!(resp.status().is_success(), "accept should succeed: {}", resp.status());

        // After accepting, both sides should list each other as an
        // accepted friend, and neither should have any pending requests
        // left over.
        let alice_list: serde_json::Value =
            alice.get(format!("{base}/api/friends")).send().await.unwrap().json().await.unwrap();
        let alice_friends = alice_list["friends"].as_array().unwrap();
        assert_eq!(alice_friends.len(), 1, "alice should have exactly one friend");
        assert_eq!(alice_friends[0]["username"], "bob_friend_test");
        assert!(alice_list["outgoing_requests"].as_array().unwrap().is_empty());

        let bob_list: serde_json::Value =
            bob.get(format!("{base}/api/friends")).send().await.unwrap().json().await.unwrap();
        let bob_friends = bob_list["friends"].as_array().unwrap();
        assert_eq!(bob_friends.len(), 1, "bob should have exactly one friend");
        assert_eq!(bob_friends[0]["username"], "alice_friend_test");
        assert!(bob_list["incoming_requests"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn leaderboard_ranks_by_wpm_descending() {
        let base = spawn_test_server().await;
        let racers = [("leaderboard_low", 40.0), ("leaderboard_high", 95.0), ("leaderboard_mid", 70.0)];

        for (name, wpm) in racers {
            let client = test_client();
            register(&client, &base, name).await;
            let resp = client
                .post(format!("{base}/api/stats"))
                .json(&serde_json::json!({
                    "mode_key": "time-30",
                    "wpm": wpm,
                    "raw_wpm": wpm,
                    "accuracy": 98.0,
                    "time_seconds": 30.0,
                    "device_type": "desktop",
                }))
                .send()
                .await
                .expect("stats submission failed");
            assert!(resp.status().is_success(), "stats submission should succeed for {name}: {}", resp.status());
        }

        let anon = test_client();
        let entries: serde_json::Value = anon
            .get(format!("{base}/api/leaderboard?mode=time-30"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let entries = entries.as_array().expect("leaderboard should return an array");
        assert_eq!(entries.len(), 3, "expected all three submitted results to appear");

        let names: Vec<&str> = entries.iter().map(|e| e["username"].as_str().unwrap()).collect();
        assert_eq!(
            names,
            vec!["leaderboard_high", "leaderboard_mid", "leaderboard_low"],
            "leaderboard should be ordered by wpm descending"
        );
    }
}
