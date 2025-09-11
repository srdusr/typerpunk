// Real typing input for the desktop client, replacing the local racer's
// synthetic progress with actual keystrokes against the passage the server
// sent for the current race. Reuses typerpunk_core::game::Game - the same
// correctness/WPM/accuracy engine the wasm/web build runs - instead of
// reimplementing typing-test logic a third time.
use crate::racer::{DemoRace, Racer};
use bevy::input::keyboard::{Key, KeyboardInput};
use bevy::input::ButtonState;
use bevy::prelude::*;
use typerpunk_core::game::Game;

// Bounded the same way the TUI windows its own text rendering - a
// multiplayer passage could in principle be long, and this keeps the
// number of spawned per-character entities sane regardless.
const MAX_VISIBLE_CHARS: usize = 400;

#[derive(Resource, Default)]
pub struct TypingSession {
    game: Option<Game>,
    spans_built: bool,
}

impl TypingSession {
    pub fn start(&mut self, text: String) {
        let mut game = Game::new();
        game.set_text(text);
        game.start();
        self.game = Some(game);
        self.spans_built = false;
    }

    pub fn is_active(&self) -> bool {
        self.game.as_ref().is_some_and(|g| !g.is_finished())
    }

    /// True once a race's Start message has actually arrived - distinct
    /// from is_active(), which also goes false again once finished. Used to
    /// gate outgoing Progress messages: sending them while still sitting in
    /// the lobby is meaningless (there's no race to report progress on) and
    /// floods the connection during the server's countdown at the worst
    /// possible moment (see multiplayer_plugin.rs's send_local_progress).
    pub fn has_started(&self) -> bool {
        self.game.is_some()
    }
}

#[derive(Component)]
struct TypingTextRoot;

#[derive(Component)]
struct TypingCharSpan(usize);

#[derive(Component)]
struct TypingStatsText;

pub struct TypingPlugin;

impl Plugin for TypingPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<TypingSession>()
            .add_systems(Startup, spawn_typing_overlay)
            .add_systems(
                Update,
                (rebuild_spans_on_session_start, handle_keyboard_input, recolor_spans, update_local_racer, update_stats_text).chain(),
            );
    }
}

const CORRECT_COLOR: Color = Color::srgb(0.0, 1.0, 0.62);
const INCORRECT_COLOR: Color = Color::srgb(1.0, 0.3, 0.3);
const PENDING_COLOR: Color = Color::srgb(0.5, 0.5, 0.55);
const CURSOR_COLOR: Color = Color::srgb(1.0, 0.85, 0.2);

fn spawn_typing_overlay(mut commands: Commands) {
    commands.spawn((
        TypingTextRoot,
        Text::new(""),
        TextFont { font_size: bevy::text::FontSize::Px(22.0), ..default() },
        Node {
            position_type: PositionType::Absolute,
            bottom: Val::Px(70.0),
            left: Val::Px(40.0),
            right: Val::Px(40.0),
            ..default()
        },
    ));
    commands.spawn((
        TypingStatsText,
        Text::new(""),
        TextColor(CORRECT_COLOR),
        TextFont { font_size: bevy::text::FontSize::Px(18.0), ..default() },
        Node {
            position_type: PositionType::Absolute,
            bottom: Val::Px(24.0),
            left: Val::Px(40.0),
            ..default()
        },
    ));
}

// Spans are spawned once per race (character identities never change for a
// fixed passage) and only recolored afterward - rebuilding text entities
// every frame would be wasteful for no visual benefit over just updating
// TextColor on the ones that already exist.
fn rebuild_spans_on_session_start(
    mut commands: Commands,
    mut session: ResMut<TypingSession>,
    root: Query<Entity, With<TypingTextRoot>>,
    old_spans: Query<Entity, With<TypingCharSpan>>,
) {
    let has_game = session.game.is_some();
    if !has_game {
        if !old_spans.is_empty() {
            for e in &old_spans {
                commands.entity(e).despawn();
            }
        }
        return;
    }
    if session.spans_built {
        return;
    }
    session.spans_built = true;

    for e in &old_spans {
        commands.entity(e).despawn();
    }

    let Ok(root_entity) = root.single() else { return };
    let text = session.game.as_ref().unwrap().get_text();
    let children: Vec<Entity> = text
        .chars()
        .take(MAX_VISIBLE_CHARS)
        .enumerate()
        .map(|(i, c)| {
            commands
                .spawn((TypingCharSpan(i), TextSpan(c.to_string()), TextColor(PENDING_COLOR), TextFont { font_size: bevy::text::FontSize::Px(22.0), ..default() }))
                .id()
        })
        .collect();
    commands.entity(root_entity).add_children(&children);
}

fn handle_keyboard_input(mut events: MessageReader<KeyboardInput>, mut session: ResMut<TypingSession>) {
    let Some(game) = session.game.as_mut() else {
        events.clear();
        return;
    };
    if game.is_finished() {
        events.clear();
        return;
    }
    for ev in events.read() {
        if ev.state != ButtonState::Pressed {
            continue;
        }
        match &ev.logical_key {
            Key::Character(s) => {
                let mut input = game.get_input();
                input.push_str(s);
                let _ = game.handle_input(&input);
            }
            Key::Space => {
                let mut input = game.get_input();
                input.push(' ');
                let _ = game.handle_input(&input);
            }
            Key::Backspace => {
                let _ = game.handle_backspace(false);
            }
            _ => {}
        }
    }
}

fn recolor_spans(session: Res<TypingSession>, mut spans: Query<(&TypingCharSpan, &mut TextColor)>) {
    let Some(game) = &session.game else { return };
    let input_len = game.get_input().chars().count();
    let errors = game.get_error_positions();
    for (span, mut color) in &mut spans {
        let i = span.0;
        color.0 = if i < input_len {
            if errors.contains(&i) { INCORRECT_COLOR } else { CORRECT_COLOR }
        } else if i == input_len {
            CURSOR_COLOR
        } else {
            PENDING_COLOR
        };
    }
}

fn update_local_racer(session: Res<TypingSession>, mut racers: Query<&mut Racer, With<DemoRace>>) {
    let Some(game) = &session.game else { return };
    let input_len = game.get_input().chars().count() as f32;
    let text_len = (game.get_text().chars().count() as f32).max(1.0);
    let progress = (input_len / text_len).min(1.0);
    let wpm = game.get_wpm() as f32;
    let accuracy = game.get_accuracy() as f32;
    for mut racer in &mut racers {
        if racer.is_local {
            racer.progress = if game.is_finished() { 1.0 } else { progress };
            racer.wpm = wpm;
            racer.accuracy = accuracy;
        }
    }
}

fn update_stats_text(session: Res<TypingSession>, mut text_query: Query<&mut Text, With<TypingStatsText>>) {
    let Ok(mut text) = text_query.single_mut() else { return };
    let Some(game) = &session.game else {
        **text = String::new();
        return;
    };
    let status = if game.is_finished() { " - finished" } else { "" };
    **text = format!("{:.0} wpm  {:.0}% acc{status}", game.get_wpm(), game.get_accuracy());
}
