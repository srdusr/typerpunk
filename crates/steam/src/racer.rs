use crate::typing::TypingSession;
use bevy::prelude::*;

/// A participant in a race visual. Decoupled from networking on purpose --
/// the three visualizations below only ever read this component, so they
/// work identically whether progress comes from a local typing session, a
/// bot, or the real multiplayer connection.
#[derive(Component, Debug, Clone)]
pub struct Racer {
    pub name: String,
    pub is_local: bool,
    /// 0.0 (start) to 1.0 (finished).
    pub progress: f32,
    pub wpm: f32,
    pub accuracy: f32,
    pub mistakes: u32,
}

/// Marks the set of racer entities that belong to the current demo race, so
/// visualization plugins can query just their own participants.
#[derive(Component)]
pub struct DemoRace;

pub struct DemoProgressPlugin;

impl Plugin for DemoProgressPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_demo_racers)
            .add_systems(Update, drive_demo_progress);
    }
}

fn spawn_demo_racers(mut commands: Commands) {
    // Every other racer on screen comes from multiplayer_plugin.rs, spawned
    // and updated from the actual server. This one is "You" - driven for
    // real by typing.rs once a race is underway (see update_local_racer),
    // and by drive_demo_progress's idle animation before that.
    commands.spawn((
        Racer {
            name: "You".into(),
            is_local: true,
            progress: 0.0,
            wpm: 0.0,
            accuracy: 100.0,
            mistakes: 0,
        },
        DemoRace,
    ));
}

// Idle animation only, for the brief window before a real race has started
// (typing.rs's TypingSession isn't active yet) - once real keystrokes are
// driving the local racer, this backs off so it doesn't fight that.
fn drive_demo_progress(time: Res<Time>, session: Res<TypingSession>, mut racers: Query<&mut Racer, With<DemoRace>>) {
    if session.is_active() {
        return;
    }
    for mut racer in &mut racers {
        if !racer.is_local || racer.progress >= 1.0 {
            continue;
        }
        let base_speed = 0.12;
        racer.progress = (racer.progress + base_speed * time.delta_secs()).min(1.0);
        racer.wpm = 60.0 + (racer.progress * 40.0);
    }
}
