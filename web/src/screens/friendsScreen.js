import { CLOSE_ICON } from './icons.js';
import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, ApiError } from '../api.js';
import { getUser, onAuthChange } from '../auth.js';

// onShowFriends is accepted but not supplied by app.js for this screen - the
// top rail's Friends control already points here, so it has nowhere to go.
// Declared so the shared rail call below resolves.
export function renderFriendsScreen(root, { onBack, onShowFriends, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowMultiplayer, onShowStore }) {
    let data = { friends: [], incoming_requests: [], outgoing_requests: [] };
    let loadError = null;

    async function load() {
        if (!getUser()) return;
        try {
            data = await api.get('/api/friends');
            loadError = null;
        } catch (err) {
            loadError = err instanceof ApiError ? err.message : 'network error';
        }
    }

    function signedOutMarkup() {
        return `<div class="stats-empty">Sign in to add friends and compare stats.</div>
                <button class="menu-button" data-action="go-account">Sign In</button>`;
    }

    function signedInMarkup() {
        return `
            <form class="account-form friends-add-form">
                <input class="account-input" type="text" name="username" placeholder="Add by username" required>
                <button class="menu-button small" type="submit">Send Request</button>
                <div class="custom-error friends-add-error"></div>
            </form>

            ${data.incoming_requests.length > 0 ? `
            <h3>Requests</h3>
            <div class="leaderboard-list">
                ${data.incoming_requests.map(r => `
                    <div class="leaderboard-row">
                        <div class="leaderboard-name">${escapeHtml(r.username)}</div>
                        <button class="menu-button small" data-action="accept" data-id="${r.friendship_id}">Accept</button>
                        <button class="menu-button small quiet" data-action="decline" data-id="${r.friendship_id}">Decline</button>
                    </div>
                `).join('')}
            </div>` : ''}

            ${data.outgoing_requests.length > 0 ? `
            <h3>Sent</h3>
            <div class="leaderboard-list">
                ${data.outgoing_requests.map(r => `
                    <div class="leaderboard-row">
                        <div class="leaderboard-name">${escapeHtml(r.username)}</div>
                        <div class="leaderboard-acc">Pending</div>
                        <button class="menu-button small quiet" data-action="cancel" data-id="${r.friendship_id}">Cancel</button>
                    </div>
                `).join('')}
            </div>` : ''}

            <h3>Friends</h3>
            ${data.friends.length > 0 ? `
            <div class="leaderboard-list">
                ${data.friends.map(f => `
                    <div class="leaderboard-row">
                        <div class="leaderboard-name">${escapeHtml(f.username)}</div>
                        <button class="menu-button small quiet" data-action="unfriend" data-id="${f.friendship_id}">Remove</button>
                    </div>
                `).join('')}
            </div>` : `<div class="stats-empty">No friends yet - add one by username above.</div>`}

            ${loadError ? `<div class="custom-error">${escapeHtml(loadError)}</div>` : ''}
        `;
    }

    function render() {
        const user = getUser();
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Friends</h2>
                ${user ? signedInMarkup() : signedOutMarkup()}
            </div>
        `;

        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

        const goAccount = root.querySelector('[data-action="go-account"]');
        if (goAccount) goAccount.addEventListener('click', onShowAccount);

        const addForm = root.querySelector('.friends-add-form');
        if (addForm) {
            addForm.addEventListener('submit', async e => {
                e.preventDefault();
                const errorEl = addForm.querySelector('.friends-add-error');
                errorEl.textContent = '';
                const username = addForm.username.value.trim();
                try {
                    await api.post('/api/friends/request', { username });
                    addForm.username.value = '';
                    await load();
                    rerender();
                } catch (err) {
                    errorEl.textContent = err instanceof ApiError ? err.message : 'Something went wrong - try again.';
                }
            });
        }

        root.querySelectorAll('[data-action="accept"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await api.post(`/api/friends/${btn.dataset.id}/accept`).catch(() => {});
                await load();
                rerender();
            });
        });
        root.querySelectorAll('[data-action="decline"], [data-action="cancel"], [data-action="unfriend"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                await api.delete(`/api/friends/${btn.dataset.id}`).catch(() => {});
                await load();
                rerender();
            });
        });

        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowMultiplayer, onShowStore });
        return () => {
            cleanupTheme();
            cleanupRail();
        };
    }

    let cleanup;
    function rerender() {
        if (cleanup) cleanup();
        cleanup = render();
    }

    rerender();
    load().then(rerender);
    const unsubscribeAuth = onAuthChange(() => { load().then(rerender); });

    return () => {
        unsubscribeAuth();
        if (cleanup) cleanup();
    };
}
