// Real multiplayer networking for the desktop client, replacing racer.rs's
// synthetic two-racer demo driver. Bevy's render loop is synchronous, so (as
// with the TUI's own net.rs) a dedicated OS thread owns a tokio runtime and
// the actual WebSocket connection, bridging to the ECS over plain
// std::sync::mpsc channels polled once per frame.
//
// The local racer's progress is still produced by a synthetic driver (see
// racer::drive_demo_progress) rather than real typing input - this crate
// has no typing UI yet, that's a separate, much larger feature. What's real
// here is the network path itself: the local racer's synthetic progress is
// sent to typerpunk-server over the same protocol the web client uses, and
// every *other* racer on screen is driven entirely by what the server
// actually broadcasts, so two real clients (this one and a browser, or two
// copies of this one) genuinely race against each other's live state.
use futures_util::{SinkExt, StreamExt};
use std::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use typerpunk_core::multiplayer::{ClientMessage, PlayerInfo, ServerMessage};

#[derive(Debug, Clone)]
pub enum NetEvent {
    /// A protocol message this client has no use for. Delivered rather than
    /// dropped so the match on ServerMessage stays exhaustive and adding a
    /// variant is a compile-time prompt rather than a silent parse failure.
    Ignored,
    RoomCreated { code: String },
    Joined { player_id: String },
    PlayerList(Vec<PlayerInfo>),
    Countdown(u32),
    Start(String),
    PlayerProgress { player_id: String, percent: f32, wpm: f32 },
    PlayerFinished { player_id: String, wpm: f32, accuracy: f32, time: f32, place: u32 },
    RoomClosed(String),
    Error(String),
}

#[derive(Debug, Clone)]
pub enum LocalUpdate {
    Progress { percent: f32, wpm: f32 },
    Finish { wpm: f32, accuracy: f32, time: f32 },
}

// std::sync::mpsc::Receiver is Send but not Sync, and Bevy's Resource trait
// requires Sync - a single-slot Mutex around it costs nothing here since
// poll_events is the only reader, called from a single system.
pub struct MultiplayerNet {
    event_rx: std::sync::Mutex<mpsc::Receiver<NetEvent>>,
}

impl MultiplayerNet {
    /// `room_code: None` creates a fresh room and reports its code back via
    /// `NetEvent::RoomCreated` (printed to the terminal by main.rs so a
    /// tester can join it from the web app); `Some(code)` joins an existing
    /// one instead.
    pub fn spawn(http_base: String, ws_base: String, room_code: Option<String>, name: String) -> (Self, mpsc::Sender<LocalUpdate>) {
        let (event_tx, event_rx) = mpsc::channel();
        let (update_tx, update_rx) = mpsc::channel::<LocalUpdate>();

        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("failed to start steam network runtime");
            rt.block_on(run(http_base, ws_base, room_code, name, event_tx, update_rx));
        });

        (Self { event_rx: std::sync::Mutex::new(event_rx) }, update_tx)
    }

    pub fn try_recv(&self) -> Option<NetEvent> {
        self.event_rx.lock().ok()?.try_recv().ok()
    }
}

#[derive(serde::Deserialize)]
struct CreateRoomResponse {
    room_code: String,
}

async fn create_room(http_base: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{http_base}/api/multiplayer/rooms");
    let resp = client.post(&url).send().await.map_err(|e| format!("could not reach server: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("room creation failed ({})", resp.status()));
    }
    resp.json::<CreateRoomResponse>().await.map(|b| b.room_code).map_err(|e| format!("bad response: {e}"))
}

fn to_event(msg: ServerMessage) -> NetEvent {
    match msg {
        ServerMessage::Joined { player_id } => NetEvent::Joined { player_id },
        ServerMessage::PlayerList { players } => NetEvent::PlayerList(players),
        // The passage ahead of the countdown, so a client can show it while
        // players wait. This one does not yet, and Start still carries the
        // text, so it is accepted and ignored rather than dropped as an
        // unparseable message.
        ServerMessage::RaceText { .. } => NetEvent::Ignored,
        ServerMessage::Countdown { seconds } => NetEvent::Countdown(seconds),
        ServerMessage::Start { text } => NetEvent::Start(text),
        ServerMessage::PlayerProgress { player_id, percent, wpm } => NetEvent::PlayerProgress { player_id, percent, wpm },
        ServerMessage::PlayerFinished { player_id, wpm, accuracy, time, place } => {
            NetEvent::PlayerFinished { player_id, wpm, accuracy, time, place }
        }
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
    let _ = send_msg(&mut write, &ClientMessage::Ready).await;

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
            // std::sync::mpsc has no async recv - polled on a short interval
            // instead of a third select branch reading it directly.
            _ = tokio::time::sleep(std::time::Duration::from_millis(200)) => {
                while let Ok(update) = update_rx.try_recv() {
                    let client_msg = match update {
                        LocalUpdate::Progress { percent, wpm } => ClientMessage::Progress { percent, wpm },
                        LocalUpdate::Finish { wpm, accuracy, time } => ClientMessage::Finish { wpm, accuracy, time },
                    };
                    if send_msg(&mut write, &client_msg).await.is_err() { return; }
                }
            }
        }
    }
}
