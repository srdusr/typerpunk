use super::RaceVisual;
use crate::lore;
use crate::racer::{DemoRace, Racer};
use bevy::prelude::*;

/// "Breach Protocol" - each runner chips through a vertical stack of
/// defensive layers ("Wardens") as they type correctly; first to clear
/// their whole stack wins. Doubles as the visual for a hacking-themed mode.
pub struct BreachProtocolPlugin;

const LAYER_COUNT: usize = 8;
const LAYER_SIZE: Vec2 = Vec2::new(140.0, 28.0);
const LAYER_GAP: f32 = 6.0;
const LANE_GAP: f32 = 240.0;

impl Plugin for BreachProtocolPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(RaceVisual::BreachProtocol), spawn_lanes)
            .add_systems(OnExit(RaceVisual::BreachProtocol), despawn_lanes)
            .add_systems(
                Update,
                update_layers.run_if(in_state(RaceVisual::BreachProtocol)),
            );
    }
}

#[derive(Component)]
struct BreachRoot;

#[derive(Component)]
struct WardenLayer {
    racer: Entity,
    index: usize,
}

fn spawn_lanes(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    racers: Query<(Entity, &Racer), With<DemoRace>>,
) {
    let warden_texture: Handle<Image> = asset_server.load("sprites/warden_layer.png");
    let marker_texture: Handle<Image> = asset_server.load("sprites/racer_marker.png");
    let lanes: Vec<_> = racers.iter().collect();
    let start_x = -(LANE_GAP * (lanes.len().max(1) as f32 - 1.0)) / 2.0;

    for (lane_index, (entity, racer)) in lanes.iter().enumerate() {
        let x = start_x + lane_index as f32 * LANE_GAP;
        let stack_top = -200.0 + LAYER_COUNT as f32 * (LAYER_SIZE.y + LAYER_GAP);

        commands.spawn((
            BreachRoot,
            Text2d::new(format!("{} - {}", racer.name, lore::WARDEN_LABEL)),
            TextFont {
                font_size: bevy::text::FontSize::Px(18.0),
                ..default()
            },
            TextColor(Color::srgb(0.6, 0.6, 0.65)),
            Transform::from_xyz(x, stack_top + 20.0, 0.0),
        ));

        // Shared racer marker (see racer.rs's is_local) sits above the
        // local player's own stack, same asset Signal Run uses for the
        // same purpose.
        if racer.is_local {
            commands.spawn((
                BreachRoot,
                Sprite {
                    image: marker_texture.clone(),
                    color: Color::srgb(0.0, 1.0, 0.62),
                    custom_size: Some(Vec2::splat(20.0)),
                    ..default()
                },
                Transform::from_xyz(x, stack_top + 44.0, 0.0),
            ));
        }

        for i in 0..LAYER_COUNT {
            let y = -200.0 + i as f32 * (LAYER_SIZE.y + LAYER_GAP);
            commands.spawn((
                BreachRoot,
                WardenLayer {
                    racer: *entity,
                    index: i,
                },
                Sprite {
                    image: warden_texture.clone(),
                    color: Color::srgb(0.15, 0.15, 0.18),
                    custom_size: Some(LAYER_SIZE),
                    ..default()
                },
                Transform::from_xyz(x, y, 0.0),
            ));
        }
    }
}

fn update_layers(racers: Query<&Racer>, mut layers: Query<(&WardenLayer, &mut Sprite)>) {
    for (layer, mut sprite) in &mut layers {
        if let Ok(racer) = racers.get(layer.racer) {
            let cleared = (racer.progress * LAYER_COUNT as f32).floor() as usize;
            sprite.color = if layer.index < cleared {
                Color::srgb(0.0, 1.0, 0.62)
            } else {
                Color::srgb(0.15, 0.15, 0.18)
            };
        }
    }
}

fn despawn_lanes(mut commands: Commands, root: Query<Entity, With<BreachRoot>>) {
    for entity in &root {
        commands.entity(entity).despawn();
    }
}
