import { CLOSE_ICON } from './icons.js';
import { getProfileStats } from '../profileStats.js';
import { getAllPersonalBests } from '../pb.js';
import { escapeHtml } from '../util.js';
import { drawProgressChart } from '../chart.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';

// modeKey format is set in app.js: "words-25", "time-30", "quote-<category>".
function modeLabel(modeKey) {
    const [kind, arg] = modeKey.split('-');
    if (kind === 'words') return `Words · ${arg}`;
    if (kind === 'time') return `Time · ${arg}s`;
    if (kind === 'quote') return arg === 'random' ? 'Random' : arg.charAt(0).toUpperCase() + arg.slice(1);
    return modeKey;
}

function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString();
}

export function renderStatsScreen(root, { onBack, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    const profile = getProfileStats();
    const bests = getAllPersonalBests();

    root.innerHTML = `
        <div class="stats-screen">
            <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
            <h2>Stats</h2>

            ${profile.testsCompleted > 0 ? `
            <div class="stats-summary">
                <div class="menu-stat"><div class="stat-label">Tests</div><div class="stat-value">${profile.testsCompleted}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg WPM</div><div class="stat-value">${profile.averageWpm}</div></div>
                <div class="menu-stat"><div class="stat-label">Best WPM</div><div class="stat-value">${Math.round(profile.bestWpm)}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg Acc</div><div class="stat-value">${profile.averageAccuracy}%</div></div>
                <div class="menu-stat"><div class="stat-label">Streak</div><div class="stat-value">${profile.streakDays}d</div></div>
                <div class="menu-stat"><div class="stat-label">Time Typed</div><div class="stat-value">${Math.round(profile.totalTimeSeconds / 60)}m</div></div>
            </div>
            ` : `<div class="stats-empty">No tests completed yet - finish a test to start tracking stats.</div>`}

            <h3>Personal bests</h3>
            ${bests.length > 0 ? `
            <div class="stats-pb-list">
                ${bests.map(b => `
                    <div class="stats-pb-row">
                        <div class="stats-pb-mode">${escapeHtml(modeLabel(b.modeKey))}</div>
                        <div class="stats-pb-wpm">${Math.round(b.wpm)} wpm</div>
                        <div class="stats-pb-date">${formatDate(b.date)}</div>
                    </div>
                `).join('')}
            </div>
            ` : `<div class="stats-empty">No personal bests recorded yet.</div>`}

            <h3>Progress</h3>
            ${profile.history.length > 1
                ? `<div class="stats-chart"><canvas></canvas></div>`
                : `<div class="stats-placeholder">Complete a few more tests to see a progress chart.</div>`}

        </div>
    `;

    root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
    attachTooltips(root);
    const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

    const canvas = root.querySelector('.stats-chart canvas');
    let cleanupResize = () => {};
    if (canvas) {
        const redraw = () => drawProgressChart(canvas, profile.history);
        redraw();
        window.addEventListener('resize', redraw);
        cleanupResize = () => window.removeEventListener('resize', redraw);
    }

    const cleanupRail = renderCornerRail(root, { onShowStats: null, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });

    return () => {
        cleanupResize();
        cleanupTheme();
        cleanupRail();
    };
}
