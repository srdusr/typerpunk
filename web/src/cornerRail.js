import { STATS_ICON, SETTINGS_ICON, LEADERBOARD_ICON, STORE_ICON } from './screens/icons.js';
import { attachTooltips } from './tooltip.js';
import { getSettings, updateSettings } from './settings.js';

const SOUND_THEMES = ['off', 'click', 'mech'];
function soundThemeLabel(theme) {
    if (theme === 'click') return 'Click';
    if (theme === 'mech') return 'Mechanical';
    return 'Off';
}

// The icon rails, in the same places on every screen - the main menu builds
// the identical clusters inline (see mainMenu.js) because it owns its own
// Settings panel, so the two must stay visually in step.
//
// Bottom-left: what customises the app (Settings, Store). Bottom-right: your
// numbers (Stats, Leaderboard). Identity - Account and Friends, the latter
// carrying a count of friends online - lives in the top-right rail beside
// the language and theme controls (see topRail.js). The top-left is the
// wordmark's alone.
export function renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowLeaderboard, onShowStore }) {
    const settings = getSettings();
    const left = document.createElement('div');
    left.className = 'corner-rail-left';
    left.innerHTML = `
        <div class="rail-settings-group">
            <button class="corner-icon-button" data-action="rail-settings" aria-label="Settings" data-tooltip="Settings">${SETTINGS_ICON}</button>
            <div class="rail-settings-panel" hidden>
                <div class="settings-hint">Typing</div>
                <div class="settings-row-group">
                    <button class="menu-button small quiet" data-action="rail-toggle-live-stats" data-tooltip="Show WPM/ACC while you type, or only reveal them on the end screen.">Live Stats: ${settings.hideLiveStats ? 'Off' : 'On'}</button>
                    <button class="menu-button small quiet" data-action="rail-toggle-caret-blink" data-tooltip="Make the current-character caret blink, or keep it solid.">Blink Caret: ${settings.caretBlink ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="rail-toggle-blind-mode" data-tooltip="Hide correct/incorrect coloring while typing - only revealed on the end screen.">Blind Mode: ${settings.blindMode ? 'On' : 'Off'}</button>
                    <button class="menu-button small quiet" data-action="rail-cycle-sound-theme" data-tooltip="Play a sound on each keystroke. Click to cycle.">Sound: ${soundThemeLabel(settings.soundTheme)}</button>
                </div>
            </div>
        </div>

        ${onShowStore ? `<button class="corner-icon-button" data-action="rail-store" aria-label="Store" data-tooltip="Store">${STORE_ICON}</button>` : ''}
    `;

    const right = document.createElement('div');
    right.className = 'corner-rail-right';
    right.innerHTML = `
        ${onShowStats ? `<button class="corner-icon-button" data-action="rail-stats" aria-label="Stats" data-tooltip="Stats">${STATS_ICON}</button>` : ''}
        ${onShowLeaderboard ? `<button class="corner-icon-button" data-action="rail-leaderboard" aria-label="Leaderboard" data-tooltip="Leaderboard">${LEADERBOARD_ICON}</button>` : ''}
    `;

    root.appendChild(left);
    root.appendChild(right);
    attachTooltips(left);
    attachTooltips(right);

    const statsBtn = right.querySelector('[data-action="rail-stats"]');
    if (statsBtn) statsBtn.addEventListener('click', onShowStats);

    const settingsGroup = left.querySelector('.rail-settings-group');
    const settingsPanel = left.querySelector('.rail-settings-panel');
    left.querySelector('[data-action="rail-settings"]').addEventListener('click', e => {
        e.stopPropagation();
        settingsPanel.hidden = !settingsPanel.hidden;
    });
    const liveStatsBtn = left.querySelector('[data-action="rail-toggle-live-stats"]');
    liveStatsBtn.addEventListener('click', () => {
        const next = !getSettings().hideLiveStats;
        updateSettings({ hideLiveStats: next });
        liveStatsBtn.textContent = `Live Stats: ${next ? 'Off' : 'On'}`;
    });
    const caretBlinkBtn = left.querySelector('[data-action="rail-toggle-caret-blink"]');
    caretBlinkBtn.addEventListener('click', () => {
        const next = !getSettings().caretBlink;
        updateSettings({ caretBlink: next });
        caretBlinkBtn.textContent = `Blink Caret: ${next ? 'On' : 'Off'}`;
    });
    const blindModeBtn = left.querySelector('[data-action="rail-toggle-blind-mode"]');
    blindModeBtn.addEventListener('click', () => {
        const next = !getSettings().blindMode;
        updateSettings({ blindMode: next });
        blindModeBtn.textContent = `Blind Mode: ${next ? 'On' : 'Off'}`;
    });
    const soundThemeBtn = left.querySelector('[data-action="rail-cycle-sound-theme"]');
    soundThemeBtn.addEventListener('click', () => {
        const current = getSettings().soundTheme;
        const next = SOUND_THEMES[(SOUND_THEMES.indexOf(current) + 1) % SOUND_THEMES.length];
        updateSettings({ soundTheme: next });
        soundThemeBtn.textContent = `Sound: ${soundThemeLabel(next)}`;
    });

    const leaderboardBtn = right.querySelector('[data-action="rail-leaderboard"]');
    if (leaderboardBtn) leaderboardBtn.addEventListener('click', onShowLeaderboard);
    const storeBtn = left.querySelector('[data-action="rail-store"]');
    if (storeBtn) storeBtn.addEventListener('click', onShowStore);

    const handleOutsideClick = e => {
        if (!settingsPanel.hidden && !settingsGroup.contains(e.target)) settingsPanel.hidden = true;
    };
    document.addEventListener('click', handleOutsideClick);

    return () => {
        document.removeEventListener('click', handleOutsideClick);
        left.remove();
        right.remove();
    };
}
