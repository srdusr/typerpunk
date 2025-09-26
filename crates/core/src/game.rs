use std::time::Instant;
use serde::{Deserialize, Serialize};
use crate::types::Theme;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Platform {
    Desktop,
    Web,
    Mobile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GameMode {
    Normal,
    Programming,
    Security,
    Multiplayer,
    Zen,
    Time(u64),
    Words(usize),
    Quote,
}

impl Default for GameMode {
    fn default() -> Self {
        GameMode::Normal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Difficulty {
    Basic,
    Intermediate,
    Advanced,
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Topic {
    General,
    Programming,
    Security,
    DataStructures,
    Algorithms,
    RedTeam,
    BlueTeam,
    Gaming,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub mode: GameMode,
    pub difficulty: Difficulty,
    pub topic: Topic,
    pub time_limit: Option<u64>,
    pub word_count: Option<usize>,
    pub custom_text: Option<String>,
    pub multiplayer: bool,
    pub quote_length: usize,
    pub theme: Theme,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            mode: GameMode::Normal,
            difficulty: Difficulty::Basic,
            topic: Topic::General,
            time_limit: None,
            word_count: None,
            custom_text: None,
            multiplayer: false,
            quote_length: 50,
            theme: Theme::default(),
        }
    }
}

pub trait GameModeTrait {
    fn get_mode(&self) -> GameMode;
    fn get_difficulty(&self) -> Difficulty;
    fn get_topic(&self) -> Topic;
    fn get_time_limit(&self) -> Option<u64>;
    fn get_word_count(&self) -> Option<usize>;
    fn get_custom_text(&self) -> Option<&str>;
    fn is_multiplayer(&self) -> bool;
    fn get_quote_length(&self) -> usize;
    fn get_theme(&self) -> &Theme;
}

impl GameModeTrait for GameConfig {
    fn get_mode(&self) -> GameMode {
        self.mode
    }

    fn get_difficulty(&self) -> Difficulty {
        self.difficulty
    }

    fn get_topic(&self) -> Topic {
        self.topic
    }

    fn get_time_limit(&self) -> Option<u64> {
        self.time_limit
    }

    fn get_word_count(&self) -> Option<usize> {
        self.word_count
    }

    fn get_custom_text(&self) -> Option<&str> {
        self.custom_text.as_deref()
    }

    fn is_multiplayer(&self) -> bool {
        self.multiplayer
    }

    fn get_quote_length(&self) -> usize {
        self.quote_length
    }

    fn get_theme(&self) -> &Theme {
        &self.theme
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    text: String,
    input: String,
    #[serde(skip)]
    start_time: Option<Instant>,
    is_started: bool,
    is_finished: bool,
    error_positions: Vec<usize>,
    current_streak: u32,
    best_streak: u32,
    theme: Theme,
    correct_positions: Vec<bool>,
    pub total_mistakes: u32,
    total_errors_made: u32,
    last_input_length: usize,
    total_characters_typed: u32,
    total_correct_characters: u32,
}

impl Game {
    pub fn new() -> Self {
        Self {
            text: String::new(),
            input: String::new(),
            start_time: None,
            is_started: false,
            is_finished: false,
            error_positions: Vec::new(),
            current_streak: 0,
            best_streak: 0,
            theme: Theme::default(),
            correct_positions: Vec::new(),
            total_mistakes: 0,
            total_errors_made: 0,
            last_input_length: 0,
            total_characters_typed: 0,
            total_correct_characters: 0,
        }
    }

    pub fn set_text(&mut self, text: String) {
        self.text = text;
        self.reset();
    }

    pub fn get_text(&self) -> String {
        self.text.clone()
    }

    pub fn get_input(&self) -> String {
        self.input.clone()
    }

    pub fn start(&mut self) {
        self.is_started = true;
        self.start_time = Some(Instant::now());
    }

    pub fn handle_input(&mut self, input: &str) -> Result<(), String> {
        println!("DEBUG: handle_input called with input='{}'", input);
        if self.is_finished() {
            return Ok(());
        }
        
        // Validate UTF-8 only
        let input_str = match std::str::from_utf8(input.as_bytes()) {
            Ok(s) => s.to_string(),
            Err(_) => return Err("Invalid UTF-8 input".to_string()),
        };
        
        // Update input
        self.input = input_str;
        
        // Update game state
        self.update_game_state();
        Ok(())
    }

    pub fn is_finished(&self) -> bool {
        self.is_finished
    }

    pub fn get_error_positions(&self) -> Vec<usize> {
        self.error_positions.clone()
    }

    pub fn get_current_streak(&self) -> u32 {
        self.current_streak
    }

    pub fn get_best_streak(&self) -> u32 {
        self.best_streak
    }

    pub fn get_theme(&self) -> Theme {
        self.theme
    }

    pub fn set_theme(&mut self, theme: Theme) {
        self.theme = theme;
    }

    pub fn get_wpm(&self) -> f64 {
        if let Some(start_time) = self.start_time {
            let elapsed = start_time.elapsed().as_secs_f64();
            if elapsed > 0.0 {
                let words = self.input.len() as f64 / 5.0;
                return (words * 60.0) / elapsed;
            }
        }
        0.0
    }

    pub fn get_stats(&self) -> Result<(f64, u32), String> {
        let accuracy = self.get_accuracy();
        let mistakes = self.get_total_mistakes();
        Ok((accuracy, mistakes))
    }

    pub fn get_stats_and_input(&self) -> Result<(String, f64, u32), String> {
        let (accuracy, mistakes) = self.get_stats()?;
        Ok((self.input.clone(), accuracy, mistakes))
    }

    pub fn get_accuracy(&self) -> f64 {
        if self.total_characters_typed == 0 {
            return 100.0;
        }
        
        let accuracy = (self.total_correct_characters as f64 / self.total_characters_typed as f64) * 100.0;
        accuracy.max(0.0).min(100.0)
    }

    pub fn get_total_mistakes(&self) -> u32 {
        // Return total errors made, not current mistakes
        self.total_errors_made
    }

    pub fn get_time_elapsed(&self) -> f64 {
        if let Some(start_time) = self.start_time {
            start_time.elapsed().as_secs_f64()
        } else {
            0.0
        }
    }

    fn reset(&mut self) {
        self.input.clear();
        self.start_time = None;
        self.is_started = false;
        self.is_finished = false;
        self.error_positions.clear();
        self.current_streak = 0;
        self.best_streak = 0;
        self.correct_positions = vec![false; self.text.len()];
        self.total_mistakes = 0;
        self.total_errors_made = 0;
        self.last_input_length = 0;
        self.total_characters_typed = 0;
        self.total_correct_characters = 0;
    }

    pub fn can_backspace(&self) -> bool {
        !self.is_finished && !self.input.is_empty()
    }

    pub fn can_ctrl_backspace(&self) -> bool {
        !self.is_finished && !self.input.is_empty()
    }

    pub fn handle_backspace(&mut self, ctrl: bool) -> Result<bool, String> {
        if !self.can_backspace() {
            return Ok(false);
        }

        let mut new_input = self.input.clone();

        if ctrl {
            // Find start of current word
            let chars: Vec<char> = new_input.chars().collect();
            let mut word_start = 0;
            let mut in_word = false;
            for (i, c) in chars.iter().enumerate() {
                if c.is_whitespace() {
                    if in_word {
                        word_start = i + 1;
                    }
                    in_word = false;
                } else {
                    in_word = true;
                }
            }

            // If at start of word, find previous error word start
            if new_input.len() == word_start && !self.error_positions.is_empty() {
                // Find the last error position before the current word
                let prev_error = self.error_positions.iter().rev().find(|&&pos| pos < word_start);
                if let Some(&err_pos) = prev_error {
                    // Find the start of the word containing this error
                    let mut prev_word_start = 0;
                    let mut in_word = false;
                    for (i, c) in chars.iter().enumerate() {
                        if i > err_pos { break; }
                        if c.is_whitespace() {
                            if in_word {
                                prev_word_start = i + 1;
                            }
                            in_word = false;
                        } else {
                            in_word = true;
                        }
                    }
                    new_input = new_input[..prev_word_start].to_string();
                }
            } else {
                // Normal: delete to start of current word
                new_input = new_input[..word_start].to_string();
            }
        } else {
            // Regular backspace: delete one character
            if !self.can_backspace_to_position(new_input.len() - 1) {
                return Ok(false);
            }
            new_input.pop();
        }

        self.input = new_input;
        self.update_game_state();
        Ok(true)
    }

    /// Check if there are any errors before a specific position
    fn has_errors_before_position(&self, position: usize) -> bool {
        let text_len = self.text.len().min(self.input.len());
        for i in 0..text_len.min(position) {
            if i < self.input.len() {
                let input_char = self.input.chars().nth(i);
                let text_char = self.text.chars().nth(i);
                if input_char != text_char {
                    return true; // Found an error
                }
            }
        }
        false
    }

    /// Check if backspace is allowed to a specific position
    /// Returns true if:
    /// 1. We're in the current word (can always backspace within current word)
    /// 2. There are errors in previous words (can backspace to fix them)
    fn can_backspace_to_position(&self, target_pos: usize) -> bool {
        if target_pos >= self.input.len() {
            return false;
        }

        // Always allow backspace within the current word
        let current_word_start = self.get_current_word_start();
        if target_pos >= current_word_start {
            return true;
        }

        // Check if there are any errors in the text before the target position
        let text_len = self.text.len().min(self.input.len());
        for i in 0..text_len.min(target_pos + 1) {
            if i < self.input.len() {
                let input_char = self.input.chars().nth(i);
                let text_char = self.text.chars().nth(i);
                if input_char != text_char {
                    return true; // Found an error, allow backspace
                }
            }
        }

        false // No errors found, don't allow backspace to previous words
    }

    /// Get the start position of the current word
    fn get_current_word_start(&self) -> usize {
        let mut word_start = 0;
        let mut in_word = false;
        
        for (i, c) in self.input.chars().enumerate() {
            if c.is_whitespace() {
                if in_word {
                    word_start = i + 1;
                }
                in_word = false;
            } else {
                in_word = true;
            }
        }
        
        word_start
    }

    fn update_game_state(&mut self) {
        println!("DEBUG: update_game_state called, input='{}', text='{}'", self.input, self.text);
        self.error_positions.clear();
        let total_chars = self.input.len().min(self.text.len());
        
        // Use string slices for comparison
        let input_slice = &self.input[..total_chars];
        let text_slice = &self.text[..total_chars];
        
        let mut _correct = 0;
        let mut current_mistakes = 0;
        let mut current_streak = 0;
        let mut best_streak = 0;
        
        // Track new characters typed since last update
        let new_chars_typed = if self.input.len() > self.last_input_length {
            self.input.len() - self.last_input_length
        } else {
            0
        };
        
        // Add new characters to total typed
        self.total_characters_typed += new_chars_typed as u32;
        
        // Compare characters using chars() iterator to handle UTF-8 correctly
        for (i, (input_char, text_char)) in input_slice.chars().zip(text_slice.chars()).enumerate() {
            if input_char == text_char {
                _correct += 1;
                current_streak += 1;
                best_streak = best_streak.max(current_streak);
                
                // Count correct characters (only for new positions)
                if i >= self.last_input_length {
                    self.total_correct_characters += 1;
                }
            } else {
                current_mistakes += 1;
                current_streak = 0;
                self.error_positions.push(i);
                
                // Count new errors (only if this is a new character position)
                if i >= self.last_input_length {
                    self.total_errors_made += 1;
                }
            }
        }
        
        println!("DEBUG: before extra char logic, input.len()={}, text.len()={}", self.input.len(), self.text.len());
        // Add extra characters as current mistakes
        if self.input.len() > self.text.len() {
            current_mistakes += (self.input.len() - self.text.len()) as u32;
            // Always count any new extra characters as errors
            if self.input.len() > self.last_input_length {
                let prev_extra = if self.last_input_length > self.text.len() {
                    self.last_input_length - self.text.len()
                } else {
                    0
                };
                let curr_extra = self.input.len() - self.text.len();
                let new_extra = curr_extra.saturating_sub(prev_extra);
                println!("DEBUG: last_input_length={}, input.len()={}, prev_extra={}, curr_extra={}, new_extra={}", self.last_input_length, self.input.len(), prev_extra, curr_extra, new_extra);
                if new_extra > 0 {
                    self.total_errors_made += new_extra as u32;
                }
            }
        }
        
        self.total_mistakes = current_mistakes;
        self.current_streak = current_streak as u32;
        self.best_streak = best_streak as u32;
        self.last_input_length = self.input.len();
        
        // Check if game is finished - use both length and content comparison
        let is_complete = !self.input.is_empty() && 
                         self.input.len() >= self.text.len() && 
                         self.input.trim() == self.text.trim();
        self.is_finished = is_complete;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backspace_within_current_word() {
        let mut game = Game::new();
        game.set_text("Hello world".to_string());
        game.handle_input("Hello").unwrap();
        
        // Should be able to backspace within current word
        assert!(game.handle_backspace(false).unwrap());
        assert_eq!(game.get_input(), "Hell");
    }

    #[test]
    fn test_backspace_to_previous_word_with_error() {
        let mut game = Game::new();
        game.set_text("Hello world".to_string());
        game.handle_input("Hallo world").unwrap(); // "Hallo" has an error
        
        // Should be able to backspace to fix the error in previous word
        assert!(game.handle_backspace(false).unwrap());
        assert_eq!(game.get_input(), "Hallo worl");
        
        // Should be able to backspace more to fix the error
        assert!(game.handle_backspace(false).unwrap());
        assert_eq!(game.get_input(), "Hallo wor");
    }

    #[test]
    fn test_backspace_to_previous_word_without_error() {
        let mut game = Game::new();
        game.set_text("Hello world".to_string());
        game.handle_input("Hello world").unwrap(); // No errors
        
        // Should not be able to backspace to previous word when no errors
        let initial_input = game.get_input();
        assert!(!game.handle_backspace(false).unwrap());
        assert_eq!(game.get_input(), initial_input);
    }

    #[test]
    fn test_ctrl_backspace() {
        let mut game = Game::new();
        game.set_text("Hello world test".to_string());
        game.handle_input("Hallo world test").unwrap(); // "Hallo" has an error
        
        // Ctrl+backspace should delete the current word since there are errors before it
        assert!(game.handle_backspace(true).unwrap());
        assert_eq!(game.get_input(), "Hallo world ");
        
        // Test with no errors - should not allow ctrl+backspace
        let mut game2 = Game::new();
        game2.set_text("Hello world test".to_string());
        game2.handle_input("Hello world test").unwrap(); // No errors
        
        assert!(!game2.handle_backspace(true).unwrap());
        
        // Test going back to previous word with errors
        let mut game3 = Game::new();
        game3.set_text("Hello world test".to_string());
        game3.handle_input("Hallo world test").unwrap(); // "Hallo" has an error
        
        // Should be able to ctrl+backspace to go back to the word with error
        assert!(game3.handle_backspace(true).unwrap());
        assert_eq!(game3.get_input(), "Hallo world ");
        
        // Should be able to ctrl+backspace again to go back further
        assert!(game3.handle_backspace(true).unwrap());
        assert_eq!(game3.get_input(), "Hallo world ");
    }

    #[test]
    fn test_game_completion_detection() {
        let mut game = Game::new();
        game.set_text("Hello world".to_string());
        
        // Should not be finished initially
        assert!(!game.is_finished());
        
        // Should be finished when text is completed
        game.handle_input("Hello world").unwrap();
        assert!(game.is_finished());
        
        // Should be finished even with extra spaces (but we can't input more than text length)
        let mut game2 = Game::new();
        game2.set_text("Hello world".to_string());
        game2.handle_input("Hello world").unwrap();
        assert!(game2.is_finished());
    }

    #[test]
    fn test_error_counting() {
        let mut game = Game::new();
        game.set_text("Hello world".to_string());
        
        // Type with errors
        game.handle_input("Hallo world").unwrap(); // "Hallo" has an error
        println!("After first error: total_errors_made = {}", game.total_errors_made);
        assert_eq!(game.get_total_mistakes(), 1); // Should count the error
        
        // Correct the error
        game.handle_input("Hello world").unwrap(); // Corrected
        println!("After correction: total_errors_made = {}", game.total_errors_made);
        assert_eq!(game.get_total_mistakes(), 1); // Should still show 1 error (total made)
        
        // Make another error by typing extra characters
        game.handle_input("Hello worldx").unwrap(); // Extra character
        println!("After second error: total_errors_made = {}", game.total_errors_made);
        assert_eq!(game.get_total_mistakes(), 2); // Should now show 2 total errors
    }

    #[test]
    fn test_ctrl_backspace_one_error_word_at_a_time() {
        let mut game = Game::new();
        game.set_text("foo bar baz qux".to_string());
        game.handle_input("fao bar bzz qux").unwrap(); // errors in 'fao' and 'bzz'
        // Cursor at end, ctrl+backspace should delete to start of 'bzz'
        assert!(game.handle_backspace(true).unwrap());
        assert_eq!(game.get_input(), "fao bar ");
        // Another ctrl+backspace should delete to start of 'fao'
        assert!(game.handle_backspace(true).unwrap());
        assert_eq!(game.get_input(), "");
    }
} 