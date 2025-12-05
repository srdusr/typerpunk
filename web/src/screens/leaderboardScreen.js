import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { FLAIR_ICONS, CLOSE_ICON } from './icons.js';

const WORD_COUNTS = [10, 25, 50, 100];
const TIME_DURATIONS = [15, 30, 60, 120];

// Scoped to Words/Time only, not the open-ended quote categories - those
// grow with the text pack and don't make a stable, comparable leaderboard
// mode the way a fixed word count or time duration does.
const MODES = [
    ...TIME_DURATIONS.map(d => ({ key: `time-${d}`, label: `Time ${d}s` })),
    ...WORD_COUNTS.map(w => ({ key: `words-${w}`, label: `Words ${w}` })),
];

function formatDate(iso) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString();
}

export function renderLeaderboardScreen(root, { onBack, onShowPublicProfile, onShowStats, onShowPlaceholder, onShowAccount, onShowFriends, onShowMultiplayer, onShowStore }) {
    let selectedMode = MODES[1].key; // time-30, matches the app's own default mode
    let desktopOnly = false;

    function rowsMarkup(state) {
        if (state.status === 'loading') return `<div class="stats-empty">Loading...</div>`;
        if (state.status === 'error') return `<div class="stats-empty">Could not load the leaderboard - ${escapeHtml(state.message)}</div>`;
        if (state.entries.length === 0) return `<div class="stats-empty">No results yet for this mode - be the first.</div>`;
        return `
            <div class="leaderboard-list">
                ${state.entries.map((e, i) => `
                    <div class="leaderboard-row">
                        <div class="leaderboard-rank">#${i + 1}</div>
                        <button class="leaderboard-name"${e.is_bot ? ' disabled' : ` data-username="${escapeHtml(e.username)}"`}>${escapeHtml(e.username)}${e.flair && FLAIR_ICONS[e.flair] ? `<span class="leaderboard-flair" data-tooltip="Equipped flair">${FLAIR_ICONS[e.flair]}</span>` : ''}</button>
                        ${e.is_bot ? `<span class="leaderboard-bot-badge" data-tooltip="A practice opponent, not a human result">bot</span>` : ''}
                        ${e.device_type === 'mobile' ? `<span class="leaderboard-device-badge" data-tooltip="Typed on a touchscreen device">mobile</span>` : ''}
                        <div class="leaderboard-wpm">${Math.round(e.wpm)} wpm</div>
                        <div class="leaderboard-acc">${Math.round(e.accuracy)}%</div>
                        <div class="leaderboard-date">${formatDate(e.date)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    root.innerHTML = `
        <div class="stats-screen">
            <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
            <h2>Leaderboard</h2>
            <div class="leaderboard-modes">
                ${MODES.map(m => `<button class="menu-button small quiet${m.key === selectedMode ? ' active' : ''}" data-mode="${m.key}">${escapeHtml(m.label)}</button>`).join('')}
            </div>
            <button class="menu-button small quiet" data-action="toggle-device-filter" data-tooltip="Mobile results still count for personal stats - this only filters what's shown here.">Devices: All</button>
            <div class="leaderboard-results"></div>
        </div>
    `;

    root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
    attachTooltips(root);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

    const resultsEl = root.querySelector('.leaderboard-results');
    let requestToken = 0;
    async function load() {
        const token = ++requestToken;
        resultsEl.innerHTML = rowsMarkup({ status: 'loading' });
        try {
            const params = new URLSearchParams({ mode: selectedMode });
            if (desktopOnly) params.set('device', 'desktop');
            const entries = await api.get(`/api/leaderboard?${params.toString()}`);
            if (token !== requestToken) return; // a newer mode pick already superseded this request
            resultsEl.innerHTML = rowsMarkup({ status: 'ok', entries });
            // Scoped to resultsEl, not the whole root - attachTooltips
            // already ran once for the rest of the screen at render time,
            // and re-running it there would double-bind those elements'
            // listeners on every reload.
            attachTooltips(resultsEl);
        } catch (err) {
            if (token !== requestToken) return;
            const message = err instanceof ApiError ? err.message : 'network error';
            resultsEl.innerHTML = rowsMarkup({ status: 'error', message });
        }
    }

    root.querySelectorAll('.leaderboard-modes [data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedMode = btn.dataset.mode;
            root.querySelectorAll('.leaderboard-modes [data-mode]').forEach(b => b.classList.toggle('ghost', b !== btn));
            load();
        });
    });

    const deviceFilterBtn = root.querySelector('[data-action="toggle-device-filter"]');
    deviceFilterBtn.addEventListener('click', () => {
        desktopOnly = !desktopOnly;
        deviceFilterBtn.textContent = `Devices: ${desktopOnly ? 'Desktop only' : 'All'}`;
        // A filter that is doing something should look like it is.
        deviceFilterBtn.classList.toggle('active', desktopOnly);
        deviceFilterBtn.classList.toggle('ghost', !desktopOnly);
        load();
    });

    // Delegated rather than attached per-row - resultsEl's rows get
    // replaced wholesale on every load(), so a listener attached to a
    // specific row would be gone the next time the mode changes.
    resultsEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-username]');
        if (btn) onShowPublicProfile(btn.dataset.username);
    });

    load();

    const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowFriends, onShowMultiplayer, onShowStore });

    return () => {
        cleanupTheme();
        cleanupRail();
    };
}
