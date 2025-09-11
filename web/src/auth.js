import { api, ApiError } from './api.js';
import { mergeRemoteBests } from './pb.js';

// Mirrors theme.js's pattern: one module-level value plus a subscriber set,
// so every screen showing sign-in state (the corner rail, the main menu's
// bottom-left widget, the Account screen) repaints from the same source
// instead of each tracking its own copy.
let currentUser = null;
let resolved = false;
const listeners = new Set();

function setUser(user) {
    currentUser = user;
    resolved = true;
    for (const fn of listeners) fn(currentUser);
    // Reconciles local personal bests against the server's on every
    // sign-in (including the session restored on page load, not just an
    // explicit login) - a pure max(local, remote) merge, so running it
    // every time is harmless and keeps a second device's progress visible
    // here without a dedicated "sync now" action.
    if (user) {
        api.get('/api/stats/me').then(({ personal_bests }) => mergeRemoteBests(personal_bests)).catch(() => {});
    }
}

// Fire-and-forget on module load: restores sign-in state from the session
// cookie (if any) without the caller needing to await anything up front.
const initial = api.get('/api/auth/me').then(user => setUser(user)).catch(() => setUser(null));

export function getUser() {
    return currentUser;
}

/** True once the initial /api/auth/me check has resolved either way. */
export function isAuthResolved() {
    return resolved;
}

export function onAuthChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function whenAuthReady() {
    return initial;
}

export async function register(username, password) {
    const user = await api.post('/api/auth/register', { username, password });
    setUser(user);
    return user;
}

export async function login(username, password) {
    const user = await api.post('/api/auth/login', { username, password });
    setUser(user);
    return user;
}

// Fire-and-forget: called after every finished test regardless of sign-in
// state, so callers (endScreen.js) don't need their own "am I logged in"
// branch. No-ops for guests; a failed upload (session expired mid-test,
// network hiccup) is silently dropped rather than surfacing an error over a
// result the player has already seen and moved past.
export function submitTestResult(result) {
    if (!currentUser) return;
    api.post('/api/stats', result).catch(() => {});
}

export async function logout() {
    try { await api.post('/api/auth/logout'); } catch { /* cookie may already be gone */ }
    setUser(null);
}

export { ApiError };
