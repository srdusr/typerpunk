import { renderCornerRail } from '../cornerRail.js';
import { attachTooltips } from '../tooltip.js';
import { renderTopRail } from '../topRail.js';
import { api, apiUrl, ApiError } from '../api.js';
import { getUser } from '../auth.js';
import { parseCustomContent } from '../customText.js';
import { escapeHtml } from '../util.js';

const POLL_INTERVAL_MS = 4000;

// Connect Spotify -> poll what's currently playing -> fetch synced lyrics
// for it -> hand the result to onLyricsReady, which app.js implements by
// setting it as the active custom text and starting a game exactly like a
// manually-uploaded .lrc file would - this screen only produces that same
// {name, chunks, language, timed} shape, it doesn't play anything itself.
export function renderLyricsScreen(root, { onBack, onLyricsReady, onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore }) {
    let status = 'checking';
    let message = 'Checking sign-in...';
    let lastTrackKey = null;
    let pollTimer = null;
    let stopped = false;

    function bodyText() {
        if (status === 'signed-out') return 'Sign in first - the Spotify connection is tied to your account.';
        if (status === 'not-connected') return 'Connect your Spotify account to type along with whatever you\'re playing.';
        if (status === 'not-configured') return message;
        return message;
    }

    function render() {
        root.innerHTML = `
            <div class="stats-screen">
                <div class="logo" data-action="menu">TyperPunk</div>
                <h2>Lyrics</h2>
                <div class="stats-placeholder">${escapeHtml(bodyText())}</div>
                ${status === 'signed-out' ? `<button class="menu-button" data-action="go-account">Sign In</button>` : ''}
                ${status === 'not-connected' ? `<a class="menu-button" href="${apiUrl('/api/spotify/login')}">Connect Spotify</a>` : ''}
                <button class="menu-button small ghost" data-action="menu">Back</button>
            </div>
        `;
        root.querySelectorAll('[data-action="menu"]').forEach(el => el.addEventListener('click', () => { stopped = true; onBack(); }));
        attachTooltips(root);
        const cleanupTheme = renderTopRail(root, { onShowAccount, onShowFriends });
        const goAccount = root.querySelector('[data-action="go-account"]');
        if (goAccount) goAccount.addEventListener('click', () => { stopped = true; onShowAccount(); });
        const cleanupRail = renderCornerRail(root, { onShowStats, onShowPlaceholder, onShowAccount, onShowLeaderboard, onShowFriends, onShowMultiplayer, onShowStore });
        return () => { cleanupTheme(); cleanupRail(); };
    }

    let cleanup = render();
    function rerender() {
        if (stopped) return;
        cleanup();
        cleanup = render();
    }

    async function poll() {
        if (stopped) return;
        if (!getUser()) {
            status = 'signed-out';
            rerender();
            return;
        }
        try {
            const playing = await api.get('/api/spotify/now-playing');
            if (!playing.is_playing || !playing.track) {
                status = 'waiting';
                message = 'Play something on Spotify to get started.';
                rerender();
            } else {
                const trackKey = `${playing.artist}::${playing.track}`;
                status = 'waiting';
                message = `Now playing: ${playing.track} - ${playing.artist}. Looking for lyrics...`;
                rerender();
                if (trackKey !== lastTrackKey) {
                    lastTrackKey = trackKey;
                    await fetchLyrics(playing);
                }
            }
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                status = 'not-connected';
            } else if (err instanceof ApiError && err.status === 401) {
                status = 'signed-out';
            } else if (err instanceof ApiError && err.status === 501) {
                status = 'not-configured';
                message = err.message;
            } else {
                status = 'waiting';
                message = 'Could not reach Spotify - retrying...';
            }
            rerender();
        }
        if (!stopped && status !== 'not-configured') {
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
    }

    async function fetchLyrics(playing) {
        try {
            const durationSeconds = playing.duration_ms ? Math.round(playing.duration_ms / 1000) : undefined;
            const query = new URLSearchParams({ artist: playing.artist, track: playing.track });
            if (durationSeconds) query.set('duration', String(durationSeconds));
            const result = await api.get(`/api/lyrics?${query.toString()}`);
            const raw = result.lrc || result.plain;
            const filename = result.lrc ? 'lyrics.lrc' : 'lyrics.txt';
            const { chunks, language, timed } = parseCustomContent(raw, filename);
            if (chunks.length === 0) return;
            stopped = true;
            if (pollTimer) clearTimeout(pollTimer);
            onLyricsReady({ name: `${playing.track} - ${playing.artist}`, chunks, language, timed });
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) {
                message = `No lyrics found for "${playing.track}" - try a different song.`;
                rerender();
            }
        }
    }

    poll();

    return () => {
        stopped = true;
        if (pollTimer) clearTimeout(pollTimer);
        cleanup();
    };
}
