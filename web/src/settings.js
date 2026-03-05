const STORAGE_KEY = 'typerpunk:settings';

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

let settings = {
    skipMenu: false,
    favoriteMode: null,
    wordCount: 25,
    timeDuration: 30,
    wordsPunctuation: false,
    wordsNumbers: false,
    caretBlink: true,
    hideLiveStats: false,
    blindMode: false,
    // On by default. A browser will not start an audio context before a user
    // gesture, and the first keystroke is one, so the first tone plays with
    // the first character typed rather than being swallowed. Anyone who does
    // not want it has the speaker in the top rail.
    soundTheme: 'mech',
    wordListTier: 'common',
    // Which vocabulary the generated-word modes draw from (see languages.js).
    language: 'en',
    ...load(),
};

function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

export function getSettings() {
    return { ...settings };
}

export function updateSettings(patch) {
    settings = { ...settings, ...patch };
    save();
}
