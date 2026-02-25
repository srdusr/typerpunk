import { CLOSE_ICON } from './icons.js';
import { logoLockup } from '../logo.js';
import { getProfileStats } from '../profileStats.js';
import { getAllPersonalBests } from '../pb.js';
import { getWeakCharDetails } from '../keyStats.js';
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
    const weakKeys = getWeakCharDetails(8);

    // Derived from the stored history rather than kept as separate counters,
    // so these stay correct for anyone who already has a history recorded.
    const history = profile.history || [];
    const recent = history.slice(-10);
    const recentAvg = recent.length ? Math.round(recent.reduce((a, h) => a + h.wpm, 0) / recent.length) : 0;
    const bestAcc = history.length ? Math.round(Math.max(...history.map(h => h.accuracy))) : 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek = history.filter(h => h.date && new Date(h.date).getTime() >= weekAgo).length;
    // Recent form against the lifetime average: the single most useful thing
    // a stats page can tell you is whether you are getting better.
    const trend = recentAvg && profile.averageWpm ? recentAvg - profile.averageWpm : 0;

    root.innerHTML = `
        <div class="stats-screen">
            <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                ${logoLockup()}
            <h2>Stats</h2>

            ${profile.testsCompleted > 0 ? `
            <div class="stats-summary">
                <div class="menu-stat"><div class="stat-label">Tests</div><div class="stat-value">${profile.testsCompleted}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg WPM</div><div class="stat-value">${profile.averageWpm}</div></div>
                <div class="menu-stat"><div class="stat-label">Best WPM</div><div class="stat-value">${Math.round(profile.bestWpm)}</div></div>
                <div class="menu-stat"><div class="stat-label">Avg Acc</div><div class="stat-value">${profile.averageAccuracy}%</div></div>
                <div class="menu-stat"><div class="stat-label">Streak</div><div class="stat-value">${profile.streakDays}d</div></div>
                <div class="menu-stat"><div class="stat-label">Time Typed</div><div class="stat-value">${Math.round(profile.totalTimeSeconds / 60)}m</div></div>
                <div class="menu-stat" data-tooltip="Average of your last 10 tests, and how that compares with your lifetime average"><div class="stat-label">Last 10</div><div class="stat-value">${recentAvg}${trend ? `<span class="stat-trend ${trend > 0 ? 'up' : 'down'}">${trend > 0 ? '+' : ''}${trend}</span>` : ''}</div></div>
                <div class="menu-stat"><div class="stat-label">Best Acc</div><div class="stat-value">${bestAcc}%</div></div>
                <div class="menu-stat"><div class="stat-label">This Week</div><div class="stat-value">${thisWeek}</div></div>
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

            ${weakKeys.length ? `
            <h3>Weakest keys</h3>
            <div class="settings-hint">What Practice mode targets. Ranked by how often you mistype a key and how long you pause before it.</div>
            <div class="weak-key-list">
                ${weakKeys.map(k => `
                    <div class="weak-key" data-tooltip="${k.errors} wrong out of ${k.attempts} attempts">
                        <span class="weak-key-char">${escapeHtml(k.char)}</span>
                        <span class="weak-key-err">${Math.round(k.errorRate * 100)}%</span>
                        <span class="weak-key-lat">${Math.round(k.avgLatency)}ms</span>
                    </div>
                `).join('')}
            </div>` : ''}

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
