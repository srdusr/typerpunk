use crate::stats::Stats;
use std::time::Duration;

#[test]
fn test_stats_initialization() {
    let stats = Stats::new();
    assert_eq!(stats.wpm, 0.0);
    assert_eq!(stats.accuracy, 100.0);
    assert_eq!(stats.total_chars, 0);
    assert_eq!(stats.correct_chars, 0);
    assert_eq!(stats.incorrect_chars, 0);
    assert_eq!(stats.total_words, 0);
    assert_eq!(stats.correct_words, 0);
    assert_eq!(stats.errors, 0);
    assert_eq!(stats.time_elapsed, Duration::from_secs(0));
    assert!(stats.error_positions.is_empty());
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.best_streak, 0);
}

#[test]
fn test_stats_start_stop() {
    let mut stats = Stats::new();
    assert!(!stats.is_running());
    
    stats.start();
    assert!(stats.is_running());
    
    stats.stop();
    assert!(!stats.is_running());
}

#[test]
fn test_stats_update() {
    let mut stats = Stats::new();
    stats.start();
    
    // Test perfect typing
    stats.update("hello", "hello");
    assert_eq!(stats.correct_chars, 5);
    assert_eq!(stats.incorrect_chars, 0);
    assert_eq!(stats.total_chars, 5);
    assert_eq!(stats.current_streak, 5);
    assert_eq!(stats.best_streak, 5);
    
    // Test with errors
    stats.update("helo", "hello");
    assert_eq!(stats.correct_chars, 3);
    assert_eq!(stats.incorrect_chars, 1);
    assert_eq!(stats.total_chars, 4);
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.best_streak, 5);
}

#[test]
fn test_stats_reset() {
    let mut stats = Stats::new();
    stats.start();
    stats.update("hello", "hello");
    stats.reset();
    
    assert_eq!(stats.wpm, 0.0);
    assert_eq!(stats.accuracy, 100.0);
    assert_eq!(stats.total_chars, 0);
    assert_eq!(stats.correct_chars, 0);
    assert_eq!(stats.incorrect_chars, 0);
    assert_eq!(stats.total_words, 0);
    assert_eq!(stats.correct_words, 0);
    assert_eq!(stats.errors, 0);
    assert_eq!(stats.time_elapsed, Duration::from_secs(0));
    assert!(stats.error_positions.is_empty());
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.best_streak, 0);
}

#[test]
fn test_stats_wpm_calculation() {
    let mut stats = Stats::new();
    stats.start();
    
    // Type 60 characters (12 words) in 1 minute
    stats.update("hello world hello world hello world", "hello world hello world hello world");
    assert_eq!(stats.wpm, 12.0);
}

#[test]
fn test_stats_accuracy_calculation() {
    let mut stats = Stats::new();
    stats.start();
    
    // Type 10 characters with 2 errors
    stats.update("hello wrld", "hello world");
    assert_eq!(stats.accuracy, 80.0);
}

#[test]
fn test_stats_streak_tracking() {
    let mut stats = Stats::new();
    stats.start();
    
    // Test streak building and breaking
    stats.update("hello", "hello");
    assert_eq!(stats.current_streak, 5);
    assert_eq!(stats.best_streak, 5);
    
    stats.update("helo", "hello");
    assert_eq!(stats.current_streak, 0);
    assert_eq!(stats.best_streak, 5);
    
    stats.update("hello", "hello");
    assert_eq!(stats.current_streak, 5);
    assert_eq!(stats.best_streak, 5);
}

#[test]
fn test_stats_error_positions() {
    let mut stats = Stats::new();
    stats.start();
    
    stats.update("helo", "hello");
    assert_eq!(stats.error_positions, vec![3]);
    
    stats.update("hllo", "hello");
    assert_eq!(stats.error_positions, vec![1]);
} 