use crate::game::Game;
use crate::types::Theme;

pub struct TyperPunkGame {
    pub game: Game,
}

impl TyperPunkGame {
    pub fn new() -> Self {
        Self {
            game: Game::new(),
        }
    }

    pub fn set_text(&mut self, text: String) {
        self.game.set_text(text);
    }

    pub fn get_text(&self) -> String {
        self.game.get_text()
    }

    pub fn get_input(&self) -> String {
        self.game.get_input().to_string()
    }

    pub fn start(&mut self) {
        self.game.start();
    }

    pub fn handle_input(&mut self, input: &str) -> Result<(), String> {
        self.game.handle_input(input)
    }

    pub fn is_finished(&self) -> bool {
        self.game.is_finished()
    }

    pub fn get_error_positions(&self) -> Vec<usize> {
        self.game.get_error_positions()
    }

    pub fn get_current_streak(&self) -> u32 {
        self.game.get_current_streak()
    }

    pub fn get_best_streak(&self) -> u32 {
        self.game.get_best_streak()
    }

    pub fn get_theme(&self) -> String {
        self.game.get_theme().to_string()
    }

    pub fn set_theme(&mut self, theme: String) {
        let theme = match theme.as_str() {
            "light" => Theme::Light,
            _ => Theme::Dark,
        };
        self.game.set_theme(theme);
    }

    pub fn get_wpm(&self) -> f64 {
        self.game.get_wpm()
    }

    pub fn get_accuracy(&self) -> f64 {
        self.game.get_accuracy()
    }

    pub fn get_time_elapsed(&self) -> f64 {
        self.game.get_time_elapsed()
    }

    pub fn can_backspace(&self) -> bool {
        self.game.can_backspace()
    }

    pub fn can_ctrl_backspace(&self) -> bool {
        self.game.can_ctrl_backspace()
    }

    pub fn handle_backspace(&mut self, ctrl: bool) -> Result<bool, String> {
        self.game.handle_backspace(ctrl)
    }

    pub fn get_total_mistakes(&self) -> u32 {
        self.game.get_total_mistakes()
    }

    pub fn get_stats(&self) -> Result<(f64, u32), String> {
        self.game.get_stats()
    }

    pub fn get_stats_and_input(&self) -> Result<(String, f64, u32), String> {
        self.game.get_stats_and_input()
    }
} 