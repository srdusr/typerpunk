const STORAGE_KEY = 'typerpunk:pb';

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

export function getPersonalBest(modeKey) {
    if (!modeKey) return null;
    return load()[modeKey] || null;
}

// All recorded bests, best-WPM first, for a full stats/profile view rather
// than a single mode's lookup.
export function getAllPersonalBests() {
    const all = load();
    return Object.entries(all)
        .map(([modeKey, record]) => ({ modeKey, ...record }))
        .sort((a, b) => b.wpm - a.wpm);
}

// Reconciles local bests with the server's on sign-in - takes max(local,
// remote) per mode rather than overwriting, so a best set on this device
// before ever signing in isn't lost just because the server hadn't seen it
// yet. Guests never call this; the account has to exist first.
export function mergeRemoteBests(remoteBests) {
    if (!Array.isArray(remoteBests) || remoteBests.length === 0) return;
    const all = load();
    for (const { mode_key: modeKey, wpm, date } of remoteBests) {
        const local = all[modeKey];
        if (!local || wpm > local.wpm) {
            all[modeKey] = { wpm, date: date ? Date.parse(date) || Date.now() : Date.now() };
        }
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
}

// Records a finished test's WPM against its mode's best, updating storage
// only when it's actually a new best. Returns the previous best (or null)
// and whether this run just beat it, so the end screen can show both in one
// read without a separate lookup.
export function recordResult(modeKey, wpm) {
    if (!modeKey) return { isNewBest: false, previous: null };
    const all = load();
    const previous = all[modeKey] || null;
    const isNewBest = !previous || wpm > previous.wpm;
    if (isNewBest) {
        all[modeKey] = { wpm, date: Date.now() };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch {}
    }
    return { isNewBest, previous: previous ? previous.wpm : null };
}
