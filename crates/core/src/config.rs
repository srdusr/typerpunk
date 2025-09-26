use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub theme: String,
    pub mode: String,
    pub time: u64,
    pub words: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            mode: "time".to_string(),
            time: 60,
            words: 50,
        }
    }
}

impl Config {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn get_theme(&self) -> String {
        self.theme.clone()
    }

    pub fn get_mode(&self) -> String {
        self.mode.clone()
    }

    pub fn get_time(&self) -> u64 {
        self.time
    }

    pub fn get_words(&self) -> usize {
        self.words
    }
} 
