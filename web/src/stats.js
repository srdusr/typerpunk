export function emptyStats() {
    return {
        wpm: 0,
        rawWpm: 0,
        keystrokes: 0,
        accuracy: 100,
        time: 0,
        correctChars: 0,
        incorrectChars: 0,
        totalChars: 0,
        currentStreak: 0,
        bestStreak: 0,
    };
}

// `totalKeystrokes` is a persistent, never-decremented count of every forward
// keystroke made during the test, including ones later backspaced away. It
// must be tracked externally (see typingGame.js) because a backspaced
// mistake is no longer present in `input` by the time this runs - without
// it, raw WPM would silently collapse to equal WPM whenever the final input
// happens to be fully correct, hiding every corrected mistake. Falls back to
// `input.length` (final-state only) when the caller doesn't track it.
export function calculateStats(input, text, elapsedTime, totalKeystrokes) {
    let correct = 0;
    let totalErrors = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    const hasStartedTyping = input.length > 0;

    for (let i = 0; i < input.length; i++) {
        if (i < text.length && input[i] === text[i]) {
            correct++;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
        } else {
            totalErrors++;
            currentStreak = 0;
        }
    }

    const totalTyped = input.length;
    const accuracy = !hasStartedTyping ? 100 : Math.max(0, Math.min(100, (correct / totalTyped) * 100));
    const wpm = elapsedTime === 0 ? 0 : (correct / 5) / (elapsedTime / 60);
    // Raw WPM: same formula as WPM, but counting every keystroke ever made
    // (right, wrong, or later corrected) instead of only correct ones --
    // this is how MonkeyType/TypeRacer define it: raw speed ignores accuracy
    // entirely, including keystrokes you fixed with backspace.
    const rawCount = totalKeystrokes ?? totalTyped;
    const rawWpm = elapsedTime === 0 ? 0 : (rawCount / 5) / (elapsedTime / 60);

    return {
        wpm,
        rawWpm,
        accuracy,
        time: elapsedTime,
        correctChars: correct,
        incorrectChars: totalErrors,
        totalChars: text.length,
        // Every forward keystroke of the test, corrected-away ones included --
        // the same figure rawWpm is derived from. Reported on the end screen
        // in its own right, the way 10FastFingers does.
        keystrokes: rawCount,
        currentStreak,
        bestStreak,
    };
}
