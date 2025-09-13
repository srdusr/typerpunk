import { api } from './api.js';
import { getUser, onAuthChange } from './auth.js';

// How many of your friends are around right now, for the count beside the
// Friends control.
//
// Shared and cached rather than fetched per control: the rail is rebuilt on
// every screen change, and without this each navigation fired a fresh
// request.
const REFRESH_MS = 30000;

let cache = { friends: 0, friendsOnline: 0 };
const listeners = new Set();
let timer = null;
let inFlight = false;

async function refresh() {
    if (inFlight) return;
    inFlight = true;
    try {
        // Friends only exist for a signed-in user; asking while signed out is
        // a guaranteed 401, so skip it rather than log noise on every poll.
        if (!getUser()) {
            cache = { friends: 0, friendsOnline: 0 };
        } else {
            const list = await api.get('/api/friends').catch(() => null);
            if (list) {
                const friends = list.friends || [];
                cache = { friends: friends.length, friendsOnline: friends.filter(f => f.online).length };
            }
        }
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
