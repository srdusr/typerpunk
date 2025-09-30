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
    pub wpm_history: Vec<u64>,
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
            wpm_history: Vec::new(),
        })
    }

    fn handle_backspace_with_rules(&mut self, ctrl: bool) {
        if self.input.is_empty() { return; }
        let current_text = &self.texts[self.current_text_index].content;
        if ctrl {
            // Delete to start of current word
            let word_start = self.get_current_word_start();
            if word_start < self.input.len() {
                self.input.truncate(word_start);
                self.update_stats();
            }
            return;
        }

        // Deleting one character. Only allow crossing into previous word if there are errors before.
        let target_pos = self.input.len().saturating_sub(1);
        let current_word_start = self.get_current_word_start();
        if target_pos < current_word_start {
            if !self.has_errors_before_position(current_text, current_word_start) {
                // No errors before; do not allow moving back into previous words
                return;
            }
        }
        self.input.pop();
        self.update_stats();
    }

    fn get_current_word_start(&self) -> usize {
        let mut word_start = 0;
        let mut in_word = false;
        for (i, c) in self.input.chars().enumerate() {
            if c.is_whitespace() {
                if in_word { word_start = i + 1; }
                in_word = false;
            } else {
                in_word = true;
            }
        }
        word_start
    }

    fn has_errors_before_position(&self, text: &str, position: usize) -> bool {
        let compare_len = self.input.len().min(text.len());
        for (i, (ic, tc)) in self.input.chars().zip(text.chars()).take(compare_len).enumerate() {
            if i >= position { break; }
            if ic != tc { return true; }
        }
        false
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
            wpm_history: Vec::new(),
        })
    }

    pub fn reset(&mut self) {
        self.input.clear();
        self.stats.reset();
        self.current_text_index = self.pick_random_index();
        self.wpm_history.clear();
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
                        // Handle control-word delete (Ctrl+W)
                        if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL)
                            && (c == 'w' || c == 'W')
                        {
                            self.handle_backspace_with_rules(true);
                            return;
                        }
                        // Don't insert invisible control chars; only insert when no CTRL/ALT (SHIFT ok)
                        if key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                            return;
                        }
                        if !self.stats.is_running() { self.stats.start(); }
                        // Record keystroke correctness before mutating input
                        let was_correct = {
                            let pos = self.input.len();
                            let current_text = &self.texts[self.current_text_index].content;
                            if pos < current_text.len() {
                                // Compare with target at this position
                                current_text.chars().nth(pos).map(|tc| tc == c).unwrap_or(false)
                            } else {
                                false // extra chars are considered incorrect
                            }
                        };
                        self.stats.note_keypress(was_correct);
                        self.input.push(c);
                        self.update_stats();
                    }
                    crossterm::event::KeyCode::Backspace => {
                        // Treat Ctrl or Alt modified Backspace as word delete for tmux/screen/terms
                        let ctrl_or_alt = key.modifiers.intersects(
                            crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT,
                        );
                        self.handle_backspace_with_rules(ctrl_or_alt);
                    }
                    // Some terminals send Ctrl+H instead of Ctrl+Backspace
                    crossterm::event::KeyCode::Char('h') | crossterm::event::KeyCode::Char('H')
                        if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) =>
                    {
                        self.handle_backspace_with_rules(true);
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
            // Sample WPM once per elapsed second to build a compact sparkline
            let secs = self.stats.elapsed_time().as_secs() as usize;
            while self.wpm_history.len() < secs {
                self.wpm_history.push(self.stats.wpm().round() as u64);
            }
        }
    }
} 