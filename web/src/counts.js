import { api } from './api.js';
import { getOnlineCount } from './multiplayer.js';
import { getUser, onAuthChange } from './auth.js';

// Live counts for the badges on the Friends and Multiplayer controls: how
// many people you can race right now, and how many friends you have.
//
// Shared and cached rather than fetched per control. The rail is rebuilt on
// every screen change, and without this each navigation fired a fresh pair of
// requests - and the main menu's Multiplayer button would have fired its own
// on top of that, asking the server the same question twice per screen.
const REFRESH_MS = 30000;

let cache = { online: 0, friends: 0 };
const listeners = new Set();
let timer = null;
let inFlight = false;

async function refresh() {
    if (inFlight) return;
    inFlight = true;
    try {
        const online = await getOnlineCount().then(r => r.players).catch(() => cache.online);
        // Friends only exist for a signed-in user; asking while signed out is
        // a guaranteed 401, so skip it rather than log noise on every poll.
        const friends = getUser()
            ? await api.get('/api/friends').then(r => (r.friends || []).length).catch(() => cache.friends)
            : 0;
        cache = { online, friends };
        for (const fn of listeners) fn(cache);
    } finally {
        inFlight = false;
    }
}

export function getCounts() {
    return cache;
}

// Returns an unsubscribe function. Polling runs only while something is
// listening, so a screen with no badges costs nothing.
export function onCountsChange(fn) {
    listeners.add(fn);
    if (!timer) {
        refresh();
        timer = setInterval(refresh, REFRESH_MS);
    }
    return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    };
}

// Signing in or out changes the friend count immediately - waiting up to the
// full poll interval would leave a stale badge behind.
onAuthChange(() => {
    if (listeners.size > 0) refresh();
});
