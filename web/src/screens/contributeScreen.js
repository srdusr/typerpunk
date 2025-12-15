import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { getUser } from '../auth.js';
import { CLOSE_ICON } from './icons.js';

// Submitting a passage, and - for moderators - reviewing what others have
// submitted. A bundled dataset stops growing at whatever fits in the
// repository; this is how a corpus gets past that.
const CATEGORIES = [
    'quotes', 'literature', 'movies', 'anime', 'science', 'history',
    'technology', 'nature', 'philosophy', 'business', 'general',
    'programming', 'shell', 'sysadmin', 'hacking',
];

// Mirrors the server's own limits, so the count turns red before a submission
// is rejected rather than after.
const MIN_CONTENT = 40;
const MAX_CONTENT = 600;

export function renderContributeScreen(root, { onBack, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    let mine = [];
    let queue = [];
    let isModerator = false;
    let isAdmin = false;
    let roleHolders = [];
    let userSearch = [];
    let cleanupInner = null;

    function statusLabel(s) {
        if (s === 'approved') return 'Approved';
        if (s === 'rejected') return 'Not accepted';
        return 'Awaiting review';
    }

    async function load() {
        if (!getUser()) return;
        try { mine = await api.get('/api/texts/mine'); } catch { mine = []; }
        // A 401 here simply means "not a moderator", which is the ordinary
        // case rather than an error worth showing.
        try { queue = await api.get('/api/texts/queue'); isModerator = true; }
        catch { queue = []; isModerator = false; }
        // Same shape: a 401 here means "not an administrator", which is the
        // ordinary case for almost everyone.
        try { roleHolders = await api.get('/api/admin/users'); isAdmin = true; }
        catch { roleHolders = []; isAdmin = false; }
    }

    function submissionRow(s, moderating) {
        return `
            <div class="submission-row" data-id="${escapeHtml(s.id)}">
                <div class="submission-head">
                    <span class="submission-category">${escapeHtml(s.category)}</span>
                    ${moderating && s.submitted_by ? `<span class="submission-by">by ${escapeHtml(s.submitted_by)}</span>` : ''}
                    <span class="submission-status status-${escapeHtml(s.status)}">${statusLabel(s.status)}</span>
                </div>
                <div class="submission-content">${escapeHtml(s.content)}</div>
                ${s.attribution ? `<div class="submission-attribution">&mdash; ${escapeHtml(s.attribution)}</div>` : ''}
                ${s.reject_reason ? `<div class="submission-reason">${escapeHtml(s.reject_reason)}</div>` : ''}
                ${moderating ? `
                    <div class="submission-actions">
                        <button class="menu-button small primary" data-action="approve">Approve</button>
                        <button class="menu-button small quiet" data-action="reject">Reject</button>
                    </div>` : ''}
            </div>`;
    }

    function render() {
        const user = getUser();
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Contribute a passage</h2>
                ${!user ? `
                    <div class="stats-empty">Sign in to submit a passage. Everything submitted is reviewed before anyone types it.</div>
                    <button class="menu-button" data-action="go-account">Sign In</button>
                ` : `
                    <div class="settings-hint">Something worth typing: a line from a book, a film, a song, or a command worth knowing. It is reviewed before it reaches anyone else.</div>
                    <form class="account-form contribute-form">
                        <textarea class="custom-textarea contribute-content" rows="3" placeholder="The passage itself" required></textarea>
                        <div class="contribute-count"><span class="contribute-len">0</span> / ${MAX_CONTENT}</div>
                        <input class="account-input contribute-attribution" type="text" placeholder="Where it is from (author, film, book)" maxlength="120">
                        <select class="account-input contribute-category">
                            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <button class="menu-button primary" type="submit">Submit for review</button>
                        <div class="custom-error contribute-error"></div>
                    </form>

                    ${mine.length ? `
                        <h3>Your submissions</h3>
                        <div class="submission-list">${mine.map(s => submissionRow(s, false)).join('')}</div>
                    ` : ''}

                    ${isAdmin ? `
                        <h3>Moderators</h3>
                        <div class="settings-hint">Moderators review submitted passages. An administrator's own role is managed by the server, not here.</div>
                        <form class="account-form admin-search-form">
                            <input class="account-input admin-search" type="text" placeholder="Find a user by name" autocomplete="off">
                            <button class="menu-button small" type="submit">Search</button>
                        </form>
                        <div class="submission-list admin-user-list">
                            ${(userSearch.length ? userSearch : roleHolders).map(u => `
                                <div class="admin-user" data-username="${escapeHtml(u.username)}">
                                    <span class="admin-user-name">${escapeHtml(u.username)}</span>
                                    ${u.is_admin ? '<span class="admin-user-role">admin</span>' : ''}
                                    ${u.is_moderator && !u.is_admin ? '<span class="admin-user-role">moderator</span>' : ''}
                                    ${u.is_bot ? '<span class="admin-user-role">bot</span>' : ''}
                                    ${u.is_admin ? '' : `<button class="menu-button small ${u.is_moderator ? 'quiet' : ''}" data-action="set-role" data-username="${escapeHtml(u.username)}" data-moderator="${u.is_moderator ? 'false' : 'true'}">${u.is_moderator ? 'Remove' : 'Make moderator'}</button>`}
                                </div>
                            `).join('') || '<div class="stats-empty">No moderators yet. Search for a user to appoint one.</div>'}
                        </div>
                    ` : ''}

                    ${isModerator ? `
                        <h3>Review queue${queue.length ? ` (${queue.length})` : ''}</h3>
                        ${queue.length
                            ? `<div class="submission-list">${queue.map(s => submissionRow(s, true)).join('')}</div>`
                            : `<div class="stats-empty">Nothing waiting.</div>`}
                    ` : ''}
                `}
            </div>
        `;

        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
        root.querySelector('[data-action="go-account"]')?.addEventListener('click', onShowAccount);
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowLeaderboard, onShowMultiplayer, onShowStore });
        cleanupInner = () => { cleanupTheme(); cleanupRail(); };

        const form = root.querySelector('.contribute-form');
        if (form) {
            const content = form.querySelector('.contribute-content');
            const lenEl = form.querySelector('.contribute-len');
            const errorEl = form.querySelector('.contribute-error');
            const paint = () => {
                const n = content.value.trim().length;
                lenEl.textContent = String(n);
                lenEl.classList.toggle('bad', n > 0 && (n < MIN_CONTENT || n > MAX_CONTENT));
            };
            content.addEventListener('input', paint);
            paint();

            form.addEventListener('submit', async e => {
                e.preventDefault();
                errorEl.textContent = '';
                try {
                    await api.post('/api/texts', {
                        category: form.querySelector('.contribute-category').value,
                        content: content.value,
                        attribution: form.querySelector('.contribute-attribution').value || null,
                    });
                    await load();
                    render();
                } catch (err) {
                    errorEl.textContent = err instanceof ApiError ? err.message : 'Could not submit - try again.';
                }
            });
        }

        const searchForm = root.querySelector('.admin-search-form');
        if (searchForm) {
            searchForm.addEventListener('submit', async e => {
                e.preventDefault();
                const q = searchForm.querySelector('.admin-search').value.trim();
                try { userSearch = q ? await api.get(`/api/admin/users?q=${encodeURIComponent(q)}`) : []; }
                catch { userSearch = []; }
                render();
            });
        }
        root.querySelectorAll('[data-action="set-role"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.post(`/api/admin/users/${encodeURIComponent(btn.dataset.username)}/role`,
                                   { moderator: btn.dataset.moderator === 'true' });
                } catch { /* reloading below shows whatever actually happened */ }
                userSearch = [];
                await load();
                render();
            });
        });

        root.querySelectorAll('.submission-actions button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const row = btn.closest('.submission-row');
                const decision = btn.dataset.action === 'approve' ? 'approve' : 'reject';
                const reason = decision === 'reject'
                    ? window.prompt('Why is this not accepted? (optional, shown to the submitter)') || null
                    : null;
                try {
                    await api.post(`/api/texts/${row.dataset.id}/review`, { decision, reason });
                    await load();
                    render();
                } catch {
                    // Someone else reviewed it first; reloading shows the truth.
                    await load();
                    render();
                }
            });
        });
    }

    load().then(render);
    render();

    return () => { if (cleanupInner) cleanupInner(); };
}
