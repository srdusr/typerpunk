// Heuristic, not proof - this flags a result for exclusion from the public
// leaderboard, it never rejects a submission outright. A false positive
// against a genuine elite typist costs them a leaderboard slot until
// reviewed; a false negative just means a bot's score sits on a personal
// profile nobody but that account holder sees ranked. Rejecting outright
// would make the first kind of mistake much more costly for no real gain
// against the second.

/// Above the sustained world record (~216 WPM) but generous enough that a
/// genuine top-tier human run doesn't get flagged just for being very fast.
const WPM_CEILING: f64 = 220.0;

/// Below this many samples, a coefficient-of-variation read is too noisy to
/// act on - a handful of keystrokes can look "uniform" by chance alone.
const MIN_KEYSTROKE_SAMPLES: usize = 20;

/// Real human inter-keystroke timing varies quite a bit even at a steady
/// pace; a script replaying fixed or near-fixed delays reads as unusually
/// uniform by comparison. This threshold is deliberately loose - it's
/// meant to catch obviously mechanical timing, not to be a precise
/// biometric classifier.
const MIN_PLAUSIBLE_CV: f64 = 0.15;

pub fn should_flag(wpm: f64, keystroke_intervals_ms: &Option<Vec<f64>>) -> bool {
    if wpm > WPM_CEILING {
        return true;
    }

    if let Some(intervals) = keystroke_intervals_ms {
        if intervals.len() >= MIN_KEYSTROKE_SAMPLES {
            let mean = intervals.iter().sum::<f64>() / intervals.len() as f64;
            if mean > 0.0 {
                let variance = intervals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / intervals.len() as f64;
                let cv = variance.sqrt() / mean;
                if cv < MIN_PLAUSIBLE_CV {
                    return true;
                }
            }
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_impossible_wpm() {
        assert!(should_flag(300.0, &None));
    }

    #[test]
    fn does_not_flag_ordinary_human_run() {
        assert!(!should_flag(85.0, &None));
    }

    #[test]
    fn flags_suspiciously_uniform_timing() {
        let intervals: Vec<f64> = (0..30).map(|_| 120.0).collect();
        assert!(should_flag(90.0, &Some(intervals)));
    }

    #[test]
    fn does_not_flag_naturally_varied_timing() {
        // Realistic-looking human variation around a 120ms average.
        let intervals = vec![
            95.0, 140.0, 110.0, 160.0, 100.0, 130.0, 90.0, 150.0, 120.0, 105.0, 135.0, 115.0, 145.0, 95.0,
            125.0, 110.0, 155.0, 100.0, 130.0, 120.0, 90.0, 140.0, 105.0, 160.0, 115.0, 135.0, 95.0, 150.0,
            120.0, 110.0,
        ];
        assert!(!should_flag(90.0, &Some(intervals)));
    }

    #[test]
    fn ignores_too_few_samples() {
        let intervals: Vec<f64> = (0..5).map(|_| 120.0).collect();
        assert!(!should_flag(90.0, &Some(intervals)));
    }
}
