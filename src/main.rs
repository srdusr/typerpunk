// Import necessary crates
use crossterm::{
    event::{self, KeyCode, KeyEvent},
    terminal::{disable_raw_mode, enable_raw_mode},
};
use rand::Rng;
use std::{
    fs,
    io::{self},
    path::Path,
    sync::{Arc, Mutex},
    time::Instant,
};
use tui::{
    backend::{Backend, CrosstermBackend},
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Span, Spans},
    widgets::Paragraph,
    Frame, Terminal,
};

// Define the possible states of the application
#[derive(Debug, Clone, Copy, PartialEq)]
enum State {
    MainMenu,
    TypingGame,
    EndScreen,
}

// Struct to hold the application state
struct App {
    time_taken: u64,
    input_string: String,
    timer: Option<Instant>,
    state: State,
    should_exit: bool,
    sentences: Vec<String>,
    current_sentence_index: usize,
}

impl App {
    // Constructor to create a new instance of the application
    fn new() -> Result<Self, io::Error> {
        let sentences = read_sentences("sentences.txt")?;
        let current_sentence_index = rand::thread_rng().gen_range(0..sentences.len());
        let app = App {
            time_taken: 0,
            input_string: String::new(),
            timer: None,
            state: State::MainMenu,
            should_exit: false,
            sentences,
            current_sentence_index,
        };
        Ok(app)
    }

    // Reset the game to its initial state
    fn reset(&mut self) {
        let current_sentence_index = rand::thread_rng().gen_range(0..self.sentences.len());
        self.current_sentence_index = current_sentence_index;
        self.time_taken = 0;
        self.input_string.clear();
        self.timer = None;
        self.state = State::TypingGame;
    }

    // Get the current sentence the user needs to type
    fn current_sentence(&self) -> &str {
        if let Some(sentence) = self.sentences.get(self.current_sentence_index) {
            sentence
        } else {
            "No sentence available"
        }
    }

    // Start the timer
    fn start_timer(&mut self) {
        if self.timer.is_none() {
            self.timer = Some(Instant::now());
        }
    }

    // Update the timer
    fn update_timer(&mut self) {
        if let Some(timer) = self.timer {
            self.time_taken = timer.elapsed().as_secs();
        }
    }

    // Calculate and return the current typing speed (Words Per Minute)
    fn update_wpm(&self) -> f64 {
        let time_elapsed = self.time_taken as f64;
        if time_elapsed == 0.0 {
            0.0
        } else {
            let wpm = (self.input_string.split_whitespace().count() as f64) / (time_elapsed / 60.0);
            if wpm.is_nan() {
                0.0
            } else {
                wpm
            }
        }
    }
}

// Function to read sentences from a file
fn read_sentences(filename: &str) -> Result<Vec<String>, io::Error> {
    if !Path::new(filename).exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "File not found"));
    }

    let contents = fs::read_to_string(filename)?;
    let sentences: Vec<String> = contents.lines().map(|s| s.to_string()).collect();
    Ok(sentences)
}

// Function to draw the typing game UI
fn draw_typing_game(f: &mut Frame<CrosstermBackend<std::io::Stdout>>, chunk: Rect, app: &mut App) {
    let wpm = app.update_wpm();
    let time_used = app.time_taken as f64;

    let mut colored_text: Vec<Span> = Vec::new();

    // Iterate over each character in the current sentence and color it based on user input
    for (index, c) in app.current_sentence().chars().enumerate() {
        let color = if let Some(input_char) = app.input_string.chars().nth(index) {
            if c == input_char {
                Color::Green
            } else {
                Color::Red
            }
        } else {
            Color::Gray
        };

        let span = Span::styled(c.to_string(), Style::default().fg(color));
        colored_text.push(span);
    }

    // Create text to be displayed
    let text = vec![
        Spans::from(Span::styled(
            "Type the following sentence:",
            Style::default().add_modifier(Modifier::BOLD),
        )),
        colored_text.into(),
        Spans::from(Span::styled(format!("WPM: {:.2}", wpm), Style::default())),
        Spans::from(Span::styled(
            format!("Time: {:.1} seconds", time_used),
            Style::default(),
        )),
    ];

    // Render the widget
    f.render_widget(Paragraph::new(text).alignment(Alignment::Center), chunk);

    app.update_timer();
}

// Function to handle user input events
async fn input_handler(event: KeyEvent, app: &mut App, _event_tx: Arc<Mutex<()>>) {
    match event.code {
        KeyCode::Char(c) => {
            if app.timer.is_none() {
                app.timer = Some(Instant::now());
            }
            app.input_string.push(c);
        }
        KeyCode::Backspace => {
            app.input_string.pop();
        }
        KeyCode::Esc => match app.state {
            State::MainMenu => {
                app.should_exit = true;
            }
            State::TypingGame | State::EndScreen => {
                app.state = State::MainMenu;
                app.input_string.clear();
                app.timer = None;
            }
        },
        KeyCode::Enter => match app.state {
            State::MainMenu => {
                app.state = State::TypingGame;
                app.start_timer();
                app.input_string.clear();
            }
            State::TypingGame => {
                if app.input_string.trim() == app.current_sentence().trim() {
                    app.state = State::EndScreen;
                    app.update_timer();
                }
            }
            State::EndScreen => {
                app.reset();
            }
        },
        _ => {}
    }
}

// Include test module
#[cfg(test)]
mod test;

// Main function
#[tokio::main]
async fn main() -> Result<(), io::Error> {
    // Enable raw mode for terminal input
    enable_raw_mode()?;

    // Create a new instance of the App
    let mut app = App::new().unwrap();

    // Initialize the terminal backend
    let stdout = io::stdout();
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Clear the terminal and hide the cursor
    terminal.clear()?;
    terminal.hide_cursor()?;

    // Main event loop
    loop {
        // Get the terminal size
        if let Ok(size) = terminal.backend().size() {
            // Define layout for the UI
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(2)
                .constraints([
                    Constraint::Min(3),
                    Constraint::Percentage(70),
                    Constraint::Min(3),
                ])
                .split(size);

            // Draw UI based on app state
            terminal.draw(|f| match app.state {
                State::MainMenu => {
                    let main_menu = vec![
                        Spans::from(Span::styled("Welcome to typerpunk!", Style::default())),
                        Spans::from(Span::styled("Press Enter to Start", Style::default())),
                        Spans::from(Span::styled("Press Esc to Quit", Style::default())),
                    ];
                    f.render_widget(
                        Paragraph::new(main_menu).alignment(Alignment::Center),
                        chunks[0],
                    );
                }
                State::TypingGame => {
                    draw_typing_game(f, chunks[1], &mut app);
                }
                State::EndScreen => {
                    let wpm = app.update_wpm();
                    let time_taken = app.time_taken as f64;
                    let end_screen = vec![
                        Spans::from(Span::styled("Game Over!", Style::default())),
                        Spans::from(Span::styled(
                            format!("Words Per Minute: {:.2}", wpm),
                            Style::default(),
                        )),
                        Spans::from(Span::styled(
                            format!("Time Taken: {:.1} seconds", time_taken),
                            Style::default(),
                        )),
                        Spans::from(Span::styled("Press Enter to Play Again", Style::default())),
                        Spans::from(Span::styled("Press Esc to Quit", Style::default())),
                    ];
                    f.render_widget(
                        Paragraph::new(end_screen).alignment(Alignment::Center),
                        chunks[1],
                    );
                }
            })?;

            // Handle input events
            if let event::Event::Key(event) = event::read()? {
                input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
            }

            // Check if the app should exit
            if app.should_exit {
                break;
            }
        }
    }

    // Cleanup: Show cursor, disable raw mode, and clear only the game UI
    terminal.show_cursor()?;
    disable_raw_mode()?;
    let size = terminal.backend().size().unwrap();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(2)
        .constraints([
            Constraint::Min(3),
            Constraint::Percentage(70),
            Constraint::Min(3),
        ])
        .split(size);
    terminal
        .draw(|f| f.render_widget(Paragraph::new("").alignment(Alignment::Center), chunks[1]))?;

    // Manually clear the terminal before exiting
    println!("\x1B[2J\x1B[1;1H");

    Ok(())
}
