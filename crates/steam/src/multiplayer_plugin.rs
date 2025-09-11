// Bridges the background WebSocket worker in net.rs into Bevy's ECS: applies
// incoming NetEvents to Racer entities every frame, and forwards the local
// racer's (synthetic, see net.rs's module comment) progress out over the
// same connection.
use crate::net::{LocalUpdate, MultiplayerNet, NetEvent};
use crate::racer::{DemoRace, Racer};
use crate::typing::TypingSession;
use bevy::prelude::*;
use std::sync::mpsc::Sender;

fn server_http_base() -> String {
    std::env::var("TYPERPUNK_SERVER_URL").unwrap_or_else(|_| "http://localhost:8787".to_string())
}

fn server_ws_base() -> String {
    // Same host as the HTTP API, just a different scheme - ws:// unless the
    // HTTP base was already secured, in which case wss://.
    let http = server_http_base();
    if let Some(rest) = http.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = http.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        format!("ws://{http}")
    }
}

#[derive(Resource)]
struct NetHandle(MultiplayerNet);

#[derive(Resource)]
struct LocalUpdateSender(Sender<LocalUpdate>);

#[derive(Resource, Default)]
struct LocalPlayerId(Option<String>);

// Without this, send_local_progress would re-send Finish every single frame
// once the local racer reaches 1.0 progress, flooding the connection
// forever instead of announcing it once.
#[derive(Resource, Default)]
struct LocalFinishSent(bool);

/// Tags a Racer entity as backed by a specific server-assigned player id, so
/// incoming PlayerProgress/PlayerFinished events know which entity to
/// update, and PlayerList knows which remote players already have one.
#[derive(Component)]
struct RemotePlayer(String);

pub struct MultiplayerPlugin;

impl Plugin for MultiplayerPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(LocalPlayerId::default())
            .insert_resource(LocalFinishSent::default())
            .add_systems(Startup, connect)
            .add_systems(Update, (poll_events, send_local_progress));
    }
}

fn connect(mut commands: Commands) {
    // A room code passed in means "join this existing room" (e.g. the code
    // a web client printed) - otherwise a fresh room is created and its
    // code logged so a second client can join it to actually see a live
    // race between two real connections.
    let room_code = std::env::var("TYPERPUNK_ROOM_CODE").ok();
    let name = std::env::var("TYPERPUNK_PLAYER_NAME").unwrap_or_else(|_| "Desktop".to_string());
    let (net, update_tx) = MultiplayerNet::spawn(server_http_base(), server_ws_base(), room_code, name);
    commands.insert_resource(NetHandle(net));
    commands.insert_resource(LocalUpdateSender(update_tx));
}

fn poll_events(
    mut commands: Commands,
    net: Res<NetHandle>,
    mut local_id: ResMut<LocalPlayerId>,
    mut typing: ResMut<TypingSession>,
    mut finish_sent: ResMut<LocalFinishSent>,
    mut racers: Query<(&mut Racer, &RemotePlayer)>,
    existing: Query<(Entity, &RemotePlayer)>,
) {
    while let Some(event) = net.0.try_recv() {
        match event {
            NetEvent::RoomCreated { code } => {
                info!("multiplayer room created - join it from the web app with code: {code}");
            }
            NetEvent::Joined { player_id } => {
                info!("joined multiplayer room as player {player_id}");
                local_id.0 = Some(player_id);
            }
            NetEvent::PlayerList(players) => {
                for player in &players {
                    if local_id.0.as_deref() == Some(player.id.as_str()) {
                        continue; // that's us - our own Racer entity already exists
                    }
                    let already_spawned = existing.iter().any(|(_, r)| r.0 == player.id);
                    if !already_spawned {
                        commands.spawn((
                            Racer { name: player.name.clone(), is_local: false, progress: 0.0, wpm: 0.0, accuracy: 100.0, mistakes: 0 },
                            RemotePlayer(player.id.clone()),
                            DemoRace,
                        ));
                    }
                }
                // A player who left the room stops appearing in PlayerList --
                // their racer entity is stale and would otherwise sit frozen
                // on screen forever.
                let current_ids: Vec<&str> = players.iter().map(|p| p.id.as_str()).collect();
                for (entity, remote) in &existing {
                    if !current_ids.contains(&remote.0.as_str()) {
                        commands.entity(entity).despawn();
                    }
                }
            }
            NetEvent::Countdown(seconds) => {
                info!("race starting in {seconds}s");
            }
            NetEvent::Start(text) => {
                info!("race started");
                typing.start(text);
                // A fresh race needs its own Finish announcement - without
                // resetting this, a second race in the same process would
                // never send one, since the guard would still remember the
                // first race's finish.
                finish_sent.0 = false;
            }
            NetEvent::PlayerProgress { player_id, percent, wpm } => {
                for (mut racer, remote) in &mut racers {
                    if remote.0 == player_id {
                        racer.progress = (percent / 100.0).clamp(0.0, 1.0);
                        racer.wpm = wpm;
                    }
                }
            }
            NetEvent::PlayerFinished { player_id, wpm, .. } => {
                for (mut racer, remote) in &mut racers {
                    if remote.0 == player_id {
                        racer.progress = 1.0;
                        racer.wpm = wpm;
                    }
                }
            }
            NetEvent::RoomClosed(reason) => {
                warn!("multiplayer room closed: {reason}");
            }
            NetEvent::Error(message) => {
                warn!("multiplayer error: {message}");
            }
        }
    }
}

fn send_local_progress(
    sender: Res<LocalUpdateSender>,
    mut finish_sent: ResMut<LocalFinishSent>,
    typing: Res<TypingSession>,
    racers: Query<&Racer, With<DemoRace>>,
) {
    // Nothing to report before a race has actually started - sending
    // Progress{0%, 0wpm} on a loop while sitting in the lobby is meaningless
    // and, worse, floods the connection right as the server's Ready handler
    // is mid-countdown holding the room lock (see multiplayer.rs's Ready
    // handler comment on why that hold is intentional).
    if !typing.has_started() {
        return;
    }
    for racer in &racers {
        if !racer.is_local {
            continue;
        }
        if racer.progress >= 1.0 {
            if !finish_sent.0 {
                let _ = sender.0.send(LocalUpdate::Finish { wpm: racer.wpm, accuracy: racer.accuracy, time: 0.0 });
                finish_sent.0 = true;
            }
        } else {
            let _ = sender.0.send(LocalUpdate::Progress { percent: racer.progress * 100.0, wpm: racer.wpm });
        }
    }
}
