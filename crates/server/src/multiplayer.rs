use crate::state::AppState;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Mutex};
use typerpunk_core::multiplayer::{ClientMessage, PlayerInfo, ServerMessage};

// A stalled connection (tab closed without a clean disconnect, laptop went
// to sleep mid-race) otherwise holds its room slot and the room's resources
// forever - there is no other cleanup path. This is a hard requirement
// carried over from the original design note on this module, not a nicety:
// every connection is force-closed after this long with no activity.
const IDLE_TIMEOUT: Duration = Duration::from_secs(60);
const IDLE_CHECK_INTERVAL: Duration = Duration::from_secs(5);
// How many players quick match will pack into one room before opening a new
// one. Joining by code is deliberately not capped by this - a group racing
// each other on a shared code decides its own size; this only bounds the
// rooms quick match hands out to strangers.
const QUICK_MATCH_CAPACITY: usize = 5;
// A brand-new game has nobody in it, and an empty lobby is where a player
// leaves and does not come back. Quick-match rooms fill with bots after a
// short wait so there is always a race to join. They are ordinary room
// members: they appear in the player list, they are typed against, and they
// can be beaten.
const BOT_JOIN_DELAY: Duration = Duration::from_secs(6);
const BOT_TICK: Duration = Duration::from_millis(250);
// Two clearly separated tiers rather than one wide range: a room of bots that
// all land within a few WPM of each other reads as one opponent duplicated,
// and gives a human nothing to place against. A bot takes the tier the room
// does not already have, so two bots are never near each other's pace.
const BOT_SLOW_WPM: (f32, f32) = (34.0, 48.0);
const BOT_FAST_WPM: (f32, f32) = (72.0, 88.0);
// Nobody types perfectly. A bot's accuracy sets both what it reports at the
// finish and how often it stalls mid-race to "correct" itself.
const BOT_MIN_ACCURACY: f32 = 88.0;
const BOT_MAX_ACCURACY: f32 = 99.0;
// How long a correction costs, in ticks.
const BOT_CORRECTION_TICKS: u32 = 2;
const MAX_BOTS_PER_ROOM: usize = 2;
const BOT_NAMES: &[&str] = &[
    "Ghostwire", "NullPointer", "Kanji", "Sable", "Vex", "Orbit", "Static",
    "Halcyon", "Nyx", "Drift", "Ember", "Kilo", "Rune", "Zephyr", "Onyx",
    "Pixel", "Quartz", "Sigil", "Tessa", "Umbra",
];

const ROOM_CODE_CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I - easy to misread aloud

#[derive(Debug, Clone, PartialEq)]
enum RoomStatus {
    Lobby,
    Countdown,
    Racing,
    Finished,
}

pub(crate) struct Player {
    name: String,
    ready: bool,
    sender: mpsc::UnboundedSender<Message>,
    /// Bots have no socket behind `sender`; the receiver is dropped the moment
    /// they are created, so broadcasts to them fail silently and harmlessly.
    is_bot: bool,
    /// Only meaningful for bots: the pace they type at.
    target_wpm: f32,
    /// Only meaningful for bots: the accuracy they finish with.
    target_accuracy: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub(crate) enum DeviceFilter {
    #[default]
    Everyone,
    DesktopOnly,
}

pub(crate) struct Room {
    players: HashMap<String, Player>,
    status: RoomStatus,
    text: Option<String>,
    finish_order: Vec<String>,
    device_filter: DeviceFilter,
    /// Whether the room may be filled with bots while it waits. True only for
    /// quick match: a room you opened to race specific friends must stay
    /// exactly as empty as you left it until they arrive.
    allow_bots: bool,
}

impl Room {
    fn new(device_filter: DeviceFilter) -> Self {
        Self { players: HashMap::new(), status: RoomStatus::Lobby, text: None, finish_order: Vec::new(), device_filter, allow_bots: false }
    }

    fn new_quick_match(device_filter: DeviceFilter) -> Self {
        Self { allow_bots: true, ..Self::new(device_filter) }
    }

    fn human_count(&self) -> usize {
        self.players.values().filter(|p| !p.is_bot).count()
    }
}

pub type RoomRegistry = Arc<dashmap::DashMap<String, Arc<Mutex<Room>>>>;

pub fn new_registry() -> RoomRegistry {
    Arc::new(dashmap::DashMap::new())
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/multiplayer/rooms", post(create_room))
        .route("/api/multiplayer/quickmatch", post(quick_match))
        .route("/api/multiplayer/online", get(online_count))
        .route("/ws/multiplayer/:room_code", get(ws_handler))
}

#[derive(Debug, Serialize)]
struct CreateRoomResponse {
    room_code: String,
}

#[derive(Debug, Deserialize, Default)]
struct CreateRoomRequest {
    /// "desktop_only" to reject mobile joiners at the door; anything else
    /// (including absent) means no restriction.
    #[serde(default)]
    device_filter: Option<String>,
}

fn generate_room_code() -> String {
    let mut rng = rand::thread_rng();
    (0..5).map(|_| ROOM_CODE_CHARS[rng.gen_range(0..ROOM_CODE_CHARS.len())] as char).collect()
}

// Body is optional - a plain POST with no JSON at all (or an empty object)
// is a normal "everyone" room, not a client error.
async fn create_room(State(state): State<Arc<AppState>>, body: Option<Json<CreateRoomRequest>>) -> impl IntoResponse {
    let device_filter = match body.and_then(|b| b.0.device_filter) {
        Some(f) if f == "desktop_only" => DeviceFilter::DesktopOnly,
        _ => DeviceFilter::Everyone,
    };

    let mut code = generate_room_code();
    while state.rooms.contains_key(&code) {
        code = generate_room_code();
    }
    state.rooms.insert(code.clone(), Arc::new(Mutex::new(Room::new(device_filter))));
    Json(CreateRoomResponse { room_code: code })
}

// Auto-matchmaking: drop the caller into whichever room is still open, and
// only create one when none is. This is the path the "Find a Race" button
// uses, so a player never has to see or exchange a room code - codes remain
// for the deliberate "race my friends" case.
//
// try_lock, never lock: a room mid-countdown holds its own lock for the full
// three seconds on purpose (see the Ready handler), and quick match must not
// stall behind that - a room it cannot inspect right now is simply not a
// candidate. Room handles are cloned out of the registry before any locking
// so no DashMap shard guard is ever held while locking a room.
async fn quick_match(State(state): State<Arc<AppState>>, body: Option<Json<CreateRoomRequest>>) -> impl IntoResponse {
    let device_filter = match body.and_then(|b| b.0.device_filter) {
        Some(f) if f == "desktop_only" => DeviceFilter::DesktopOnly,
        _ => DeviceFilter::Everyone,
    };

    let candidates: Vec<(String, Arc<Mutex<Room>>)> =
        state.rooms.iter().map(|e| (e.key().clone(), e.value().clone())).collect();

    for (code, room) in candidates {
        let Ok(room) = room.try_lock() else { continue };
        if room.status == RoomStatus::Lobby
            && room.device_filter == device_filter
            && room.players.len() < QUICK_MATCH_CAPACITY
        {
            return Json(CreateRoomResponse { room_code: code });
        }
    }

    let mut code = generate_room_code();
    while state.rooms.contains_key(&code) {
        code = generate_room_code();
    }
    state.rooms.insert(code.clone(), Arc::new(Mutex::new(Room::new_quick_match(device_filter))));
    Json(CreateRoomResponse { room_code: code })
}

#[derive(Serialize)]
struct OnlineResponse {
    players: usize,
    rooms: usize,
}

// How many people are in multiplayer rooms right now, for the header's live
// counter. Public and unauthenticated - it is a "is anyone around to race"
// signal shown before sign-in, so gating it would defeat the point.
//
// try_lock for the same reason quick_match uses it: a room mid-countdown
// holds its lock, and a counter must never stall a page load. A room that
// cannot be read this instant is skipped rather than waited on, so the figure
// is a lower bound under contention, never a hang.
async fn online_count(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let rooms: Vec<Arc<Mutex<Room>>> = state.rooms.iter().map(|e| e.value().clone()).collect();
    let mut players = 0;
    let mut counted_rooms = 0;
    for room in rooms {
        if let Ok(room) = room.try_lock() {
            players += room.players.len();
            if !room.players.is_empty() {
                counted_rooms += 1;
            }
        }
    }
    Json(OnlineResponse { players, rooms: counted_rooms })
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(room_code): Path<String>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, room_code, state))
}

async fn broadcast(room: &Room, msg: &ServerMessage) {
    let Ok(text) = serde_json::to_string(msg) else { return };
    for player in room.players.values() {
        let _ = player.sender.send(Message::Text(text.clone()));
    }
}

fn player_list(room: &Room) -> ServerMessage {
    ServerMessage::PlayerList {
        players: room.players.iter().map(|(id, p)| PlayerInfo { id: id.clone(), name: p.name.clone(), ready: p.ready }).collect(),
    }
}

async fn handle_socket(socket: WebSocket, room_code: String, state: Arc<AppState>) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let player_id = uuid::Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_tx.send(msg).await.is_err() {
                break;
            }
        }
    });

    let room = state
        .rooms
        .entry(room_code.clone())
        .or_insert_with(|| Arc::new(Mutex::new(Room::new(DeviceFilter::default()))))
        .clone();

    let mut last_activity = Instant::now();
    let mut idle_check = tokio::time::interval(IDLE_CHECK_INTERVAL);

    loop {
        tokio::select! {
            maybe_msg = ws_rx.next() => {
                match maybe_msg {
                    Some(Ok(Message::Text(text))) => {
                        last_activity = Instant::now();
                        if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                            handle_client_message(&room, &room_code, &state, &player_id, &tx, client_msg).await;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            _ = idle_check.tick() => {
                if last_activity.elapsed() > IDLE_TIMEOUT {
                    let _ = tx.send(Message::Close(None));
                    break;
                }
            }
        }
    }

    {
        let mut room_guard = room.lock().await;
        room_guard.players.remove(&player_id);
        if room_guard.players.is_empty() {
            state.rooms.remove(&room_code);
        } else {
            let msg = player_list(&room_guard);
            broadcast(&room_guard, &msg).await;
        }
    }
    send_task.abort();
}

// Runs the countdown and starts the race. Split out of the Ready handler so a
// bot joining a waiting lobby can trigger a start exactly the way a human
// readying up does, and so the room lock is taken per step rather than held
// across the whole three seconds.
async fn start_race(room_arc: Arc<Mutex<Room>>, state: Arc<AppState>) {
    let text = {
        let mut room = room_arc.lock().await;
        // Another caller may have started it in the gap since the check.
        if room.status != RoomStatus::Lobby {
            return;
        }
        room.status = RoomStatus::Countdown;
        let text = state
            .race_texts
            .get(rand::thread_rng().gen_range(0..state.race_texts.len()))
            .cloned()
            .unwrap_or_default();
        room.text = Some(text.clone());
        text
    };

    for seconds in (1..=3).rev() {
        {
            let room = room_arc.lock().await;
            broadcast(&room, &ServerMessage::Countdown { seconds }).await;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    let bots: Vec<(String, f32, f32)> = {
        let mut room = room_arc.lock().await;
        room.status = RoomStatus::Racing;
        broadcast(&room, &ServerMessage::Start { text: text.clone() }).await;
        room.players
            .iter()
            .filter(|(_, p)| p.is_bot)
            .map(|(id, p)| (id.clone(), p.target_wpm, p.target_accuracy))
            .collect()
    };

    let char_count = text.chars().count().max(1);
    for (bot_id, wpm, accuracy) in bots {
        tokio::spawn(drive_bot(room_arc.clone(), bot_id, wpm, accuracy, char_count));
    }
}

// Types on a bot's behalf: converts its target pace into a share of the
// passage completed so far and broadcasts that like any other player's
// progress. Deliberately not perfectly even - a metronome-steady opponent
// reads as obviously fake.
async fn drive_bot(
    room_arc: Arc<Mutex<Room>>,
    bot_id: String,
    target_wpm: f32,
    target_accuracy: f32,
    char_count: usize,
) {
    let started = Instant::now();
    let mut ticker = tokio::time::interval(BOT_TICK);
    // tokio's interval fires once immediately. Consumed here, because that
    // first tick lands with essentially zero elapsed time and the live-WPM
    // division below then reports thousands of words per minute.
    ticker.tick().await;
    // Progress is accumulated rather than recomputed from elapsed time, so a
    // correction genuinely costs the bot ground instead of being erased by the
    // next tick's arithmetic.
    let mut chars_done: f32 = 0.0;
    let mut correcting: u32 = 0;
    // A less accurate bot stumbles more often. At 99% this is near zero; at
    // 88% it is a stumble every few seconds.
    let mistake_chance = ((100.0 - target_accuracy) / 100.0).clamp(0.0, 1.0) * 0.35;

    loop {
        ticker.tick().await;

        if correcting > 0 {
            // Backing up over a mistake: no forward progress this tick.
            correcting -= 1;
        } else {
            if rand::thread_rng().gen_bool(mistake_chance as f64) {
                correcting = BOT_CORRECTION_TICKS;
                // Losing a little of what was typed, the way a real correction does.
                chars_done = (chars_done - target_wpm * 0.08).max(0.0);
            } else {
                // Per-tick pace, wobbled so the line is not a ruler.
                let wobble = 1.0 + (rand::thread_rng().gen_range(-12..=12) as f32 / 100.0);
                chars_done += target_wpm * 5.0 * (BOT_TICK.as_secs_f32() / 60.0) * wobble;
            }
        }

        let percent = ((chars_done / char_count as f32) * 100.0).min(100.0);
        let elapsed = started.elapsed().as_secs_f32();
        // Reported WPM follows what has actually been typed, so a bot that
        // stalled reads slower for a while - exactly as a human would.
        // Floored as well as offset by the consumed first tick: a burst of
        // early progress divided by a near-zero elapsed time is what produced
        // four-figure WPM readings.
        let live_wpm = (chars_done / 5.0) / (elapsed.max(BOT_TICK.as_secs_f32()) / 60.0);

        let mut room = room_arc.lock().await;
        // Stop if the race ended, the room emptied, or this bot was removed.
        if room.status != RoomStatus::Racing || !room.players.contains_key(&bot_id) {
            return;
        }
        if percent >= 100.0 {
            if !room.finish_order.contains(&bot_id) {
                room.finish_order.push(bot_id.clone());
            }
            let place = room.finish_order.len() as u32;
            let msg = ServerMessage::PlayerFinished {
                player_id: bot_id.clone(),
                wpm: live_wpm,
                accuracy: target_accuracy,
                time: elapsed,
                place,
            };
            broadcast(&room, &msg).await;
            if room.finish_order.len() == room.players.len() {
                room.status = RoomStatus::Finished;
            }
            return;
        }
        let msg = ServerMessage::PlayerProgress {
            player_id: bot_id.clone(),
            percent,
            wpm: live_wpm,
        };
        broadcast(&room, &msg).await;
    }
}

// Adds a bot to a quick-match room that is still sitting empty-ish, then
// readies it up - which starts the race through the same path a second human
// would have taken.
async fn maybe_add_bot(room_arc: Arc<Mutex<Room>>, state: Arc<AppState>) {
    tokio::time::sleep(BOT_JOIN_DELAY).await;

    let should_start = {
        let mut room = room_arc.lock().await;
        // Conditions can all have changed during the wait: a real player may
        // have arrived, the race may have started, everyone may have left.
        if !room.allow_bots || room.status != RoomStatus::Lobby || room.human_count() == 0 {
            return;
        }

        // Decided in one pass rather than one bot per call: adding a bot
        // readies it, which starts the race, so a second bot added afterwards
        // would never make it into the lobby.
        let room_for = 1 + MAX_BOTS_PER_ROOM;
        let free = room_for.saturating_sub(room.players.len());
        if free == 0 {
            return;
        }
        let wanted = rand::thread_rng().gen_range(1..=free);

        for _ in 0..wanted {
            let taken: Vec<String> = room.players.values().map(|p| p.name.clone()).collect();
            let available: Vec<&&str> = BOT_NAMES
                .iter()
                .filter(|n| !taken.iter().any(|t| t == *n))
                .collect();
            if available.is_empty() {
                break;
            }
            let name = available[rand::thread_rng().gen_range(0..available.len())];

            // Take whichever tier is not already represented, so the room's
            // bots never sit at similar speeds. With none present, pick at
            // random.
            let has_fast = room
                .players
                .values()
                .any(|p| p.is_bot && p.target_wpm >= BOT_FAST_WPM.0);
            let has_slow = room
                .players
                .values()
                .any(|p| p.is_bot && p.target_wpm <= BOT_SLOW_WPM.1);
            let fast = if has_fast {
                false
            } else if has_slow {
                true
            } else {
                rand::thread_rng().gen_bool(0.5)
            };
            let (lo, hi) = if fast { BOT_FAST_WPM } else { BOT_SLOW_WPM };

            // The receiver is dropped immediately: a bot has no socket, and
            // every send to it fails silently, which is what broadcast expects.
            let (tx, _rx) = mpsc::unbounded_channel();
            let bot_id = format!("bot-{}", generate_room_code().to_lowercase());
            room.players.insert(
                bot_id,
                Player {
                    name: (*name).to_string(),
                    ready: true,
                    sender: tx,
                    is_bot: true,
                    target_wpm: rand::thread_rng().gen_range(lo..hi),
                    target_accuracy: rand::thread_rng().gen_range(BOT_MIN_ACCURACY..BOT_MAX_ACCURACY),
                },
            );
        }

        let list_msg = player_list(&room);
        broadcast(&room, &list_msg).await;

        room.players.len() >= 2 && room.players.values().all(|p| p.ready)
    };

    if should_start {
        start_race(room_arc, state).await;
    }
}

async fn handle_client_message(
    room_arc: &Arc<Mutex<Room>>,
    room_code: &str,
    state: &Arc<AppState>,
    player_id: &str,
    tx: &mpsc::UnboundedSender<Message>,
    msg: ClientMessage,
) {
    let mut room = room_arc.lock().await;
    match msg {
        ClientMessage::Join { name, device_type } => {
            if room.device_filter == DeviceFilter::DesktopOnly && device_type != "desktop" {
                let err = ServerMessage::Error {
                    message: "This room is desktop-only - create or join an \"Everyone\" room from a mobile device.".to_string(),
                };
                if let Ok(text) = serde_json::to_string(&err) {
                    let _ = tx.send(Message::Text(text));
                }
                let _ = tx.send(Message::Close(None));
                return;
            }
            room.players.insert(player_id.to_string(), Player { name, ready: false, sender: tx.clone(), is_bot: false, target_wpm: 0.0, target_accuracy: 0.0 });
            if let Ok(text) = serde_json::to_string(&ServerMessage::Joined { player_id: player_id.to_string() }) {
                let _ = tx.send(Message::Text(text));
            }
            let list_msg = player_list(&room);
            broadcast(&room, &list_msg).await;
            if room.allow_bots && room.status == RoomStatus::Lobby && room.human_count() == 1 {
                tokio::spawn(maybe_add_bot(room_arc.clone(), state.clone()));
            }
        }
        ClientMessage::Ready => {
            if let Some(p) = room.players.get_mut(player_id) {
                p.ready = true;
            }
            let list_msg = player_list(&room);
            broadcast(&room, &list_msg).await;

            // Requires >=2, not just non-empty: "all ready" is vacuously true
            // for a room of one, so without this a player who readies up
            // before anyone else has joined immediately starts (and finishes)
            // a solo race, and a genuine second player joining moments later
            // arrives to a room that already left the lobby. Caught via an
            // actual two-client race where connection timing wasn't
            // simultaneous - exactly the ordinary case over a real network.
            let should_start = room.players.len() >= 2
                && room.players.values().all(|p| p.ready)
                && room.status == RoomStatus::Lobby;
            // The lock is released before the countdown runs. It used to be
            // held for all three seconds as a deliberate synchronisation
            // point, but that also blocked every other client's messages for
            // the duration - which is exactly what reset the desktop client
            // mid-countdown. start_race takes the lock per step instead.
            drop(room);
            if should_start {
                start_race(room_arc.clone(), state.clone()).await;
            }
            return;
        }
        ClientMessage::Progress { percent, wpm } => {
            let msg = ServerMessage::PlayerProgress { player_id: player_id.to_string(), percent, wpm };
            broadcast(&room, &msg).await;
        }
        ClientMessage::Finish { wpm, accuracy, time } => {
            if !room.finish_order.contains(&player_id.to_string()) {
                room.finish_order.push(player_id.to_string());
            }
            let place = room.finish_order.len() as u32;
            let msg = ServerMessage::PlayerFinished { player_id: player_id.to_string(), wpm, accuracy, time, place };
            broadcast(&room, &msg).await;
            if room.finish_order.len() == room.players.len() {
                room.status = RoomStatus::Finished;
            }
        }
    }
    let _ = room_code; // kept for future room-scoped logging/metrics
}
