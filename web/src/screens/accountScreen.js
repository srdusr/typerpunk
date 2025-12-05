import { CLOSE_ICON } from './icons.js';
import { escapeHtml } from '../util.js';
import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { getUser, onAuthChange, register, login, logout, ApiError } from '../auth.js';
import { api, apiUrl } from '../api.js';

// onShowAccount is accepted but intentionally not supplied by app.js for this
// screen: the top rail's identity control is already pointing here, so it has
// nothing to navigate to. Declared so the shared rail call below resolves.
export function renderAccountScreen(root, { onBack, onShowAccount, onShowStats, onShowPlaceholder, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    let mode = 'login'; // 'login' | 'register'
    let stopped = false;
    // null = checking, true/false once the now-playing probe resolves --
    // there's no dedicated "am I connected" endpoint, but now-playing
    // itself 404s specifically when there's no stored Spotify connection,
    // so it doubles as the status check.
    let spotifyConnected = null;
    let spotifyCheckedForUserId = null;

    function checkSpotifyStatus(userId) {
        spotifyCheckedForUserId = userId;
        spotifyConnected = null;
        api.get('/api/spotify/now-playing')
            .then(() => { spotifyConnected = true; rerender(); })
            .catch(err => { spotifyConnected = !(err instanceof ApiError && err.status === 404); rerender(); });
    }

    function spotifyStatusMarkup() {
        if (spotifyConnected === null) return `<div class="account-spotify-status">Checking...</div>`;
        if (spotifyConnected) return `<div class="account-spotify-status">Connected</div>`;
        return `<a class="menu-button small" href="${apiUrl('/api/spotify/login')}">Connect Spotify</a>`;
    }

    function formMarkup(user) {
        if (user) {
            return `
                <div class="account-signed-in">Signed in as <strong>${escapeHtml(user.username)}</strong></div>
                <button class="menu-button" data-action="logout">Log Out</button>
                <div class="settings-hint">Spotify</div>
                ${spotifyStatusMarkup()}
            `;
        }
        return `
            <div class="account-tabs">
                <button class="menu-button small${mode === 'login' ? '' : ' ghost'}" data-action="tab-login">Log In</button>
                <button class="menu-button small${mode === 'register' ? '' : ' ghost'}" data-action="tab-register">Register</button>
            </div>
            <form class="account-form">
                <input class="account-input" type="text" name="username" placeholder="Username" autocomplete="username" required>
                <input class="account-input" type="password" name="password" placeholder="Password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
                <button class="menu-button" type="submit">${mode === 'login' ? 'Log In' : 'Create Account'}</button>
                <div class="custom-error account-error"></div>
            </form>
        `;
    }

    function render() {
        const user = getUser();
        root.innerHTML = `
            <div class="stats-screen">
                <button class="screen-close" data-action="menu" aria-label="Close" data-tooltip="Close (Esc)">${CLOSE_ICON}</button>
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Account</h2>
                <div class="account-panel">${formMarkup(user)}</div>
            </div>
        `;

        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', onBack));
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });

        const logoutBtn = root.querySelector('[data-action="logout"]');
        if (logoutBtn) logoutBtn.addEventListener('click', async () => { await logout(); });

        const tabLogin = root.querySelector('[data-action="tab-login"]');
        const tabRegister = root.querySelector('[data-action="tab-register"]');
        if (tabLogin) tabLogin.addEventListener('click', () => { mode = 'login'; rerender(); });
        if (tabRegister) tabRegister.addEventListener('click', () => { mode = 'register'; rerender(); });

        const form = root.querySelector('.account-form');
        if (form) {
            form.addEventListener('submit', async e => {
                e.preventDefault();
                const errorEl = form.querySelector('.account-error');
                errorEl.textContent = '';
                const username = form.username.value.trim();
                const password = form.password.value;
                try {
                    if (mode === 'login') await login(username, password);
                    else await register(username, password);
                } catch (err) {
                    errorEl.textContent = err instanceof ApiError ? err.message : 'Something went wrong - try again.';
                }
            });
        }

        if (user && spotifyCheckedForUserId !== user.id) checkSpotifyStatus(user.id);
        if (!user) spotifyCheckedForUserId = null;

        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });
        return () => {
            cleanupTheme();
            cleanupRail();
        };
    }

    let cleanup = render();
    function rerender() {
        if (stopped) return;
        cleanup();
        cleanup = render();
    }
    const unsubscribeAuth = onAuthChange(rerender);

    return () => {
        stopped = true;
        unsubscribeAuth();
        cleanup();
    };
}
