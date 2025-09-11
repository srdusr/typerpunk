export const Theme = { Light: 'light', Dark: 'dark' };

// Full theme catalog for the gallery. Light/Dark stay the two the corner
// toggle button cycles between; the rest are only reachable from the
// gallery, matching how most typing sites treat "light vs dark" as the
// quick switch and everything else as a deliberate pick.
export const THEMES = [
    { id: 'dark', label: 'Dark', dark: true, primary: '#00ff9d' },
    { id: 'light', label: 'Light', dark: false, primary: '#067a4e' },
    { id: 'dracula', label: 'Dracula', dark: true, primary: '#bd93f9' },
    { id: 'nord', label: 'Nord', dark: true, primary: '#88c0d0' },
    { id: 'solarized', label: 'Solarized', dark: true, primary: '#268bd2' },
    { id: 'gruvbox', label: 'Gruvbox', dark: true, primary: '#fabd2f' },
    { id: 'monokai', label: 'Monokai', dark: true, primary: '#a6e22e' },
];

export function isDarkTheme(id) {
    return THEMES.find(t => t.id === id)?.dark ?? true;
}

const STORAGE_KEY = 'theme';
const listeners = new Set();

let theme = localStorage.getItem(STORAGE_KEY) || Theme.Dark;

// The custom cursor is a per-theme accent, not a fixed brand mark - a
// hardcoded color would sit oddly on Dracula/Nord/etc, so it's regenerated
// from each theme's own primary color instead. Plus-reticle crosshair, not a
// circle - the rest of the UI (buttons, icons.js's angular sun/moon) is all
// sharp corners, and a round cursor read as off-brand next to it. The gap at
// the center (arms don't meet) is what makes it read as a scope reticle
// rather than a plain plus sign.
function cursorDataUri(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M10 1V8 M10 12V19 M1 10H8 M12 10H19" stroke="${color}" stroke-width="1.6"/><rect x="9.3" y="9.3" width="1.4" height="1.4" fill="${color}"/></svg>`;
    return `url("data:image/svg+xml;base64,${btoa(svg)}") 10 10, auto`;
}

function apply(value) {
    document.documentElement.setAttribute('data-theme', value);
    if (document.body) {
        const t = THEMES.find(x => x.id === value);
        document.body.style.cursor = cursorDataUri(t ? t.primary : '#00ff9d');
    }
}
apply(theme);

export function getTheme() {
    return theme;
}

export function setTheme(id) {
    if (!THEMES.some(t => t.id === id)) return;
    theme = id;
    localStorage.setItem(STORAGE_KEY, theme);
    apply(theme);
    for (const fn of listeners) fn(theme);
}

export function toggleTheme() {
    setTheme(theme === Theme.Light ? Theme.Dark : Theme.Light);
}

export function onThemeChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
