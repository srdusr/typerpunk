#[cfg(feature = "tui")]
use std::io;

#[cfg(feature = "tui")]
use ratatui::{
    backend::Backend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Span},
    widgets::{Block, Borders, Paragraph, Wrap},
    Frame,
};

#[cfg(feature = "tui")]
use crate::app::App;

#[cfg(feature = "tui")]
use ratatui::prelude::{Line, Alignment};
use crate::app::State;

pub fn draw(f: &mut Frame, app: &App) {
    match app.state {
        State::MainMenu => draw_main_menu(f, app),
        State::TypingGame => draw_typing_game(f, app),
        State::EndScreen => draw_end_screen(f, app),
    }
}

pub fn draw_main_menu(f: &mut Frame, _app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let category_label = {
        let cat = _app.selected_category.as_ref().map(String::as_str).unwrap_or("Random");
        format!("Category: {}  (←/→ to change)", cat)
    };
    let main_menu = vec![
        Line::from(Span::styled("Welcome to Typerpunk!", Style::default().add_modifier(Modifier::BOLD))),
        Line::from(Span::styled(category_label, Style::default().fg(Color::Cyan))),
        Line::from(Span::styled("Press Enter to Start", Style::default())),
        Line::from(Span::styled("Press Esc to Quit", Style::default())),
    ];

    f.render_widget(
        Paragraph::new(main_menu)
            .alignment(Alignment::Center)
            .block(Block::default().borders(Borders::ALL)),
        chunks[0],
    );
}

pub fn draw_typing_game(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([
            Constraint::Length(3), // Stats
            Constraint::Min(0),    // Text
        ])
        .split(f.size());

    // Draw stats
    let stats = vec![
        Line::from(vec![
            Span::styled(format!("WPM: {:.1}", app.stats.wpm()), Style::default().fg(Color::Yellow)),
            Span::styled(" | ", Style::default()),
            Span::styled(format!("Time: {:.1}s", app.stats.elapsed_time().as_secs_f64()), Style::default().fg(Color::Cyan)),
            Span::styled(" | ", Style::default()),
            Span::styled(format!("Accuracy: {:.1}%", app.stats.accuracy()), Style::default().fg(Color::Green)),
        ]),
    ];

    f.render_widget(
        Paragraph::new(stats)
            .alignment(Alignment::Center)
            .block(Block::default().borders(Borders::ALL)),
        chunks[0],
    );

    // Draw text
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

    // Add any remaining incorrect characters
    if input_chars.len() > text_chars.len() {
        for &c in &input_chars[text_chars.len()..] {
            colored_text.push(Span::styled(
                c.to_string(),
                Style::default().fg(Color::Red),
            ));
        }
    }

    let text = vec![
        Line::from(Span::styled(
            "Type the following text:",
            Style::default().add_modifier(Modifier::BOLD),
        )),
        Line::from(colored_text),
    ];

    f.render_widget(
        Paragraph::new(text)
            .alignment(Alignment::Left)
            .block(Block::default().borders(Borders::ALL))
            .wrap(Wrap { trim: true }),
        chunks[1],
    );

    // Render attribution beneath the text box
    let attribution = app.current_text().source.clone();
    if !attribution.is_empty() {
        let area = ratatui::layout::Rect {
            x: chunks[1].x,
            y: chunks[1].y.saturating_add(chunks[1].height.saturating_sub(2)),
            width: chunks[1].width,
            height: 2,
        };
        let attribution_line = Line::from(Span::styled(
            format!("— {}", attribution),
            Style::default().fg(Color::Gray),
        ));
        f.render_widget(
            Paragraph::new(vec![attribution_line])
                .alignment(Alignment::Right)
                .wrap(Wrap { trim: true }),
            area,
        );
    }
}

pub fn draw_end_screen(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([Constraint::Min(0)])
        .split(f.size());

    let end_screen = vec![
        Line::from(Span::styled("Game Over!", Style::default().add_modifier(Modifier::BOLD))),
        Line::from(Span::styled(
            format!("Words Per Minute: {:.1}", app.stats.wpm()),
            Style::default(),
        )),
        Line::from(Span::styled(
            format!("Time Taken: {:.1} seconds", app.stats.elapsed_time().as_secs_f64()),
            Style::default(),
        )),
        Line::from(Span::styled(
            format!("Accuracy: {:.1}%", app.stats.accuracy()),
            Style::default(),
        )),
        Line::from(Span::styled("Press Enter to Play Again", Style::default())),
        Line::from(Span::styled("Press Esc to Quit", Style::default())),
    ];

    f.render_widget(
        Paragraph::new(end_screen)
            .alignment(Alignment::Center)
            .block(Block::default().borders(Borders::ALL)),
        chunks[0],
    );
} 