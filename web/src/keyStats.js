const STORAGE_KEY = 'typerpunk:keystats';
// Below this many samples a character's average latency/error rate is too
// noisy to act on - a key typed twice that happened to be wrong once looks
// identical to a genuinely hard key without this floor.
const MIN_SAMPLES = 5;

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

function save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// Called once per typed character (correct or not) with how long it took
// since the previous keystroke. Skips whitespace - word gaps have highly
// variable timing for reasons unrelated to how hard a character is to type
// (thinking about the next word, punctuation pauses), and would otherwise
// dominate the latency signal for every character adjacent to a space.
export function recordKeystroke(char, isCorrect, latencyMs) {
    if (!char || /\s/.test(char)) return;
    const data = load();
    const entry = data[char] || { attempts: 0, errors: 0, totalLatency: 0 };
    entry.attempts += 1;
    if (!isCorrect) entry.errors += 1;
    if (latencyMs != null && latencyMs >= 0 && latencyMs < 5000) entry.totalLatency += latencyMs;
    data[char] = entry;
    save(data);
}

// Ranks every character with enough samples by a weak-ness score (error
// rate weighted heaviest, since a mistake matters more than being merely
// slow) and returns the worst `limit`. Empty until enough real typing has
// happened - callers should fall back to plain random text until then.
export function getWeakChars(limit = 12) {
    const data = load();
    const scored = Object.entries(data)
        .filter(([, e]) => e.attempts >= MIN_SAMPLES)
        .map(([char, e]) => ({
            char,
            errorRate: e.errors / e.attempts,
            avgLatency: e.totalLatency / e.attempts,
        }));
    if (scored.length === 0) return [];

    const maxLatency = Math.max(...scored.map(s => s.avgLatency), 1);
    scored.forEach(s => { s.score = s.errorRate * 0.7 + (s.avgLatency / maxLatency) * 0.3; });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.char);
}

export function hasEnoughData() {
    return getWeakChars(1).length > 0;
}
