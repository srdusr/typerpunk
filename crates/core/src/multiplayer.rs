use serde::{Deserialize, Serialize};

// Wire protocol for the multiplayer WebSocket, shared between the server
// (crates/server) and any Rust client that ends up speaking it. The actual
// room/connection logic (registry, matchmaking, idle timeout) lives in
// crates/server - this file only defines the message shapes, so it has no
// tokio/network dependency of its own.

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    /// `device_type` lets the server enforce a room's device-matching
    /// preference (see ServerMessage::Error and the room's device_filter) --
    /// a room created "desktop only" rejects a mobile joiner right here,
    /// before they ever appear in a PlayerList.
    Join { name: String, device_type: String },
    Ready,
    Progress { percent: f32, wpm: f32 },
    Finish { wpm: f32, accuracy: f32, time: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub id: String,
    pub name: String,
    pub ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    /// Sent once, only to the connection that just joined - the only way a
    /// client can tell which entry in PlayerList is itself, since ids are
    /// assigned server-side per connection.
    Joined { player_id: String },
    PlayerList { players: Vec<PlayerInfo> },
    Countdown { seconds: u32 },
    Start { text: String },
    PlayerProgress { player_id: String, percent: f32, wpm: f32 },
    PlayerFinished { player_id: String, wpm: f32, accuracy: f32, time: f32, place: u32 },
    RoomClosed { reason: String },
    Error { message: String },
}
