import { escapeHtml } from '../util.js';
import { logoLockup } from '../logo.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { FLAIR_ICONS, CLOSE_ICON } from './icons.js';

// modeKey format is set in app.js: "words-25", "time-30", "quote-<category>".
function modeLabel(modeKey) {
    const [kind, arg] = modeKey.split('-');
    if (kind === 'words') return `Words · ${arg}`;
    if (kind === 'time') return `Time · ${arg}s`;
    if (kind === 'quote') return arg === 'random' ? 'Random' : arg.charAt(0).toUpperCase() + arg.slice(1);
    return modeKey;
}

function formatDate(iso) {
    const t = Date.parse(iso);
    return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString();
}

// Read-only - no settings, no actions on someone else's data, just what
// /api/users/:username/public hands back (the same aggregate shape
// /api/stats/me uses for yourself, minus anything private).
export function renderPublicProfileScreen(root, { username, onBack, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    function bodyMarkup(state) {
        if (state.status === 'loading') return `<div class="stats-empty">Loading...</div>`;
        if (state.status === 'error') return `<div class="stats-empty">${escapeHtml(state.message)}</div>`;
        const p = state.profile;
        return `
            <div class="stats-summary">
                <div class="menu-stat"><div class="stat-label">Tests</div><div class="stat-value">${p.tests_completed}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg WPM</div><div class="stat-value">${Math.round(p.average_wpm)}</div></div>
                <div class="menu-stat"><div class="stat-label">Best WPM</div><div class="stat-value">${Math.round(p.best_wpm)}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg Acc</div><div class="stat-value">${Math.round(p.average_accuracy)}%</div></div>
            </div>
            <div class="stats-placeholder">Joined ${formatDate(p.joined_at)}</div>
            <h3>Personal bests</h3>
            ${p.personal_bests.length > 0 ? `
            <div class="stats-pb-list">
                ${p.personal_bests.map(b => `
                    <div class="stats-pb-row">
                        <div class="stats-pb-mode">${escapeHtml(modeLabel(b.mode_key))}</div>
                        <div class="stats-pb-wpm">${Math.round(b.wpm)} wpm</div>
                        <div class="stats-pb-date">${formatDate(b.date)}</div>
                    </div>
                `).join('')}
            </div>
            ` : `<div class="stats-empty">No personal bests recorded yet.</div>`}
        `;
    }

    root.innerHTML = `
        <div class="stats-screen">
            <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                ${logoLockup()}
            <h2 class="public-profile-heading">${escapeHtml(username)}</h2>
            <div class="public-profile-body"></div>
        </div>
    `;

    root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
    attachTooltips(root);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

    const bodyEl = root.querySelector('.public-profile-body');
    const headingEl = root.querySelector('.public-profile-heading');
    bodyEl.innerHTML = bodyMarkup({ status: 'loading' });
    api.get(`/api/users/${encodeURIComponent(username)}/public`)
        .then(profile => {
            bodyEl.innerHTML = bodyMarkup({ status: 'ok', profile });
            if (profile.flair && FLAIR_ICONS[profile.flair]) {
                headingEl.innerHTML = `${escapeHtml(username)}<span class="leaderboard-flair" data-tooltip="Equipped flair">${FLAIR_ICONS[profile.flair]}</span>`;
                // Scoped to headingEl, not the whole root - see the same
                // note in leaderboardScreen.js's load().
                attachTooltips(headingEl);
            }
        })
        .catch(err => {
            const message = err instanceof ApiError && err.status === 404
                ? `No profile found for "${username}".`
                : 'Could not load this profile - try again.';
            bodyEl.innerHTML = bodyMarkup({ status: 'error', message });
        });

    const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });

    return () => {
        cleanupTheme();
        cleanupRail();
    };
}
