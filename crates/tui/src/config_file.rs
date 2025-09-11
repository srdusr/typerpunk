// Local config file for the TUI's account state - a saved personal-access
// token, not a browser cookie, since a terminal app has no cookie jar.
// Lives at the OS config dir so it survives between runs the same way any
// other CLI tool's saved credentials would.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthConfig {
    pub token: Option<String>,
    pub username: Option<String>,
}

fn config_path() -> Option<PathBuf> {
    let mut dir = dirs::config_dir()?;
    dir.push("typerpunk");
    Some(dir.join("cli_auth.json"))
}

pub fn load() -> AuthConfig {
    let Some(path) = config_path() else { return AuthConfig::default() };
    let Ok(raw) = std::fs::read_to_string(&path) else { return AuthConfig::default() };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save(config: &AuthConfig) {
    let Some(path) = config_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = std::fs::write(&path, json);
    }
}

pub fn server_url() -> String {
    std::env::var("TYPERPUNK_SERVER_URL").unwrap_or_else(|_| "http://localhost:8787".to_string())
}

/// Same host as server_url(), just ws:// (or wss:// if the HTTP base was
/// already secured) instead of http(s):// - for the multiplayer WebSocket.
pub fn server_ws_url() -> String {
    let http = server_url();
    if let Some(rest) = http.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = http.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        format!("ws://{http}")
    }
}
