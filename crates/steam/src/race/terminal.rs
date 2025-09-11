use super::RaceVisual;
use crate::racer::{DemoRace, Racer};
use bevy::prelude::*;

/// "Terminal Duel" - each runner's line renders like a shell command
/// executing in real time. Cheapest of the three visuals: no sprites, no
/// physics, just text - and it reads as authentically on-brand for a
/// typing game about hacking rather than racing.
pub struct TerminalDuelPlugin;

impl Plugin for TerminalDuelPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(RaceVisual::TerminalDuel), spawn_ui)
            .add_systems(OnExit(RaceVisual::TerminalDuel), despawn_ui)
            .add_systems(
                Update,
                update_lines.run_if(in_state(RaceVisual::TerminalDuel)),
            );
    }
}

#[derive(Component)]
struct TerminalDuelRoot;

#[derive(Component)]
struct TerminalLine(Entity);

fn spawn_ui(mut commands: Commands, racers: Query<(Entity, &Racer), With<DemoRace>>) {
    commands
        .spawn((
            TerminalDuelRoot,
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                row_gap: Val::Px(24.0),
                ..default()
            },
        ))
        .with_children(|parent| {
            for (entity, racer) in &racers {
                parent.spawn((
                    TerminalLine(entity),
                    Text::new(line_for(racer)),
                    TextFont {
                        font_size: bevy::text::FontSize::Px(26.0),
                        ..default()
                    },
                    TextColor(Color::srgb(0.0, 1.0, 0.62)),
                ));
            }
        });
}

fn update_lines(racers: Query<&Racer>, mut lines: Query<(&TerminalLine, &mut Text)>) {
    for (link, mut text) in &mut lines {
        if let Ok(racer) = racers.get(link.0) {
            *text = Text::new(line_for(racer));
        }
    }
}

fn line_for(racer: &Racer) -> String {
    let width = 32;
    let filled = ((racer.progress * width as f32).round() as usize).min(width);
    let bar: String = "#".repeat(filled) + &".".repeat(width - filled);
    format!(
        "{:<8} [{bar}] {:>3.0}% {:>3.0}wpm",
        racer.name,
        racer.progress * 100.0,
        racer.wpm
    )
}

fn despawn_ui(mut commands: Commands, root: Query<Entity, With<TerminalDuelRoot>>) {
    for entity in &root {
        commands.entity(entity).despawn();
    }
}
