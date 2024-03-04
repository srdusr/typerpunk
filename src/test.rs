// Import necessary items for testing
use crate::{draw_typing_game, input_handler, read_sentences, App, State};
use crossterm::event::{KeyCode, KeyEvent};
use std::{
    io,
    sync::{Arc, Mutex},
};
use tui::layout::Rect;
use tui::{backend::CrosstermBackend, Terminal};

#[cfg(test)]
#[allow(unused_imports)] // Ignore unused import warnings within the test module
mod tests {
    use super::*;

    #[test]
    fn test_new_app() {
        // Test that a new App initializes correctly
        let app_result = App::new();
        assert!(app_result.is_ok());
        let app = app_result.unwrap();
        assert_eq!(app.input_string, "");
        assert_eq!(app.time_taken, 0);
        assert_eq!(app.timer, None);
        assert_eq!(app.state, State::MainMenu);
        assert_eq!(app.should_exit, false);
        assert!(!app.sentences.is_empty());
        assert!(app.current_sentence_index < app.sentences.len());
    }

    #[test]
    fn test_reset_app() {
        // Test the reset functionality of App
        let mut app = App::new().unwrap();
        app.current_sentence_index = 0; // Set initial index to 0
        let old_index = app.current_sentence_index;
        println!(
            "Before reset: old_index = {}, current_sentence_index = {}",
            old_index, app.current_sentence_index
        );

        app.time_taken = 100;
        app.input_string = "Some input".to_string();
        app.reset();

        println!(
            "After reset: old_index = {}, current_sentence_index = {}",
            old_index, app.current_sentence_index
        );

        // Check that current_sentence_index changes after reset
        assert_ne!(app.current_sentence_index, old_index);
        assert_eq!(app.time_taken, 0);
        assert_eq!(app.input_string, "");
        assert_eq!(app.timer, None);
        assert_eq!(app.state, State::TypingGame);
    }

    #[test]
    fn test_current_sentence() {
        // Test the retrieval of the current sentence
        let app = App::new().unwrap();
        let current_sentence = app.current_sentence();
        assert!(!current_sentence.is_empty());
    }

    #[test]
    fn test_start_timer() {
        // Test starting the timer
        let mut app = App::new().unwrap();
        app.start_timer();
        assert!(app.timer.is_some());
    }

    #[test]
    fn test_update_timer() {
        // Test updating the timer
        let mut app = App::new().unwrap();
        app.start_timer();
        let initial_time = app.time_taken;
        std::thread::sleep(std::time::Duration::from_secs(1));
        app.update_timer();
        assert!(app.time_taken > initial_time);
    }

    #[test]
    fn test_update_wpm() {
        // Test updating words per minute calculation
        let mut app = App::new().unwrap();
        app.time_taken = 60; // 1 minute
        app.input_string = "This is a test sentence".to_string();
        let wpm = app.update_wpm();
        assert_eq!(wpm, 5.0); // 5 words per minute for this sentence
    }

    #[test]
    fn test_read_sentences() {
        // Test reading sentences from a file
        let sentences_result = read_sentences("sentences.txt");
        assert!(sentences_result.is_ok());
        let sentences = sentences_result.unwrap();
        assert!(!sentences.is_empty());
    }

    #[test]
    fn test_draw_typing_game() {
        // Test drawing the typing game UI
        let mut app = App::new().unwrap();
        let stdout = io::stdout();
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend).unwrap();
        let size = Rect::default();
        draw_typing_game(&mut terminal.get_frame(), size, &mut app);
        // No need to assert anything here since it's a rendering function
    }

    #[tokio::test]
    async fn test_input_handler() {
        // Test the input handler function
        let mut app = App::new().unwrap();

        // Simulate typing 'a'
        let event = KeyEvent::from(KeyCode::Char('a'));
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.input_string, "a");

        // Simulate typing 'b'
        let event = KeyEvent::from(KeyCode::Char('b'));
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.input_string, "ab");

        // Simulate pressing Backspace
        let event = KeyEvent::from(KeyCode::Backspace);
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.input_string, "a");

        // Simulate pressing Enter in MainMenu state
        let event = KeyEvent::from(KeyCode::Enter);
        app.state = State::MainMenu;
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.state, State::TypingGame);
        assert_eq!(app.input_string, "");

        // Simulate typing 'T' in TypingGame state
        let event = KeyEvent::from(KeyCode::Char('T'));
        app.state = State::TypingGame;
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.input_string, "T");

        // Simulate completing sentence and pressing Enter
        let sentence = app.current_sentence().to_string();
        app.input_string = sentence.clone();
        let event = KeyEvent::from(KeyCode::Enter);
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.state, State::EndScreen);
        assert_eq!(app.input_string.trim(), sentence.trim());

        // Simulate pressing Esc in EndScreen state
        let event = KeyEvent::from(KeyCode::Esc);
        app.state = State::EndScreen;
        input_handler(event, &mut app, Arc::new(Mutex::new(()))).await;
        assert_eq!(app.should_exit, true);
    }
}
