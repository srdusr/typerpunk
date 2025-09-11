use bevy::prelude::*;

mod lore;
mod multiplayer_plugin;
mod net;
mod race;
mod racer;
mod typing;

use multiplayer_plugin::MultiplayerPlugin;
use race::{
    breach::BreachProtocolPlugin, signal::SignalRunPlugin, terminal::TerminalDuelPlugin, RaceVisual,
};
use racer::DemoProgressPlugin;
use typing::TypingPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: lore::APP_NAME.to_string(),
                resolution: (1280, 720).into(),
                ..default()
            }),
            ..default()
        }))
        .insert_resource(ClearColor(Color::srgb(0.02, 0.02, 0.03)))
        .init_state::<RaceVisual>()
        .add_plugins(DemoProgressPlugin)
        .add_plugins(MultiplayerPlugin)
        .add_plugins(TypingPlugin)
        .add_plugins(TerminalDuelPlugin)
        .add_plugins(BreachProtocolPlugin)
        .add_plugins(SignalRunPlugin)
        .add_systems(Startup, spawn_camera)
        .add_systems(Update, cycle_visual_on_key)
        .run();
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn(Camera2d);
}

/// Demo-only: press 1/2/3 to switch which race visual is on screen, so all
/// three can be compared side by side before committing to one for real
/// multiplayer. Remove once there's a real mode-select flow.
fn cycle_visual_on_key(keys: Res<ButtonInput<KeyCode>>, mut next: ResMut<NextState<RaceVisual>>) {
    if keys.just_pressed(KeyCode::Digit1) {
        next.set(RaceVisual::TerminalDuel);
    } else if keys.just_pressed(KeyCode::Digit2) {
        next.set(RaceVisual::BreachProtocol);
    } else if keys.just_pressed(KeyCode::Digit3) {
        next.set(RaceVisual::SignalRun);
    }
}
