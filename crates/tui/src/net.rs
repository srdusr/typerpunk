// Background network worker for the TUI. The render loop in main.rs is a
// plain synchronous 60fps loop (see run_app) - rather than restructure that
// into async, a dedicated OS thread owns its own tokio runtime and a small
// reqwest client, communicating over plain std::sync::mpsc channels. The
// main loop sends a Job after each keypress that queues one, and polls
// try_recv() once per frame to apply whatever came back.
use crate::config_file::server_url;
use serde::Deserialize;
use std::sync::mpsc;
use typerpunk_core::app::{FriendRow, LeaderboardRow, NetworkAction};

pub enum NetResponse {
    LoginOk { username: String, token: Option<String> },
    Error(String),
    Leaderboard(Vec<LeaderboardRow>),
    Friends { list: Vec<FriendRow>, incoming: Vec<FriendRow>, outgoing: Vec<FriendRow> },
}

struct Job {
    action: NetworkAction,
    token: Option<String>,
}

pub struct NetClient {
    tx: mpsc::Sender<Job>,
    rx: mpsc::Receiver<NetResponse>,
}

impl NetClient {
    pub fn spawn() -> Self {
        let (job_tx, job_rx) = mpsc::channel::<Job>();
        let (resp_tx, resp_rx) = mpsc::channel::<NetResponse>();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("failed to start TUI network runtime");
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("failed to build http client");
            let base = server_url();

            while let Ok(job) = job_rx.recv() {
                let response = rt.block_on(run_job(&client, &base, job));
                if resp_tx.send(response).is_err() {
                    break; // main loop is gone
                }
            }
        });

        Self { tx: job_tx, rx: resp_rx }
    }

    pub fn send(&self, action: NetworkAction, token: Option<String>) {
        let _ = self.tx.send(Job { action, token });
    }

    pub fn try_recv(&self) -> Option<NetResponse> {
        self.rx.try_recv().ok()
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: String,
}

async fn error_message(resp: reqwest::Response) -> String {
    let status = resp.status();
    match resp.json::<ErrorBody>().await {
        Ok(body) => body.error,
        Err(_) => format!("request failed ({status})"),
    }
}

#[derive(Deserialize)]
struct UserView {
    username: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    token: String,
    user: UserView,
}

async fn run_job(client: &reqwest::Client, base: &str, job: Job) -> NetResponse {
    match job.action {
        NetworkAction::Login { username, password } => login(client, base, &username, &password).await,
        NetworkAction::Register { username, password } => {
            let register_url = format!("{base}/api/auth/register");
            match client.post(&register_url).json(&serde_json::json!({ "username": username, "password": password })).send().await {
                Ok(resp) if resp.status().is_success() => login(client, base, &username, &password).await,
                Ok(resp) => NetResponse::Error(error_message(resp).await),
                Err(err) => NetResponse::Error(format!("network error: {err}")),
            }
        }
        NetworkAction::FetchLeaderboard { mode } => {
            let url = format!("{base}/api/leaderboard?mode={mode}");
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => match resp.json::<Vec<LeaderboardRow>>().await {
                    Ok(rows) => NetResponse::Leaderboard(rows),
                    Err(err) => NetResponse::Error(format!("bad response: {err}")),
                },
                Ok(resp) => NetResponse::Error(error_message(resp).await),
                Err(err) => NetResponse::Error(format!("network error: {err}")),
            }
        }
        NetworkAction::FetchFriends => fetch_friends(client, base, job.token.as_deref()).await,
        NetworkAction::SendFriendRequest { username } => {
            let Some(token) = job.token.as_deref() else { return NetResponse::Error("not signed in".to_string()) };
            let url = format!("{base}/api/friends/request");
            match client.post(&url).bearer_auth(token).json(&serde_json::json!({ "username": username })).send().await {
                Ok(resp) if resp.status().is_success() => fetch_friends(client, base, Some(token)).await,
                Ok(resp) => NetResponse::Error(error_message(resp).await),
                Err(err) => NetResponse::Error(format!("network error: {err}")),
            }
        }
        NetworkAction::AcceptFriendRequest { id } => {
            let Some(token) = job.token.as_deref() else { return NetResponse::Error("not signed in".to_string()) };
            let url = format!("{base}/api/friends/{id}/accept");
            match client.post(&url).bearer_auth(token).send().await {
                Ok(resp) if resp.status().is_success() => fetch_friends(client, base, Some(token)).await,
                Ok(resp) => NetResponse::Error(error_message(resp).await),
                Err(err) => NetResponse::Error(format!("network error: {err}")),
            }
        }
        NetworkAction::RemoveFriendship { id } => {
            let Some(token) = job.token.as_deref() else { return NetResponse::Error("not signed in".to_string()) };
            let url = format!("{base}/api/friends/{id}");
            match client.delete(&url).bearer_auth(token).send().await {
                Ok(resp) if resp.status().is_success() => fetch_friends(client, base, Some(token)).await,
                Ok(resp) => NetResponse::Error(error_message(resp).await),
                Err(err) => NetResponse::Error(format!("network error: {err}")),
            }
        }
        // Handled entirely by main.rs's own MultiplayerConnection instead
        // (a persistent WebSocket, not a one-shot REST job) - these never
        // actually reach this worker; this arm only exists so the match
        // stays exhaustive over the shared NetworkAction enum.
        NetworkAction::CreateMultiplayerRoom | NetworkAction::JoinMultiplayerRoom { .. } | NetworkAction::MultiplayerReady => {
            NetResponse::Error("multiplayer action sent to the wrong network worker".to_string())
        }
    }
}

async fn login(client: &reqwest::Client, base: &str, username: &str, password: &str) -> NetResponse {
    let url = format!("{base}/api/auth/token");
    match client.post(&url).json(&serde_json::json!({ "username": username, "password": password })).send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<TokenResponse>().await {
            Ok(body) => NetResponse::LoginOk { username: body.user.username, token: Some(body.token) },
            Err(err) => NetResponse::Error(format!("bad response: {err}")),
        },
        Ok(resp) => NetResponse::Error(error_message(resp).await),
        Err(err) => NetResponse::Error(format!("network error: {err}")),
    }
}

#[derive(Deserialize)]
struct FriendEntry {
    friendship_id: String,
    username: String,
}

#[derive(Deserialize)]
struct FriendsListBody {
    friends: Vec<FriendEntry>,
    incoming_requests: Vec<FriendEntry>,
    outgoing_requests: Vec<FriendEntry>,
}

fn to_rows(entries: Vec<FriendEntry>) -> Vec<FriendRow> {
    entries.into_iter().map(|e| FriendRow { friendship_id: e.friendship_id, username: e.username }).collect()
}

async fn fetch_friends(client: &reqwest::Client, base: &str, token: Option<&str>) -> NetResponse {
    let Some(token) = token else { return NetResponse::Error("not signed in".to_string()) };
    let url = format!("{base}/api/friends");
    match client.get(&url).bearer_auth(token).send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<FriendsListBody>().await {
            Ok(body) => NetResponse::Friends {
                list: to_rows(body.friends),
                incoming: to_rows(body.incoming_requests),
                outgoing: to_rows(body.outgoing_requests),
            },
            Err(err) => NetResponse::Error(format!("bad response: {err}")),
        },
        Ok(resp) => NetResponse::Error(error_message(resp).await),
        Err(err) => NetResponse::Error(format!("network error: {err}")),
    }
}
