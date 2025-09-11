use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::Span,
    widgets::{Block, Paragraph, Wrap},
    Frame,
};
use ratatui::prelude::{Alignment, Line};

use crate::app::{App, LoginField, State};
use crate::custom_text::{highlight_classes, SynClass};

pub fn draw(f: &mut Frame, app: &App) {
    match app.state {
        State::MainMenu => draw_main_menu(f, app),
        State::CustomTextPrompt => draw_custom_text_prompt(f, app),
        State::TypingGame => draw_typing_game(f, app),
        State::PassiveMode => draw_passive_mode(f, app),
        State::EndScreen => draw_end_screen(f, app),
        State::Login => draw_login(f, app),
        State::Leaderboard => draw_leaderboard(f, app),
        State::Friends => draw_friends(f, app),
        State::MultiplayerLobby => draw_multiplayer_lobby(f, app),
        State::MultiplayerRace => draw_multiplayer_race(f, app),
        State::MultiplayerResults => draw_multiplayer_results(f, app),
    }
}

pub fn draw_main_menu(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mode_label = if app.custom_mode_selected {
        match &app.custom_text {
            Some(ct) => format!("Mode: Custom ({}, {} segment{})", ct.name, ct.chunks.len(), if ct.chunks.len() == 1 { "" } else { "s" }),
            None => "Mode: Custom (not loaded)".to_string(),
        }
    } else if app.words_mode_selected {
        format!("Mode: Words ({})", app.word_count)
    } else if app.time_mode_selected {
        format!("Mode: Time ({}s)", app.time_duration)
    } else {
        let cat = app.selected_category.as_deref().unwrap_or("Random");
        format!("Mode: {}", cat)
    };

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "TYPERPUNK",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
        Line::from(Span::styled(mode_label, Style::default().fg(Color::Cyan))),
        Line::from(Span::from("")),
        Line::from(Span::styled("Start: Enter", Style::default())),
        Line::from(Span::styled("Change Mode: \u{2190} / \u{2192}", Style::default())),
        Line::from(Span::styled("Load Custom Text: c", Style::default())),
    ];

    if app.custom_mode_selected {
        if let Some(ct) = &app.custom_text {
            if ct.timed {
                lines.push(Line::from(Span::styled("Passive Mode: p", Style::default())));
            }
            lines.push(Line::from(Span::styled("Clear Custom Text: x", Style::default())));
        }
    }
    if app.words_mode_selected {
        lines.push(Line::from(Span::styled("Word Count: \u{2191} / \u{2193}", Style::default())));
    }
    if app.time_mode_selected {
        lines.push(Line::from(Span::styled("Time Duration: \u{2191} / \u{2193}", Style::default())));
    }
    lines.push(Line::from(Span::from("")));
    let account_label = match &app.logged_in_username {
        Some(name) => format!("Account: {} (a)", name),
        None => "Sign In: a".to_string(),
    };
    lines.push(Line::from(Span::styled(account_label, Style::default())));
    lines.push(Line::from(Span::styled("Leaderboard: l    Friends: f    Multiplayer: m", Style::default())));
    lines.push(Line::from(Span::styled("Quit: Esc", Style::default())));

    f.render_widget(
        Paragraph::new(lines)
            .alignment(Alignment::Center)
            .block(Block::default()),
        chunks[0],
    );
}

pub fn draw_login(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "ACCOUNT",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
    ];

    if let Some(name) = &app.logged_in_username {
        lines.push(Line::from(Span::styled(format!("Signed in as {}", name), Style::default().fg(Color::Cyan))));
        lines.push(Line::from(Span::from("")));
        lines.push(Line::from(Span::styled("Esc: Back", Style::default())));
    } else {
        let mode_label = if app.login_register_mode { "Register" } else { "Log In" };
        lines.push(Line::from(Span::styled(format!("Mode: {} (Ctrl+R to switch)", mode_label), Style::default().fg(Color::Cyan))));
        lines.push(Line::from(Span::from("")));

        let user_style = if app.login_field == LoginField::Username {
            Style::default().fg(Color::Yellow)
        } else {
            Style::default()
        };
        let pass_style = if app.login_field == LoginField::Password {
            Style::default().fg(Color::Yellow)
        } else {
            Style::default()
        };
        lines.push(Line::from(Span::styled(format!("Username: {}", app.login_username), user_style)));
        lines.push(Line::from(Span::styled(format!("Password: {}", "*".repeat(app.login_password.chars().count())), pass_style)));
        lines.push(Line::from(Span::from("")));

        if app.net_busy {
            lines.push(Line::from(Span::styled("Working...", Style::default().fg(Color::DarkGray))));
        } else if let Some(status) = &app.net_status {
            lines.push(Line::from(Span::styled(status.clone(), Style::default().fg(Color::Red))));
        }
        lines.push(Line::from(Span::from("")));
        lines.push(Line::from(Span::styled("Tab: switch field    Enter: submit    Esc: Cancel", Style::default())));
    }

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center).block(Block::default()),
        chunks[0],
    );
}

pub fn draw_leaderboard(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            format!("LEADERBOARD ({})", app.leaderboard_mode),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
    ];

    if app.net_busy {
        lines.push(Line::from(Span::styled("Loading...", Style::default().fg(Color::DarkGray))));
    } else if let Some(status) = &app.net_status {
        lines.push(Line::from(Span::styled(status.clone(), Style::default().fg(Color::Red))));
    } else if app.leaderboard_entries.is_empty() {
        lines.push(Line::from(Span::styled("No results yet for this mode.", Style::default().fg(Color::DarkGray))));
    } else {
        for (i, row) in app.leaderboard_entries.iter().enumerate() {
            let device = if row.device_type == "mobile" { " [mobile]" } else { "" };
            lines.push(Line::from(Span::styled(
                format!("#{:<3} {:<20} {:>6.1} wpm  {:>5.1}%{}", i + 1, row.username, row.wpm, row.accuracy, device),
                Style::default(),
            )));
        }
    }

    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(Span::styled("r: refresh    Esc: Back", Style::default())));

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Left).block(Block::default()),
        chunks[0],
    );
}

pub fn draw_friends(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "FRIENDS",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
    ];

    if app.logged_in_username.is_none() {
        lines.push(Line::from(Span::styled("Sign in first - press a from the main menu.", Style::default().fg(Color::DarkGray))));
        lines.push(Line::from(Span::from("")));
        lines.push(Line::from(Span::styled("Esc: Back", Style::default())));
        f.render_widget(
            Paragraph::new(lines).alignment(Alignment::Left).block(Block::default()),
            chunks[0],
        );
        return;
    }

    if app.net_busy {
        lines.push(Line::from(Span::styled("Working...", Style::default().fg(Color::DarkGray))));
    } else if let Some(status) = &app.net_status {
        lines.push(Line::from(Span::styled(status.clone(), Style::default().fg(Color::Red))));
    }

    if !app.friends_incoming.is_empty() {
        lines.push(Line::from(Span::styled("Requests (y: accept, d: decline):", Style::default().fg(Color::Cyan))));
        for (i, row) in app.friends_incoming.iter().enumerate() {
            let marker = if i == app.friends_selected { ">" } else { " " };
            lines.push(Line::from(Span::from(format!("{} {}", marker, row.username))));
        }
        lines.push(Line::from(Span::from("")));
    }

    if !app.friends_outgoing.is_empty() {
        lines.push(Line::from(Span::styled("Sent:", Style::default().fg(Color::Cyan))));
        for row in &app.friends_outgoing {
            lines.push(Line::from(Span::from(format!("  {} (pending)", row.username))));
        }
        lines.push(Line::from(Span::from("")));
    }

    lines.push(Line::from(Span::styled("Friends:", Style::default().fg(Color::Cyan))));
    if app.friends_list.is_empty() {
        lines.push(Line::from(Span::styled("  No friends yet.", Style::default().fg(Color::DarkGray))));
    } else {
        for row in &app.friends_list {
            lines.push(Line::from(Span::from(format!("  {}", row.username))));
        }
    }

    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(Span::styled(format!("Add: {}", app.friends_add_input), Style::default().fg(Color::Yellow))));
    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(Span::styled("Type a username, Enter: send request    Esc: Back", Style::default())));

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Left).block(Block::default()),
        chunks[0],
    );
}

pub fn draw_custom_text_prompt(f: &mut Frame, app: &App) {
    let area = f.size();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(area);

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "LOAD CUSTOM TEXT",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
        Line::from(Span::styled(
            "Enter a path to a .txt, .md, code file, .srt/.vtt, or .lrc file:",
            Style::default().fg(Color::Gray),
        )),
        Line::from(Span::from("")),
        Line::from(Span::styled(
            format!("> {}", app.path_input),
            Style::default().fg(Color::Cyan),
        )),
        Line::from(Span::from("")),
    ];

    if let Some(err) = &app.path_error {
        lines.push(Line::from(Span::styled(err.clone(), Style::default().fg(Color::Red))));
        lines.push(Line::from(Span::from("")));
    }

    lines.push(Line::from(Span::styled("Enter: Load    Esc: Cancel", Style::default())));

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center).block(Block::default()),
        chunks[0],
    );
}

// Shared between draw_typing_game and draw_multiplayer_race - both render
// the identical character-by-character correctness coloring against
// app.current_text()/app.input, differing only in surrounding layout (a
// player-progress header above the text in the multiplayer case).
fn build_colored_text(app: &App) -> Vec<Span<'static>> {
    let current_text = app.current_text();
    let text_chars: Vec<char> = current_text.content.chars().collect();
    let input_chars: Vec<char> = app.input.chars().collect();
    let language = if current_text.language.is_empty() { None } else { Some(current_text.language.as_str()) };
    let syntax = highlight_classes(&current_text.content, language);
    let mut colored_text: Vec<Span> = Vec::new();
    let cursor_pos = app.input.len();

    // Long buffers (words/time mode) can run to hundreds of words --
    // centering the whole thing in one wrapped Line would either overflow
    // the screen or collide with the anchored stats row at the bottom.
    // Show a bounded window around the cursor instead, so the view scrolls
    // forward as the typist progresses. This is a no-op for short texts
    // (quotes, custom chunks), since the window is wider than they are.
    // CHARS_AFTER comfortably covers Words mode's largest buffer (100 words,
    // ~585 chars measured) so that mode still shows its whole text upfront
    // exactly as before; only Time mode's much longer buffers actually get
    // windowed down.
    const CHARS_BEFORE: usize = 150;
    const CHARS_AFTER: usize = 620;
    let win_start = cursor_pos.saturating_sub(CHARS_BEFORE);
    let win_end = (cursor_pos + CHARS_AFTER).min(text_chars.len());

    for (i, &c) in text_chars.iter().enumerate().skip(win_start).take(win_end.saturating_sub(win_start)) {
        let style = if i < input_chars.len() {
            if input_chars[i] == c {
                Style::default().fg(Color::Green)
            } else {
                Style::default().fg(Color::Red)
            }
        } else {
            match syntax.get(i).copied().flatten() {
                Some(SynClass::Keyword) => Style::default().fg(Color::Magenta),
                Some(SynClass::StringLit) => Style::default().fg(Color::Yellow),
                Some(SynClass::Comment) => Style::default().fg(Color::DarkGray),
                Some(SynClass::Number) => Style::default().fg(Color::Blue),
                None => Style::default().fg(Color::Gray),
            }
        };
        let span = if i == cursor_pos {
            Span::styled(c.to_string(), style.add_modifier(Modifier::REVERSED))
        } else {
            Span::styled(c.to_string(), style)
        };
        colored_text.push(span);
    }

    if input_chars.len() > text_chars.len() {
        for &c in &input_chars[text_chars.len()..] {
            colored_text.push(Span::styled(c.to_string(), Style::default().fg(Color::Red)));
        }
    }
    colored_text
}

pub fn draw_typing_game(f: &mut Frame, app: &App) {
    let area = f.size();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(area);

    let colored_text = build_colored_text(app);

    let mut lines = Vec::new();
    if app.using_custom {
        if let Some(ct) = &app.custom_text {
            lines.push(Line::from(Span::styled(
                format!("{} \u{b7} segment {}/{}", ct.name, app.custom_index + 1, ct.chunks.len()),
                Style::default().fg(Color::DarkGray),
            )));
        }
    }
    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(colored_text));

    f.render_widget(
        Paragraph::new(lines)
            .alignment(Alignment::Center)
            .block(Block::default())
            .wrap(Wrap { trim: true }),
        chunks[0],
    );

    // Attribution under text
    if !app.current_text().source.is_empty() {
        let att_area = ratatui::layout::Rect {
            x: chunks[0].x,
            y: chunks[0].y.saturating_add(chunks[0].height.saturating_sub(5)),
            width: chunks[0].width,
            height: 2,
        };
        let attribution_line = Line::from(Span::styled(
            format!("- {}", app.current_text().source),
            Style::default().fg(Color::Gray),
        ));
        f.render_widget(
            Paragraph::new(vec![attribution_line])
                .alignment(Alignment::Center)
                .wrap(Wrap { trim: true }),
            att_area,
        );
    }

    // Anchored stats: WPM (left), ACC (right), TIME (bottom center)
    let wpm_rect = ratatui::layout::Rect { x: area.x + 1, y: area.y + area.height.saturating_sub(3), width: 20, height: 3 };
    let acc_rect = ratatui::layout::Rect { x: area.x + area.width.saturating_sub(21), y: area.y + area.height.saturating_sub(3), width: 20, height: 3 };
    let time_rect = ratatui::layout::Rect { x: area.x + area.width / 2 - 10, y: area.y + area.height.saturating_sub(2), width: 20, height: 2 };

    let wpm_widget = Paragraph::new(vec![
        Line::from(Span::styled("WPM", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.0}", app.stats.wpm()),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Left);

    let acc_widget = Paragraph::new(vec![
        Line::from(Span::styled("ACC", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.0}%", app.stats.accuracy()),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Right);

    // Time mode counts down to zero instead of counting up, since the test
    // ends on the clock rather than at the end of the text.
    let time_value = if app.time_mode_selected {
        (app.time_duration as f64 - app.stats.elapsed_time().as_secs_f64()).max(0.0)
    } else {
        app.stats.elapsed_time().as_secs_f64()
    };
    let time_widget = Paragraph::new(vec![
        Line::from(Span::styled("TIME", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.1}", time_value),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Center);

    f.render_widget(wpm_widget, wpm_rect);
    f.render_widget(acc_widget, acc_rect);
    f.render_widget(time_widget, time_rect);
}

pub fn draw_end_screen(f: &mut Frame, app: &App) {
    let area = f.size();
    // We don't render a central RESULTS section to avoid duplication.
    // We only render anchored stats and bottom buttons.

    // Anchored stats at the edges
    let wpm_rect = ratatui::layout::Rect { x: area.x + 1, y: area.y + area.height.saturating_sub(6), width: 20, height: 3 };
    let acc_rect = ratatui::layout::Rect { x: area.x + area.width.saturating_sub(21), y: area.y + area.height.saturating_sub(6), width: 20, height: 3 };
    let time_rect = ratatui::layout::Rect { x: area.x + area.width / 2 - 10, y: area.y + area.height.saturating_sub(5), width: 20, height: 2 };
    let buttons_rect = ratatui::layout::Rect { x: area.x + area.width / 2 - 20, y: area.y + area.height.saturating_sub(2), width: 40, height: 2 };

    let wpm_widget = Paragraph::new(vec![
        Line::from(Span::styled("WPM", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.0}", app.stats.wpm()),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Left);

    let acc_widget = Paragraph::new(vec![
        Line::from(Span::styled("ACC", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.0}%", app.stats.accuracy()),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Right);

    let time_widget = Paragraph::new(vec![
        Line::from(Span::styled("TIME", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.1}", app.stats.elapsed_time().as_secs_f64()),
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
    ])
    .alignment(Alignment::Center);

    let buttons = Paragraph::new(vec![
        Line::from(Span::styled("Enter / Tab: Play Again", Style::default())),
        Line::from(Span::styled("Esc: Main Menu", Style::default())),
    ])
    .alignment(Alignment::Center);

    f.render_widget(wpm_widget, wpm_rect);
    f.render_widget(acc_widget, acc_rect);
    f.render_widget(time_widget, time_rect);
    f.render_widget(buttons, buttons_rect);
}

fn colorize_against(target: &str, typed: &str) -> Vec<Span<'static>> {
    let target_chars: Vec<char> = target.chars().collect();
    let typed_chars: Vec<char> = typed.chars().collect();
    let mut spans = Vec::new();
    for (i, &c) in target_chars.iter().enumerate() {
        let style = if i < typed_chars.len() {
            if typed_chars[i] == c {
                Style::default().fg(Color::Green)
            } else {
                Style::default().fg(Color::Red)
            }
        } else {
            Style::default().fg(Color::Gray)
        };
        spans.push(Span::styled(c.to_string(), style));
    }
    spans
}

pub fn draw_passive_mode(f: &mut Frame, app: &App) {
    let area = f.size();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(area);

    let Some(ct) = &app.custom_text else {
        f.render_widget(
            Paragraph::new("No custom text loaded.").alignment(Alignment::Center),
            chunks[0],
        );
        return;
    };

    let prev = app.passive_active_index.checked_sub(1).and_then(|i| ct.chunks.get(i));
    let active = ct.chunks.get(app.passive_active_index);
    let next = ct.chunks.get(app.passive_active_index + 1);

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            format!("{} \u{b7} passive mode", ct.name),
            Style::default().fg(Color::DarkGray),
        )),
        Line::from(Span::from("")),
    ];

    if let Some(p) = prev {
        lines.push(Line::from(Span::styled(p.content.clone(), Style::default().fg(Color::DarkGray))));
    }
    if let Some(a) = active {
        lines.push(Line::from(colorize_against(&a.content, &app.passive_typed)));
    }
    if let Some(n) = next {
        lines.push(Line::from(Span::styled(n.content.clone(), Style::default().fg(Color::DarkGray))));
    }

    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(Span::styled(
        format!("Accuracy: {:.0}%", app.passive_accuracy()),
        Style::default().fg(Color::Green),
    )));

    if app.passive_done {
        lines.push(Line::from(Span::from("")));
        lines.push(Line::from(Span::styled(
            "Session complete",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(Span::styled(
            format!("{} lines \u{b7} {:.0}% accuracy", ct.chunks.len(), app.passive_accuracy()),
            Style::default().fg(Color::Gray),
        )));
        lines.push(Line::from(Span::styled("Enter / Esc: Back to Menu", Style::default())));
    } else {
        lines.push(Line::from(Span::styled("Esc: Back to Menu", Style::default().fg(Color::Gray))));
    }

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center).wrap(Wrap { trim: true }),
        chunks[0],
    );
}

pub fn draw_multiplayer_lobby(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "MULTIPLAYER",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
    ];

    if let Some(seconds) = app.mp_countdown {
        lines.push(Line::from(Span::styled(format!("Starting in {seconds}..."), Style::default().fg(Color::Cyan))));
        lines.push(Line::from(Span::from("")));
    }

    if let Some(code) = &app.mp_own_room_code {
        lines.push(Line::from(Span::styled(format!("Room code: {code}"), Style::default().fg(Color::Cyan))));
        lines.push(Line::from(Span::styled("Share this code so someone else can join.", Style::default().fg(Color::DarkGray))));
        lines.push(Line::from(Span::from("")));
    }

    if app.mp_local_player_id.is_none() {
        lines.push(Line::from(Span::styled(format!("Join code: {}", app.mp_room_code_input), Style::default().fg(Color::Yellow))));
        lines.push(Line::from(Span::from("")));
    }

    if app.net_busy {
        lines.push(Line::from(Span::styled("Working...", Style::default().fg(Color::DarkGray))));
    } else if let Some(status) = &app.mp_status {
        lines.push(Line::from(Span::styled(status.clone(), Style::default().fg(Color::Red))));
    }

    if !app.mp_players.is_empty() {
        lines.push(Line::from(Span::styled("Players:", Style::default().fg(Color::Cyan))));
        for p in &app.mp_players {
            let is_me = app.mp_local_player_id.as_deref() == Some(p.id.as_str());
            let label = if is_me { format!("{} (you)", p.name) } else { p.name.clone() };
            let ready = if p.ready { "ready" } else { "not ready" };
            lines.push(Line::from(Span::from(format!("  {label} - {ready}"))));
        }
        lines.push(Line::from(Span::from("")));
    }

    let hint = if app.mp_local_player_id.is_some() {
        "r: toggle ready    Esc: Leave"
    } else if app.mp_own_room_code.is_none() {
        "c: Create room    Type a code, Enter: Join    Esc: Back"
    } else {
        "Waiting for someone to join with the code above...    Esc: Back"
    };
    lines.push(Line::from(Span::styled(hint, Style::default())));

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center).block(Block::default()),
        chunks[0],
    );
}

pub fn draw_multiplayer_race(f: &mut Frame, app: &App) {
    let area = f.size();
    let header_height = (app.mp_players.len() as u16).max(1) + 2;
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Length(header_height), Constraint::Min(0)])
        .split(area);

    let mut header_lines = vec![Line::from(Span::styled(
        "RACE IN PROGRESS",
        Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
    ))];
    const BAR_WIDTH: usize = 24;
    for p in &app.mp_players {
        let is_me = app.mp_local_player_id.as_deref() == Some(p.id.as_str());
        let filled = ((p.progress / 100.0 * BAR_WIDTH as f32).round() as usize).min(BAR_WIDTH);
        let bar: String = "#".repeat(filled) + &".".repeat(BAR_WIDTH - filled);
        let label = if is_me { format!("{} (you)", p.name) } else { p.name.clone() };
        let color = if is_me { Color::Green } else { Color::Cyan };
        header_lines.push(Line::from(Span::styled(
            format!("{:<16} [{bar}] {:>3.0}% {:>3.0}wpm", label, p.progress, p.wpm),
            Style::default().fg(color),
        )));
    }
    f.render_widget(Paragraph::new(header_lines).alignment(Alignment::Center), chunks[0]);

    let colored_text = build_colored_text(app);
    f.render_widget(
        Paragraph::new(vec![Line::from(Span::from("")), Line::from(colored_text)])
            .alignment(Alignment::Center)
            .block(Block::default())
            .wrap(Wrap { trim: true }),
        chunks[1],
    );

    let wpm_rect = ratatui::layout::Rect { x: area.x + 1, y: area.y + area.height.saturating_sub(3), width: 20, height: 3 };
    let acc_rect = ratatui::layout::Rect { x: area.x + area.width.saturating_sub(21), y: area.y + area.height.saturating_sub(3), width: 20, height: 3 };
    let wpm_widget = Paragraph::new(vec![
        Line::from(Span::styled("WPM", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(format!("{:.0}", app.stats.wpm()), Style::default().fg(Color::Green).add_modifier(Modifier::BOLD))),
    ]).alignment(Alignment::Left);
    let acc_widget = Paragraph::new(vec![
        Line::from(Span::styled("ACC", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(format!("{:.0}%", app.stats.accuracy()), Style::default().fg(Color::Green).add_modifier(Modifier::BOLD))),
    ]).alignment(Alignment::Right);
    f.render_widget(wpm_widget, wpm_rect);
    f.render_widget(acc_widget, acc_rect);
}

pub fn draw_multiplayer_results(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "RESULTS",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
    ];

    if app.mp_results.is_empty() {
        lines.push(Line::from(Span::styled("Waiting for results...", Style::default().fg(Color::DarkGray))));
    } else {
        for (_id, name, wpm, place) in &app.mp_results {
            lines.push(Line::from(Span::styled(
                format!("#{place}  {name:<16} {wpm:>5.0} wpm"),
                Style::default().fg(Color::Cyan),
            )));
        }
    }

    lines.push(Line::from(Span::from("")));
    lines.push(Line::from(Span::styled("Enter / Esc: Back to Menu", Style::default())));

    f.render_widget(
        Paragraph::new(lines).alignment(Alignment::Center).block(Block::default()),
        chunks[0],
    );
}
