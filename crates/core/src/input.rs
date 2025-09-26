use crossterm::event::{Event, KeyCode, KeyEvent, KeyModifiers};
use std::time::{Duration, Instant};
use crate::app::App;

#[derive(Debug, Clone)]
pub struct Input {
    pub content: String,
    pub cursor_position: usize,
    pub history: Vec<String>,
    pub history_index: usize,
}

impl Input {
    pub fn new() -> Self {
        Self {
            content: String::new(),
            cursor_position: 0,
            history: Vec::new(),
            history_index: 0,
        }
    }

    pub fn handle_event(&mut self, event: Event) -> bool {
        match event {
            Event::Key(KeyEvent {
                code: KeyCode::Char(c),
                modifiers: KeyModifiers::NONE,
                ..
            }) => {
                if self.cursor_position == self.content.len() {
                    self.content.push(c);
                } else {
                    self.content.insert(self.cursor_position, c);
                }
                self.cursor_position += 1;
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::Backspace,
                ..
            }) => {
                if self.cursor_position > 0 {
                    self.cursor_position -= 1;
                    self.content.remove(self.cursor_position);
                }
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::Delete,
                ..
            }) => {
                if self.cursor_position < self.content.len() {
                    self.content.remove(self.cursor_position);
                }
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::Left,
                ..
            }) => {
                if self.cursor_position > 0 {
                    self.cursor_position -= 1;
                }
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::Right,
                ..
            }) => {
                if self.cursor_position < self.content.len() {
                    self.cursor_position += 1;
                }
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::Home,
                ..
            }) => {
                self.cursor_position = 0;
                true
            }
            Event::Key(KeyEvent {
                code: KeyCode::End,
                ..
            }) => {
                self.cursor_position = self.content.len();
                true
            }
            _ => false,
        }
    }

    pub fn clear(&mut self) {
        if !self.content.is_empty() {
            self.history.push(self.content.clone());
            if self.history.len() > 100 {
                self.history.remove(0);
            }
        }
        self.content.clear();
        self.cursor_position = 0;
        self.history_index = self.history.len();
    }

    pub fn content(&self) -> &str {
        &self.content
    }

    pub fn get_cursor_position(&self) -> usize {
        self.cursor_position
    }

    pub fn move_cursor_left(&mut self) {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
        }
    }

    pub fn move_cursor_right(&mut self) {
        if self.cursor_position < self.content.len() {
            self.cursor_position += 1;
        }
    }

    pub fn move_cursor_to_start(&mut self) {
        self.cursor_position = 0;
    }

    pub fn move_cursor_to_end(&mut self) {
        self.cursor_position = self.content.len();
    }

    pub fn insert_char(&mut self, c: char) {
        if self.cursor_position == self.content.len() {
            self.content.push(c);
        } else {
            self.content.insert(self.cursor_position, c);
        }
        self.cursor_position += 1;
    }

    pub fn delete_char(&mut self) -> bool {
        if self.cursor_position < self.content.len() {
            self.content.remove(self.cursor_position);
            true
        } else {
            false
        }
    }

    pub fn backspace(&mut self) -> bool {
        if self.cursor_position > 0 {
            self.cursor_position -= 1;
            self.content.remove(self.cursor_position);
            true
        } else {
            false
        }
    }
}

impl Default for Input {
    fn default() -> Self {
        Self::new()
    }
}

pub struct InputHandler {
    pub app: App,
    last_tick: Instant,
    tick_rate: Duration,
}

impl InputHandler {
    pub fn new(app: App) -> Self {
        Self {
            app,
            last_tick: Instant::now(),
            tick_rate: Duration::from_millis(100),
        }
    }
} 