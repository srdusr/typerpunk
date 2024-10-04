use crossterm::{
    cursor::{Hide, Show},
    event::{Event, KeyCode, KeyEvent},
    execute,
    terminal::{self, EnterAlternateScreen, LeaveAlternateScreen},
};
use rand::prelude::*;
use std::io::{self, Write};
use std::time::{Duration, Instant};
use tui::{
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Style},
    widgets::{Block, Borders, Paragraph},
    Terminal,
};

const PARAGRAPHS: [&str; 3] = [
    "The quick brown fox jumps over the lazy dog.",
    "In the beginning God created the heavens and the earth.",
    "To be, or not to be, that is the question:",
];

struct GameState {
    paragraph: String,
    user_input: String,
    start_time: Instant,
    end_time: Option<Instant>,
    current_index: usize,
}

enum AppState {
    Playing(GameState),
    Stats(f64, u64),
    Quit,
}

impl GameState {
    fn new() -> GameState {
        let paragraph = PARAGRAPHS.choose(&mut thread_rng()).unwrap().to_string();
        GameState {
            paragraph,
            user_input: String::new(),
            start_time: Instant::now(),
            end_time: None,
            current_index: 0,
        }
    }

    fn input(&mut self, c: char) {
        if self.current_index < self.paragraph.len() {
            self.user_input.push(c);
            self.current_index += 1;
        }
    }

    fn check_end_condition(&mut self) -> bool {
        if self.current_index == self.paragraph.len() {
            self.end_time = Some(Instant::now());
            return true;
        }
        false
    }

    fn reset(&mut self) {
        self.user_input.clear();
        self.start_time = Instant::now();
        self.end_time = None;
        self.current_index = 0;
    }

    fn handle_input(&mut self, c: char) {
        if !c.is_control() {
            if self.current_index < self.paragraph.len() {
                if self.paragraph.chars().nth(self.current_index).unwrap() != c {
                    // Incorrect character
                }
                self.input(c);
            }
        }
    }

    fn wpm(&self) -> f64 {
        let elapsed_time = self.elapsed_time().as_secs_f64() / 60.0;
        let cpm = (self.user_input.len()) as f64 / elapsed_time;
        cpm / 5.0
    }

    fn accuracy(&self) -> f64 {
        let total_chars = self.user_input.len();
        let correct_chars = self
            .user_input
            .chars()
            .zip(self.paragraph.chars())
            .filter(|&(a, b)| a == b)
            .count();
        (correct_chars as f64 / total_chars as f64) * 100.0
    }

    fn elapsed_time(&self) -> Duration {
        match self.end_time {
            Some(end) => end - self.start_time,
            None => self.start_time.elapsed(),
        }
    }

    fn render_widgets(
        &self,
        terminal: &mut Terminal<CrosstermBackend<impl Write>>,
    ) -> Result<(), io::Error> {
        terminal.draw(|mut f| {
            let size = f.size();
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(5)
                .constraints(
                    [
                        Constraint::Percentage(10),
                        Constraint::Percentage(10),
                        Constraint::Percentage(80),
                    ]
                    .as_ref(),
                )
                .split(size);

            // Title
            let title = "Typerpunk";
            let title_widget = Paragraph::new(title)
                .style(Style::default().fg(Color::White))
                .alignment(Alignment::Center)
                .block(Block::default().borders(Borders::ALL));

            // Stats
            let stats_text = format!(
                "WPM: {:.1} | Accuracy: {:.1}% | Time: {:.0}s",
                self.wpm(),
                self.accuracy(),
                self.elapsed_time().as_secs()
            );
            let stats_widget = Paragraph::new(stats_text)
                .style(Style::default().fg(Color::White))
                .alignment(Alignment::Center)
                .block(Block::default().borders(Borders::ALL));

            // Paragraph
            let paragraph_text = format!(
                "{}\n{}",
                self.paragraph,
                self.user_input
                    .chars()
                    .map(|c| if c.is_whitespace() { ' ' } else { '_' })
                    .collect::<String>()
            );
            let paragraph_widget = Paragraph::new(paragraph_text)
                .style(Style::default().fg(Color::White))
                .alignment(Alignment::Center)
                .block(Block::default().borders(Borders::ALL));

            f.render_widget(title_widget, chunks[0]);
            f.render_widget(stats_widget, chunks[1]);
            f.render_widget(paragraph_widget, chunks[2]);
        })?;
        Ok(())
    }
}

fn main() -> Result<(), io::Error> {
    let stdout = io::stdout();
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    execute!(terminal.backend_mut(), EnterAlternateScreen, Hide)?;

    let mut app_state = AppState::Playing(GameState::new());
    let mut rng = thread_rng();
    loop {
        match app_state {
            AppState::Playing(ref mut state) => {
                state.render_widgets(&mut terminal)?;
                if let Ok(event) = crossterm::event::read() {
                    match event {
                        Event::Key(KeyEvent {
                            code: KeyCode::Char(c),
                            ..
                        }) => {
                            state.handle_input(c);
                            if state.check_end_condition() {
                                app_state = AppState::Stats(state.wpm(), state.accuracy() as u64);
                            }
                        }
                        Event::Key(KeyEvent {
                            code: KeyCode::Enter,
                            ..
                        }) => {
                            state.reset();
                        }
                        Event::Key(KeyEvent {
                            code: KeyCode::Esc, ..
                        }) => {
                            app_state = AppState::Quit;
                        }
                        _ => {}
                    }
                }
            }
            AppState::Stats(wpm, accuracy) => {
                let stats_text = format!("Your WPM is {:.1} with {:.1}% accuracy!", wpm, accuracy);
                let stats_widget = Paragraph::new(stats_text)
                    .style(Style::default().fg(Color::White))
                    .alignment(Alignment::Center)
                    .block(Block::default().borders(Borders::ALL));
                terminal.draw(|f| {
                    let size = f.size();
                    f.render_widget(stats_widget, size);
                })?;
                std::thread::sleep(rng.gen_range(Duration::from_secs(2)..Duration::from_secs(4)));
                app_state = AppState::Playing(GameState::new());
            }
            AppState::Quit => {
                break;
            }
        }
    }

    execute!(terminal.backend_mut(), LeaveAlternateScreen, Show)?;

    Ok(())
}
