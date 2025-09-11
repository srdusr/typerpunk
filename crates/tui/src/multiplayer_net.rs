// Real-time WebSocket networking for TUI Multiplayer, alongside net.rs's
// one-shot REST calls (login/leaderboard/friends). Same background-thread
// pattern as crates/steam/src/net.rs (which speaks the identical wire
// protocol against the same server) - a dedicated OS thread owns a tokio
// runtime and the live connection, bridging to the sync render loop over
// plain std::sync::mpsc channels polled once per frame.
use futures_util::{SinkExt, StreamExt};
use std::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use typerpunk_core::multiplayer::{ClientMessage, PlayerInfo, ServerMessage};

#[derive(Debug, Clone)]
pub enum NetEvent {
    RoomCreated { code: String },
    Joined { player_id: String },
    PlayerList(Vec<PlayerInfo>),
    Countdown(u32),
    Start(String),
    PlayerProgress { player_id: String, percent: f32, wpm: f32 },
    PlayerFinished { player_id: String, wpm: f32, place: u32 },
    RoomClosed(String),
    Error(String),
}

#[derive(Debug, Clone)]
pub enum LocalUpdate {
    Ready,
    Progress { percent: f32, wpm: f32 },
    Finish { wpm: f32, accuracy: f32, time: f32 },
}

pub struct MultiplayerConnection {
    event_rx: std::sync::Mutex<mpsc::Receiver<NetEvent>>,
    update_tx: mpsc::Sender<LocalUpdate>,
}

impl MultiplayerConnection {
    /// `room_code: None` creates a fresh room (POSTs to the REST endpoint
    /// first, then connects); `Some(code)` connects straight to that
    /// existing room's WebSocket.
    pub fn spawn(http_base: String, ws_base: String, room_code: Option<String>, name: String) -> Self {
        let (event_tx, event_rx) = mpsc::channel();
        let (update_tx, update_rx) = mpsc::channel::<LocalUpdate>();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("failed to start multiplayer network runtime");
            rt.block_on(run(http_base, ws_base, room_code, name, event_tx, update_rx));
        });

        Self { event_rx: std::sync::Mutex::new(event_rx), update_tx }
    }

    pub fn try_recv(&self) -> Option<NetEvent> {
        self.event_rx.lock().ok()?.try_recv().ok()
    }

    pub fn send(&self, update: LocalUpdate) {
        let _ = self.update_tx.send(update);
    }
}

#[derive(serde::Deserialize)]
struct CreateRoomResponse {
    room_code: String,
}

async fn create_room(http_base: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{http_base}/api/multiplayer/rooms"))
        .send()
        .await
        .map_err(|e| format!("could not reach server: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("room creation failed ({})", resp.status()));
    }
    resp.json::<CreateRoomResponse>().await.map(|b| b.room_code).map_err(|e| format!("bad response: {e}"))
}

fn to_event(msg: ServerMessage) -> NetEvent {
    match msg {
        ServerMessage::Joined { player_id } => NetEvent::Joined { player_id },
        ServerMessage::PlayerList { players } => NetEvent::PlayerList(players),
        ServerMessage::Countdown { seconds } => NetEvent::Countdown(seconds),
        ServerMessage::Start { text } => NetEvent::Start(text),
        ServerMessage::PlayerProgress { player_id, percent, wpm } => NetEvent::PlayerProgress { player_id, percent, wpm },
        ServerMessage::PlayerFinished { player_id, wpm, place, .. } => NetEvent::PlayerFinished { player_id, wpm, place },
        ServerMessage::RoomClosed { reason } => NetEvent::RoomClosed(reason),
        ServerMessage::Error { message } => NetEvent::Error(message),
    }
}

async fn send_msg<S>(write: &mut S, msg: &ClientMessage) -> Result<(), ()>
where
    S: futures_util::Sink<WsMessage> + Unpin,
{
    let text = serde_json::to_string(msg).map_err(|_| ())?;
    write.send(WsMessage::Text(text)).await.map_err(|_| ())
}

async fn run(
    http_base: String,
    ws_base: String,
    room_code: Option<String>,
    name: String,
    event_tx: mpsc::Sender<NetEvent>,
    update_rx: mpsc::Receiver<LocalUpdate>,
) {
    let code = match room_code {
        Some(code) => code,
        None => match create_room(&http_base).await {
            Ok(code) => {
                let _ = event_tx.send(NetEvent::RoomCreated { code: code.clone() });
                code
            }
            Err(err) => {
                let _ = event_tx.send(NetEvent::Error(err));
                return;
            }
        },
    };

    let url = format!("{ws_base}/ws/multiplayer/{code}");
    let (ws_stream, _) = match tokio_tungstenite::connect_async(&url).await {
        Ok(pair) => pair,
        Err(err) => {
            let _ = event_tx.send(NetEvent::Error(format!("connect failed: {err}")));
            return;
        }
    };
    let (mut write, mut read) = ws_stream.split();

    let join = ClientMessage::Join { name, device_type: "desktop".to_string() };
    if send_msg(&mut write, &join).await.is_err() {
        let _ = event_tx.send(NetEvent::Error("failed to send join".to_string()));
        return;
    }

    loop {
        tokio::select! {
            incoming = read.next() => {
                match incoming {
                    Some(Ok(WsMessage::Text(text))) => {
                        if let Ok(msg) = serde_json::from_str::<ServerMessage>(&text) {
                            if event_tx.send(to_event(msg)).is_err() { return; }
                        }
                    }
                    Some(Ok(WsMessage::Close(_))) | None => {
                        let _ = event_tx.send(NetEvent::RoomClosed("connection closed".to_string()));
                        return;
                    }
                    Some(Err(err)) => {
                        let _ = event_tx.send(NetEvent::Error(format!("connection error: {err}")));
                        return;
                    }
                    _ => {}
                }
            }
            // std::sync::mpsc has no async recv - polled on a short
            // interval, same pattern as crates/steam/src/net.rs. Short
            // enough that a manual "r: ready" keypress feels responsive.
            _ = tokio::time::sleep(std::time::Duration::from_millis(80)) => {
                loop {
                    match update_rx.try_recv() {
                        Ok(update) => {
                            let client_msg = match update {
                                LocalUpdate::Ready => ClientMessage::Ready,
                                LocalUpdate::Progress { percent, wpm } => ClientMessage::Progress { percent, wpm },
                                LocalUpdate::Finish { wpm, accuracy, time } => ClientMessage::Finish { wpm, accuracy, time },
                            };
                            if send_msg(&mut write, &client_msg).await.is_err() { return; }
                        }
                        Err(mpsc::TryRecvError::Empty) => break,
                        // main.rs dropped its MultiplayerConnection (left the
                        // room/app) - nothing left to send to, close out
                        // instead of holding the socket open indefinitely.
                        Err(mpsc::TryRecvError::Disconnected) => return,
                    }
                }
            }
        }
    }
}
