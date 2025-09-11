const STORAGE_KEY = 'typerpunk:profile';
// Caps how many past results the progress chart can show - unbounded
// growth would slowly bloat localStorage for a long-lived install with no
// benefit, since the chart only ever renders the most recent entries anyway.
const MAX_HISTORY = 100;

function defaults() {
    return {
        testsCompleted: 0,
        totalTimeSeconds: 0,
        totalWpm: 0,
        totalAccuracy: 0,
        bestWpm: 0,
        lastTestDate: null,
        streakDays: 0,
        history: [],
    };
}

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return raw && typeof raw === 'object' ? { ...defaults(), ...raw } : defaults();
    } catch {
        return defaults();
    }
}

export function getProfileStats() {
    const s = load();
    return {
        ...s,
        averageWpm: s.testsCompleted ? Math.round(s.totalWpm / s.testsCompleted) : 0,
        averageAccuracy: s.testsCompleted ? Math.round(s.totalAccuracy / s.testsCompleted) : 0,
    };
}

// Called once per finished test (any mode, including custom text) - these
// are lifetime activity totals, not per-mode bests, so unlike pb.js every
// completed test counts, not just new records.
export function recordTest({ wpm, accuracy, time }) {
    const s = load();
    s.testsCompleted += 1;
    s.totalTimeSeconds += time;
    s.totalWpm += wpm;
    s.totalAccuracy += accuracy;
    s.bestWpm = Math.max(s.bestWpm, wpm);

    const today = new Date().toDateString();
    const lastDay = s.lastTestDate ? new Date(s.lastTestDate).toDateString() : null;
    if (lastDay !== today) {
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        s.streakDays = lastDay === yesterday ? s.streakDays + 1 : 1;
    }
    s.lastTestDate = Date.now();

    s.history.push({ wpm, accuracy, date: s.lastTestDate });
    if (s.history.length > MAX_HISTORY) s.history = s.history.slice(-MAX_HISTORY);

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
    return s;
}
