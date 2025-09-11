use super::RaceVisual;
use crate::racer::{DemoRace, Racer};
use bevy::prelude::*;

/// "Signal Run" - runners are pulses of light traveling along a circuit
/// trace toward a destination node.
pub struct SignalRunPlugin;

const TRACK_START_X: f32 = -500.0;
const TRACK_END_X: f32 = 500.0;
const TRACK_Y: f32 = 0.0;
const LANE_SPACING: f32 = 60.0;

impl Plugin for SignalRunPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(RaceVisual::SignalRun), spawn_pulses)
            .add_systems(OnExit(RaceVisual::SignalRun), despawn_pulses)
            .add_systems(
                Update,
                (draw_track, move_pulses).run_if(in_state(RaceVisual::SignalRun)),
            );
    }
}

#[derive(Component)]
struct SignalEntity;

#[derive(Component)]
struct Pulse {
    racer: Entity,
}

fn lane_y(lane: usize) -> f32 {
    TRACK_Y - lane as f32 * LANE_SPACING
}

fn spawn_pulses(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    racers: Query<(Entity, &Racer), With<DemoRace>>,
) {
    let pulse_texture: Handle<Image> = asset_server.load("sprites/pulse.png");
    let marker_texture: Handle<Image> = asset_server.load("sprites/racer_marker.png");

    for (lane, (entity, racer)) in racers.iter().enumerate() {
        let color = if racer.is_local {
            Color::srgb(0.0, 1.0, 0.62)
        } else {
            Color::srgb(1.0, 0.3, 0.5)
        };
        commands.spawn((
            SignalEntity,
            Pulse { racer: entity },
            Sprite {
                image: pulse_texture.clone(),
                color,
                custom_size: Some(Vec2::splat(22.0)),
                ..default()
            },
            Transform::from_xyz(TRACK_START_X, lane_y(lane), 1.0),
        ));

        // Shared racer marker (see racer.rs's is_local) sits above the
        // local player's lane, on-brand with the same asset the Breach
        // Protocol visual uses for the same purpose.
        if racer.is_local {
            commands.spawn((
                SignalEntity,
                // Tagged with Pulse too, purely so move_pulses (below) keeps
                // its x position tracking the same racer's progress - its
                // spawned y offset above the lane is left untouched since
                // that system only ever writes .x.
                Pulse { racer: entity },
                Sprite {
                    image: marker_texture.clone(),
                    color: Color::srgb(0.0, 1.0, 0.62),
                    custom_size: Some(Vec2::splat(20.0)),
                    ..default()
                },
                Transform::from_xyz(TRACK_START_X, lane_y(lane) + 26.0, 1.0),
            ));
        }
    }
}

fn move_pulses(racers: Query<&Racer>, mut pulses: Query<(&Pulse, &mut Transform)>) {
    for (pulse, mut transform) in &mut pulses {
        if let Ok(racer) = racers.get(pulse.racer) {
            transform.translation.x =
                TRACK_START_X + (TRACK_END_X - TRACK_START_X) * racer.progress;
        }
    }
}

fn draw_track(mut gizmos: Gizmos, racers: Query<&Racer, With<DemoRace>>) {
    for lane in 0..racers.iter().len() {
        let y = lane_y(lane);
        gizmos.line_2d(
            Vec2::new(TRACK_START_X, y),
            Vec2::new(TRACK_END_X, y),
            Color::srgba(0.0, 1.0, 0.62, 0.25),
        );
    }
}

fn despawn_pulses(mut commands: Commands, pulses: Query<Entity, With<SignalEntity>>) {
    for entity in &pulses {
        commands.entity(entity).despawn();
    }
}
