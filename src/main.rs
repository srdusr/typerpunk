//use std::io::{self, Stdout};
use std::io::{self, Write};
use std::time::{Duration, Instant};
use rand::prelude::*;
//use rand::{seq::SliceRandom, thread_rng};
use rand::seq::SliceRandom;
use rand::thread_rng;
//use termion::event::Key;
//use termion::input::TermRead;
use crossterm::{
    execute, terminal::{self, ClearType, disable_raw_mode, enable_raw_mode}, event::{Event, KeyCode, KeyEvent}, terminal::size,
    cursor::Hide, cursor::Show, style::{Print, ResetColor, SetBackgroundColor, SetForegroundColor}, 
    terminal::{EnterAlternateScreen, LeaveAlternateScreen}
};
use tui::{
    backend::CrosstermBackend, layout::{Alignment, Constraint, Direction, Layout, Margin, Rect}, 
    style::{Modifier, Color, Style}, widgets::{Block, Borders, BorderType, ListState, Paragraph, Widget, Wrap}, Terminal
//    backend::TermionBackend,
//    symbols::Marker,
//    text::{Span, Spans},
//    terminal::{Frame, Terminal},
};

const PARAGRAPHS: [&str; 3] = [
    "The quick brown fox jumps over the lazy dog.",
    "In the beginning God created the heavens and the earth.",
    "To be, or not to be, that is the question:",
];

enum AppState {
    Playing(GameState),
    Stats(f64, u64),
    Quit,
}

struct GameState {
    paragraph: String,
    user_input: String,
    incorrect_chars: usize,
    difficulty: usize,
    start_time: Instant,
    deleted_chars: usize,
    end_time: Option<Instant>,
    current_index: usize,
}

impl GameState {
    fn new() -> GameState {
        let paragraph = PARAGRAPHS.choose(&mut thread_rng()).unwrap().to_string();
        let difficulty = paragraph.len() / 4;
        GameState {
            paragraph,
            user_input: String::new(),
            incorrect_chars: 0,
            difficulty,
            start_time: Instant::now(),
            deleted_chars: 0,
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
        self.incorrect_chars = 0;
        self.deleted_chars = 0;
        self.start_time = Instant::now();
        self.end_time = None;
        self.current_index = 0;
    }

    fn handle_input(&mut self, c: char) {
        if c == '\u{8}' {
            // Backspace
            if self.user_input.is_empty() {
                self.deleted_chars = 0;
            } else {
                self.user_input.pop();
                self.deleted_chars += 1;
            }
        } else if !c.is_control() {
            // Printable character
            self.user_input.push(c);
            if self.user_input.chars().count() > self.paragraph.chars().count() {
                self.incorrect_chars += 1;
            } else if let (Some(prev_char), Some(curr_char)) = (self.user_input.chars().nth(self.user_input.len() - 2), self.user_input.chars().last()) {
                if prev_char != self.paragraph.chars().nth(self.user_input.len() - 2).unwrap() || curr_char != self.paragraph.chars().nth(self.user_input.len() - 1).unwrap() {
                    self.incorrect_chars += 1;
                }
            }
        }
    }

    fn wpm(&self) -> f64 {
        let elapsed_time = self.elapsed_time().as_secs_f64() / 60.0;
        let cpm = (self.user_input.len() - self.deleted_chars) as f64 / elapsed_time;
        cpm / 5.0
    }

    fn accuracy(&self) -> f64 {
        let total_chars = self.user_input.len().max(self.paragraph.len());
        let correct_chars = self.user_input.chars().zip(self.paragraph.chars()).filter(|&(a, b)| a == b).count();
        (correct_chars as f64 / total_chars as f64) * 100.0
    }

    fn elapsed_time(&self) -> Duration {
        self.start_time.elapsed()
    }

    fn render_widgets<W>(&self, terminal: &mut Terminal<CrosstermBackend<W>>, stats: Option<Duration>) -> Result<(), io::Error> where W: Write {
    //fn render_widgets(&self, terminal: &mut Terminal<CrosstermBackend>, stats: Option<Duration>) -> Result<(), io::Error> {
        // Layout
        let size = terminal.size()?;
        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .margin(5)
            .constraints(
                [
                    Constraint::Length(3), // Title
                    Constraint::Length(3), // Stats
                    Constraint::Min(0),    // Paragraph
                ]
                .as_ref(),
            )
            .split(size);

        // Title
        let title = "Typerpunk";
        let title_widget = Paragraph::new(title)
            .style(Style::default().fg(Color::White))
            .block(Block::default().borders(Borders::ALL));

        // Stats
        let stats_widget = if let Some(duration) = stats {
            let wpm = self.wpm();
            let accuracy = self.accuracy();
            let stats_text = format!("WPM: {:.1} | Accuracy: {:.1}% | Time: {:.0}s", wpm, accuracy, duration.as_secs());
            Paragraph::new(stats_text)
                .style(Style::default().fg(Color::White))
                .block(Block::default().borders(Borders::ALL))
        } else {
            Paragraph::new("")
        };

        // Paragraph
        let ghost_text = self.paragraph.chars().map(|c| if c.is_whitespace() { ' ' } else { '_' }).collect::<String>();
        let user_input = self.user_input.clone();
        let paragraph_text = format!("{}\n{}", ghost_text, user_input);
        let paragraph_widget = Paragraph::new(paragraph_text)
            .style(Style::default().fg(Color::White))
            .block(Block::default().borders(Borders::ALL));

        // Render
        execute!(terminal.backend_mut(), terminal::Clear(ClearType::All))?;
        terminal.draw(|mut f| {
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
                let stats = state.elapsed_time();
                state.render_widgets(&mut terminal, Some(stats))?;
                if let Ok(event) = crossterm::event::read() {
                    match event {
                        crossterm::event::Event::Key(KeyEvent { code: KeyCode::Char(c), .. }) => {
                            state.handle_input(c);
                            if state.check_end_condition() {
                                app_state = AppState::Stats(state.wpm(), state.accuracy() as u64);
                            }
                        },
                        crossterm::event::Event::Key(KeyEvent { code: KeyCode::Enter, .. }) => {
                            state.reset();
                        },
                        crossterm::event::Event::Key(KeyEvent { code: KeyCode::Esc, .. }) => {
                            app_state = AppState::Quit;
                        },
                        _ => {},
                    }
                }
            },
            AppState::Stats(wpm, accuracy) => {
                let stats_text = format!("Your WPM is {:.1} with {:.1}% accuracy!", wpm, accuracy);
                let stats_widget = Paragraph::new(stats_text)
                    .style(Style::default().fg(Color::White))
                    .block(Block::default().borders(Borders::ALL));
                terminal.draw(|f| {
                    let size = f.size();
                    f.render_widget(stats_widget, size);
                })?;
                std::thread::sleep(rng.gen_range(Duration::from_secs(2)..Duration::from_secs(4)));
                app_state = AppState::Playing(GameState::new());
            },
            AppState::Quit => {
                break;
            },
        }
    }

    execute!(terminal.backend_mut(), LeaveAlternateScreen, Show)?;

    Ok(())
}
