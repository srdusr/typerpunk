use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone)]
pub struct Stats {
    start_time: Option<Instant>,
    end_time: Option<Instant>,
    error_positions: Vec<usize>,
    current_streak: usize,
    best_streak: usize,
    total_chars: usize,
    correct_chars: usize,
    incorrect_chars: usize,
    total_words: usize,
    correct_words: usize,
    errors: usize,
    // Persistent keystroke-level tracking (CLI):
    // counts every typed character (excluding control sequences) and how many were incorrect at time of keypress
    keystrokes_total: usize,
    keystrokes_incorrect: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedStats {
    wpm: f64,
    accuracy: f64,
    total_chars: usize,
    correct_chars: usize,
    incorrect_chars: usize,
    total_words: usize,
    correct_words: usize,
    errors: usize,
    time_elapsed_secs: u64,
    error_positions: Vec<usize>,
    current_streak: usize,
    best_streak: usize,
}

impl From<&Stats> for SerializedStats {
    fn from(stats: &Stats) -> Self {
        let time_elapsed = stats.start_time
            .and_then(|start| stats.end_time.map(|end| end.duration_since(start)))
            .unwrap_or(Duration::from_secs(0));

        let wpm = if time_elapsed.as_secs() > 0 {
            (stats.correct_chars as f64 / 5.0) / (time_elapsed.as_secs_f64() / 60.0)
        } else {
            0.0
        };

        let accuracy = if stats.total_chars > 0 {
            (stats.correct_chars as f64 / stats.total_chars as f64) * 100.0
        } else {
            0.0
        };

        Self {
            wpm,
            accuracy,
            total_chars: stats.total_chars,
            correct_chars: stats.correct_chars,
            incorrect_chars: stats.incorrect_chars,
            total_words: stats.total_words,
            correct_words: stats.correct_words,
            errors: stats.errors,
            time_elapsed_secs: time_elapsed.as_secs(),
            error_positions: stats.error_positions.clone(),
            current_streak: stats.current_streak,
            best_streak: stats.best_streak,
        }
    }
}

impl Stats {
    pub fn new() -> Self {
        Self {
            start_time: None,
            end_time: None,
            error_positions: Vec::new(),
            current_streak: 0,
            best_streak: 0,
            total_chars: 0,
            correct_chars: 0,
            incorrect_chars: 0,
            total_words: 0,
            correct_words: 0,
            errors: 0,
            keystrokes_total: 0,
            keystrokes_incorrect: 0,
        }
    }

    pub fn reset(&mut self) {
        self.start_time = None;
        self.end_time = None;
        self.error_positions.clear();
        self.current_streak = 0;
        self.best_streak = 0;
        self.total_chars = 0;
        self.correct_chars = 0;
        self.incorrect_chars = 0;
        self.total_words = 0;
        self.correct_words = 0;
        self.errors = 0;
        self.keystrokes_total = 0;
        self.keystrokes_incorrect = 0;
    }

    pub fn start(&mut self) {
        self.start_time = Some(Instant::now());
    }

    pub fn update(&mut self, input: &str, target: &str) {
        // Recompute everything from scratch for current input
        self.error_positions.clear();
        let mut streak = 0;
        let mut best_streak_local = 0;
        let mut correct_chars = 0usize;
        let mut incorrect_chars = 0usize;
        let mut total_words = 0usize;
        let mut correct_words = 0usize;

        // Tokenize by whitespace to count words
        let input_words: Vec<&str> = input.split_whitespace().collect();
        let target_words: Vec<&str> = target.split_whitespace().collect();
        total_words = input_words.len();
        for (iw, tw) in input_words.iter().zip(target_words.iter()) {
            if *iw == *tw { correct_words += 1; }
        }

        for (i, (input_char, target_char)) in input.chars().zip(target.chars()).enumerate() {
            if input_char == target_char {
                streak += 1;
                correct_chars += 1;
                if streak > best_streak_local { best_streak_local = streak; }
            } else {
                self.error_positions.push(i);
                streak = 0;
                incorrect_chars += 1;
            }
        }

        // Extra characters beyond target count as incorrect
        if input.len() > target.len() {
            incorrect_chars += input.len() - target.len();
        }

        self.total_chars = input.len();
        self.correct_chars = correct_chars;
        self.incorrect_chars = incorrect_chars;
        self.total_words = total_words;
        self.correct_words = correct_words;
        self.errors = self.error_positions.len();
        self.current_streak = streak;
        self.best_streak = self.best_streak.max(best_streak_local);
    }

    // Record a single keypress for persistent accuracy tracking (CLI only).
    // If the typed char at the time of keypress was incorrect, mark it as incorrect permanently.
    pub fn note_keypress(&mut self, was_correct: bool) {
        self.keystrokes_total = self.keystrokes_total.saturating_add(1);
        if !was_correct {
            self.keystrokes_incorrect = self.keystrokes_incorrect.saturating_add(1);
        }
    }

    pub fn finish(&mut self) {
        self.end_time = Some(Instant::now());
    }

    pub fn get_error_positions(&self) -> Vec<usize> {
        self.error_positions.clone()
    }

    pub fn get_current_streak(&self) -> usize {
        self.current_streak
    }

    pub fn get_best_streak(&self) -> usize {
        self.best_streak
    }

    pub fn get_wpm(&self) -> f64 {
        let time_elapsed = match (self.start_time, self.end_time) {
            (Some(start), Some(end)) => end.duration_since(start),
            (Some(start), None) => Instant::now().duration_since(start),
            _ => Duration::from_secs(0),
        };

        if time_elapsed.as_secs_f64() > 0.0 {
            (self.correct_chars as f64 / 5.0) / (time_elapsed.as_secs_f64() / 60.0)
        } else {
            0.0
        }
    }

    pub fn get_accuracy(&self) -> f64 {
        // Prefer persistent keystroke accuracy for CLI to avoid resetting to 100% after fixes.
        if self.keystrokes_total > 0 {
            let correct = (self.keystrokes_total - self.keystrokes_incorrect) as f64;
            return (correct / self.keystrokes_total as f64) * 100.0;
        }
        if self.total_chars > 0 {
            (self.correct_chars as f64 / self.total_chars as f64) * 100.0
        } else { 0.0 }
    }

    pub fn get_time_elapsed(&self) -> Duration {
        match (self.start_time, self.end_time) {
            (Some(start), Some(end)) => end.duration_since(start),
            (Some(start), None) => Instant::now().duration_since(start),
            _ => Duration::from_secs(0),
        }
    }

    pub fn wpm(&self) -> f64 { self.get_wpm() }
    pub fn accuracy(&self) -> f64 { self.get_accuracy() }
    pub fn elapsed_time(&self) -> std::time::Duration { self.get_time_elapsed() }
    pub fn is_running(&self) -> bool { self.start_time.is_some() && self.end_time.is_none() }
    pub fn stop(&mut self) { self.end_time = Some(std::time::Instant::now()); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;
    use std::time::Duration;

    #[test]
    fn test_stats_initialization() {
        let stats = Stats::new();
        assert_eq!(stats.start_time, None);
        assert_eq!(stats.end_time, None);
        assert_eq!(stats.error_positions, Vec::new());
        assert_eq!(stats.current_streak, 0);
        assert_eq!(stats.best_streak, 0);
    }

    #[test]
    fn test_stats_update() {
        let mut stats = Stats::new();
        stats.start_time = Some(Instant::now());
        stats.update("hello", "hello");
        stats.end_time = Some(Instant::now());

        assert_eq!(stats.start_time, Some(Instant::now()));
        assert_eq!(stats.end_time, Some(Instant::now()));
        assert_eq!(stats.error_positions, Vec::new());
        assert_eq!(stats.current_streak, 5);
        assert_eq!(stats.best_streak, 5);
    }

    #[test]
    fn test_stats_word_counting() {
        let mut stats = Stats::new();
        stats.total_words = 2;
        stats.correct_words = 2;

        assert_eq!(stats.total_words, 2);
        assert_eq!(stats.correct_words, 2);
    }
} 