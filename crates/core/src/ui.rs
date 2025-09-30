use ratatui::{
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::Span,
    widgets::{Block, Paragraph, Wrap},
    Frame,
};
use ratatui::prelude::{Alignment, Line};

use crate::app::{App, State};

pub fn draw(f: &mut Frame, app: &App) {
    match app.state {
        State::MainMenu => draw_main_menu(f, app),
        State::TypingGame => draw_typing_game(f, app),
        State::EndScreen => draw_end_screen(f, app),
    }
}

pub fn draw_main_menu(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let category_label = {
        let cat = app
            .selected_category
            .as_ref()
            .map(String::as_str)
            .unwrap_or("Random");
        format!("Category: {}  (\u{2190}/\u{2192} to change)", cat)
    };

    let mut lines: Vec<Line> = vec![
        Line::from(Span::styled(
            "TYPERPUNK",
            Style::default().fg(Color::Green).add_modifier(Modifier::BOLD),
        )),
        Line::from(Span::from("")),
        Line::from(Span::styled(
            category_label,
            Style::default().fg(Color::Cyan),
        )),
        Line::from(Span::from("")),
        Line::from(Span::styled("Start: Enter", Style::default())),
        Line::from(Span::styled(
            "Change Category: \u{2190} / \u{2192}",
            Style::default(),
        )),
        Line::from(Span::styled("Quit: Esc", Style::default())),
    ];

    f.render_widget(
        Paragraph::new(lines)
            .alignment(Alignment::Center)
            .block(Block::default()),
        chunks[0],
    );
}

pub fn draw_typing_game(f: &mut Frame, app: &App) {
    let area = f.size();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([Constraint::Min(0)])
        .split(area);

    // Build colored text
    let text_chars: Vec<char> = app.current_text().content.chars().collect();
    let input_chars: Vec<char> = app.input.chars().collect();
    let mut colored_text: Vec<Span> = Vec::new();
    let cursor_pos = app.input.len();

    for (i, &c) in text_chars.iter().enumerate() {
        let style = if i < input_chars.len() {
            if input_chars[i] == c {
                Style::default().fg(Color::Green)
            } else {
                Style::default().fg(Color::Red)
            }
        } else {
            Style::default().fg(Color::Gray)
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

    let lines = vec![Line::from(Span::from("")), Line::from(colored_text)];

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
            format!("— {}", app.current_text().source),
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

    let time_widget = Paragraph::new(vec![
        Line::from(Span::styled("TIME", Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            format!("{:.1}", app.stats.elapsed_time().as_secs_f64()),
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
        Line::from(Span::styled("Enter: Play Again", Style::default())),
        Line::from(Span::styled("Esc: Main Menu", Style::default())),
    ])
    .alignment(Alignment::Center);

    f.render_widget(wpm_widget, wpm_rect);
    f.render_widget(acc_widget, acc_rect);
    f.render_widget(time_widget, time_rect);
    f.render_widget(buttons, buttons_rect);
}
