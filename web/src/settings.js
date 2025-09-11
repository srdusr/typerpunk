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
    soundTheme: 'off',
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
