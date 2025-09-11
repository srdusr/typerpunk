use crate::game::{Game, GameMode};
use crate::text::Text;

#[test]
fn test_game_initialization() {
    let game = Game::new(GameMode::Time(60));
    assert_eq!(game.mode(), GameMode::Time(60));
    assert_eq!(game.is_finished(), false);
}

#[test]
fn test_game_time_mode() {
    let mut game = Game::new(GameMode::Time(60));
    let text = Text::new("Hello world!");
    game.set_text(text);
    
    // Simulate some typing
    game.update("Hello");
    assert_eq!(game.is_finished(), false);
    
    // Simulate time running out
    game.update_time(61);
    assert_eq!(game.is_finished(), true);
}

#[test]
fn test_game_words_mode() {
    let mut game = Game::new(GameMode::Words(10));
    let text = Text::new("Hello world! This is a test.");
    game.set_text(text);
    
    // Simulate typing some words
    game.update("Hello world!");
    assert_eq!(game.is_finished(), false);
    
    // Simulate completing all words
    game.update("Hello world! This is a test.");
    assert_eq!(game.is_finished(), true);
}

#[test]
fn test_game_reset() {
    let mut game = Game::new(GameMode::Time(60));
    let text = Text::new("Hello world!");
    game.set_text(text);
    
    game.update("Hello");
    game.reset();
    
    assert_eq!(game.is_finished(), false);
    assert_eq!(game.current_input(), "");
}

#[test]
fn test_game_mode_transition() {
    let mut game = Game::new(GameMode::Time(60));
    game.set_mode(GameMode::Words(10));
    assert_eq!(game.mode(), GameMode::Words(10));
}

#[test]
fn test_game_text_update() {
    let mut game = Game::new(GameMode::Time(60));
    let text1 = Text::new("First text");
    let text2 = Text::new("Second text");
    
    game.set_text(text1);
    assert_eq!(game.current_text().content(), "First text");
    
    game.set_text(text2);
    assert_eq!(game.current_text().content(), "Second text");
}

#[test]
fn test_game_partial_completion() {
    let mut game = Game::new(GameMode::Words(5));
    let text = Text::new("Hello world! This is a test.");
    game.set_text(text);
    
    game.update("Hello world!");
    assert_eq!(game.is_finished(), false);
    assert_eq!(game.current_input(), "Hello world!");
}

#[test]
fn test_game_error_handling() {
    let mut game = Game::new(GameMode::Time(60));
    let text = Text::new("Hello world!");
    game.set_text(text);
    
    game.update("Helo world!");
    assert_eq!(game.is_finished(), false);
    assert_eq!(game.current_input(), "Helo world!");
}

#[test]
fn test_game_time_remaining() {
    let mut game = Game::new(GameMode::Time(60));
    let text = Text::new("Hello world!");
    game.set_text(text);
    
    game.update_time(30);
    assert_eq!(game.time_remaining(), 30);
}

#[test]
fn test_game_words_remaining() {
    let mut game = Game::new(GameMode::Words(5));
    let text = Text::new("Hello world! This is a test.");
    game.set_text(text);
    
    game.update("Hello world!");
    assert_eq!(game.words_remaining(), 3);
}

#[test]
fn test_game_progress() {
    let mut game = Game::new(GameMode::Words(5));
    let text = Text::new("Hello world! This is a test.");
    game.set_text(text);
    
    game.update("Hello world!");
    assert_eq!(game.progress(), 0.4); // 2 out of 5 words completed
}

#[test]
fn test_game_state_persistence() {
    let mut game = Game::new(GameMode::Time(60));
    let text = Text::new("Hello world!");
    game.set_text(text);
    
    game.update("Hello");
    let input = game.current_input();
    let is_finished = game.is_finished();
    
    game.reset();
    assert_eq!(game.current_input(), "");
    assert_eq!(game.is_finished(), false);
    
    game.update(input);
    assert_eq!(game.current_input(), input);
    assert_eq!(game.is_finished(), is_finished);
} 