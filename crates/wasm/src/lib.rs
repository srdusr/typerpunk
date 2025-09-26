use wasm_bindgen::prelude::*;
use typerpunk_core::game::Game;

// Re-export TyperPunkGame as TyperPunk
pub use typerpunk_core::wasm::TyperPunkGame as TyperPunk;

#[wasm_bindgen]
pub struct TyperPunkGame {
    game: Option<Game>,
}

#[wasm_bindgen]
impl TyperPunkGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            game: Some(Game::new()),
        }
    }

    #[wasm_bindgen]
    pub fn set_text(&mut self, text: &str) -> Result<(), JsValue> {
        let game = self.game.as_mut()
            .ok_or_else(|| JsValue::from_str("Game not initialized"))?;

        // Create a new owned string and validate UTF-8
        let text_str = match std::str::from_utf8(text.as_bytes()) {
            Ok(s) => s.to_string(),
            Err(_) => return Err(JsValue::from_str("Invalid UTF-8 text")),
        };

        game.set_text(text_str);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_text(&self) -> String {
        self.game.as_ref()
            .map(|game| game.get_text())
            .unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn get_input(&self) -> String {
        self.game.as_ref()
            .map(|game| game.get_input())
            .unwrap_or_default()
    }

    #[wasm_bindgen]
    pub fn handle_input(&mut self, input: &str) -> Result<(), JsValue> {
        let game = self.game.as_mut()
            .ok_or_else(|| JsValue::from_str("Game not initialized"))?;

        // Create a new owned string and validate UTF-8
        let input_str = match std::str::from_utf8(input.as_bytes()) {
            Ok(s) => s.to_string(),
            Err(_) => return Err(JsValue::from_str("Invalid UTF-8 input")),
        };
        
        // Process input
        game.handle_input(&input_str)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn handle_backspace(&mut self, ctrl: bool) -> Result<bool, JsValue> {
        let game = self.game.as_mut()
            .ok_or_else(|| JsValue::from_str("Game not initialized"))?;

        if !game.can_backspace() {
            return Ok(false);
        }

        // Check if ctrl+backspace is allowed
        if ctrl && !game.can_ctrl_backspace() {
            return Ok(false);
        }

        // Perform backspace
        game.handle_backspace(ctrl)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn get_stats(&self) -> Result<JsValue, JsValue> {
        let game = self.game.as_ref()
            .ok_or_else(|| JsValue::from_str("Game not initialized"))?;

        let (accuracy, mistakes) = game.get_stats()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let array = js_sys::Array::new();
        array.push(&JsValue::from_f64(accuracy));
        array.push(&JsValue::from_f64(mistakes as f64));
        Ok(array.into())
    }

    #[wasm_bindgen]
    pub fn get_stats_and_input(&self) -> Result<JsValue, JsValue> {
        let game = self.game.as_ref()
            .ok_or_else(|| JsValue::from_str("Game not initialized"))?;

        // Get input first to avoid recursive use
        let input = game.get_input();
        
        // Then get stats
        let (_, accuracy, mistakes) = game.get_stats_and_input()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        
        let array = js_sys::Array::new();
        array.push(&JsValue::from_str(&input));
        array.push(&JsValue::from_f64(accuracy));
        array.push(&JsValue::from_f64(mistakes as f64));
        Ok(array.into())
    }

    #[wasm_bindgen]
    pub fn is_finished(&self) -> bool {
        self.game.as_ref()
            .map(|game| {
                let input = game.get_input();
                let text = game.get_text();
                // Use the same logic as the core game
                !input.is_empty() && 
                input.len() >= text.len() && 
                input.trim() == text.trim()
            })
            .unwrap_or(false)
    }

    #[wasm_bindgen]
    pub fn start(&mut self) {
        if let Some(game) = &mut self.game {
            game.start();
        }
    }

    #[wasm_bindgen]
    pub fn get_wpm(&self) -> f64 {
        self.game.as_ref()
            .map(|game| game.get_wpm())
            .unwrap_or(0.0)
    }

    #[wasm_bindgen]
    pub fn get_time_elapsed(&self) -> f64 {
        self.game.as_ref()
            .map(|game| game.get_time_elapsed())
            .unwrap_or(0.0)
    }

    #[wasm_bindgen]
    pub fn free(&mut self) {
        self.game = None;
    }

    #[wasm_bindgen]
    pub fn can_backspace_to_position(&self, position: usize) -> bool {
        self.game.as_ref()
            .map(|game| {
                // This is a simplified check - the actual logic is in the core game
                // For now, we'll allow backspace if there are any errors before this position
                let input = game.get_input();
                let text = game.get_text();
                
                if position >= input.len() {
                    return false;
                }
                
                // Check if there are any errors before this position
                let check_len = position.min(text.len()).min(input.len());
                for i in 0..check_len {
                    let input_char = input.chars().nth(i);
                    let text_char = text.chars().nth(i);
                    if input_char != text_char {
                        return true; // Found an error, allow backspace
                    }
                }
                
                false
            })
            .unwrap_or(false)
    }

    #[wasm_bindgen]
    pub fn get_current_word_start(&self) -> usize {
        self.game.as_ref()
            .map(|game| {
                let input = game.get_input();
                let mut word_start = 0;
                let mut in_word = false;
                
                for (i, c) in input.chars().enumerate() {
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
            })
            .unwrap_or(0)
    }
}

#[wasm_bindgen]
pub fn init() {
    console_error_panic_hook::set_once();
} 