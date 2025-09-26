use rand::Rng;
use crossterm::event::KeyEvent;
use crate::{
    config::Config,
    stats::Stats,
    text::Text,
};
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq)]
pub enum State {
    MainMenu,
    TypingGame,
    EndScreen,
}

pub struct App {
    pub config: Config,
    pub texts: Vec<Text>,
    pub categories: Vec<String>,
    pub selected_category: Option<String>, // None = Random
    pub stats: Stats,
    pub input: String,
    pub current_text_index: usize,
    pub should_exit: bool,
    pub state: State,
}

impl App {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config = Config::new();
        #[derive(Deserialize)]
        struct RawText { category: String, content: String, attribution: String }
        // texts.json is stored at repository root; this file is at crates/core/src/app.rs
        const RAW_TEXTS: &str = include_str!("../../../texts.json");
        let parsed: Vec<RawText> = serde_json::from_str(RAW_TEXTS)?;
        let texts: Vec<Text> = parsed
            .into_iter()
            .map(|t| Text {
                content: t.content,
                source: t.attribution,
                language: "en".to_string(),
                category: t.category,
            })
            .collect();
        let stats = Stats::new();
        let input = String::new();
        let categories = {
            let mut set = std::collections::BTreeSet::new();
            for t in &texts { if !t.category.is_empty() { set.insert(t.category.clone()); } }
            set.into_iter().collect::<Vec<_>>()
        };
        let current_text_index = if texts.is_empty() { 0 } else { rand::thread_rng().gen_range(0..texts.len()) };
        let should_exit = false;
        let state = State::MainMenu;

        Ok(App {
            config,
            texts,
            categories,
            selected_category: None,
            stats,
            input,
            current_text_index,
            should_exit,
            state,
        })
    }

    pub fn new_with_config(config: Config) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        #[derive(Deserialize)]
        struct RawText { category: String, content: String, attribution: String }
        const RAW_TEXTS: &str = include_str!("../../../texts.json");
        let parsed: Vec<RawText> = serde_json::from_str(RAW_TEXTS)?;
        let texts: Vec<Text> = parsed
            .into_iter()
            .map(|t| Text {
                content: t.content,
                source: t.attribution,
                language: "en".to_string(),
                category: t.category,
            })
            .collect();
        let categories = {
            let mut set = std::collections::BTreeSet::new();
            for t in &texts { if !t.category.is_empty() { set.insert(t.category.clone()); } }
            set.into_iter().collect::<Vec<_>>()
        };
        let current_text_index = if texts.is_empty() { 0 } else { rand::thread_rng().gen_range(0..texts.len()) };
        Ok(Self {
            state: State::MainMenu,
            should_exit: false,
            input: String::new(),
            texts,
            categories,
            selected_category: None,
            current_text_index,
            stats: Stats::new(),
            config,
        })
    }

    pub fn reset(&mut self) {
        self.input.clear();
        self.stats.reset();
        self.current_text_index = self.pick_random_index();
    }

    fn pick_random_index(&self) -> usize {
        if self.texts.is_empty() { return 0; }
        let pool: Vec<usize> = match &self.selected_category {
            Some(cat) => self.texts.iter().enumerate().filter(|(_, t)| &t.category == cat).map(|(i, _)| i).collect(),
            None => (0..self.texts.len()).collect(),
        };
        if pool.is_empty() { return 0; }
        let idx = rand::thread_rng().gen_range(0..pool.len());
        pool[idx]
    }

    pub fn handle_input(&mut self, key: KeyEvent) {
        match self.state {
            State::MainMenu => {
                match key.code {
                    crossterm::event::KeyCode::Enter => {
                        self.state = State::TypingGame;
                        self.reset();
                    }
                    crossterm::event::KeyCode::Left => {
                        // cycle category backwards (None -> last)
                        if self.categories.is_empty() {
                            self.selected_category = None;
                        } else {
                            match &self.selected_category {
                                None => self.selected_category = Some(self.categories.last().unwrap().clone()),
                                Some(cur) => {
                                    let pos = self.categories.iter().position(|c| c == cur).unwrap_or(0);
                                    if pos == 0 { self.selected_category = None; } else { self.selected_category = Some(self.categories[pos-1].clone()); }
                                }
                            }
                        }
                    }
                    crossterm::event::KeyCode::Right => {
                        // cycle category forwards (None -> first)
                        if self.categories.is_empty() {
                            self.selected_category = None;
                        } else {
                            match &self.selected_category {
                                None => self.selected_category = Some(self.categories[0].clone()),
                                Some(cur) => {
                                    let pos = self.categories.iter().position(|c| c == cur).unwrap_or(0);
                                    if pos + 1 >= self.categories.len() { self.selected_category = None; } else { self.selected_category = Some(self.categories[pos+1].clone()); }
                                }
                            }
                        }
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.should_exit = true;
                    }
                    _ => {}
                }
            }
            State::TypingGame => {
                match key.code {
                    crossterm::event::KeyCode::Char(c) => {
                        if !self.stats.is_running() {
                            self.stats.start();
                        }
                        self.input.push(c);
                        self.update_stats();
                    }
                    crossterm::event::KeyCode::Backspace => {
                        self.input.pop();
                        self.update_stats();
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.state = State::MainMenu;
                        self.reset();
                    }
                    _ => {}
                }
            }
            State::EndScreen => {
                match key.code {
                    crossterm::event::KeyCode::Enter => {
                        self.state = State::TypingGame;
                        self.reset();
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.state = State::MainMenu;
                        self.reset();
                    }
                    _ => {}
                }
            }
        }

        // Check if the current text is finished
        if self.state == State::TypingGame && self.is_finished() {
            self.state = State::EndScreen;
            self.stats.stop();
        }
    }

    pub fn update_stats(&mut self) {
        if self.state == State::TypingGame {
            let current_text = &self.texts[self.current_text_index].content;
            self.stats.update(&self.input, current_text);
        }
    }

    pub fn is_finished(&self) -> bool {
        self.input.trim() == self.texts[self.current_text_index].content.trim()
    }

    pub fn current_text(&self) -> &Text {
        &self.texts[self.current_text_index]
    }

    pub fn get_input(&self) -> &str {
        self.input.as_str()
    }

    pub fn handle_backspace(&mut self) {
        if self.state == State::TypingGame && !self.input.is_empty() {
            self.input.pop();
            self.update_stats();
        }
    }

    pub fn handle_enter(&mut self) {
        match self.state {
            State::MainMenu => {
                self.state = State::TypingGame;
                self.reset();
            }
            State::EndScreen => {
                self.state = State::TypingGame;
                self.reset();
            }
            _ => {}
        }
    }

    pub fn handle_escape(&mut self) {
        match self.state {
            State::TypingGame => {
                self.state = State::MainMenu;
                self.reset();
            }
            State::EndScreen => {
                self.state = State::MainMenu;
                self.reset();
            }
            State::MainMenu => {
                self.should_exit = true;
            }
        }
    }

    pub fn get_progress(&self) -> f64 {
        if self.input.is_empty() {
            0.0
        } else {
            let total_chars = self.current_text().content.chars().count();
            let current_chars = self.input.chars().count();
            (current_chars as f64 / total_chars as f64) * 100.0
        }
    }

    pub fn update(&mut self) {
        if self.state == State::TypingGame {
            self.update_stats();
        }
    }
} 