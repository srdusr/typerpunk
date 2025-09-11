// Thin fetch wrapper for the typerpunk-server backend. Base URL is
// same-origin by default (a reverse proxy is expected to route /api/* to the
// backend in that setup); window.TYPERPUNK_API_URL overrides it for local
// dev or any split frontend/backend hosting, mirroring the existing
// window.TYPERPUNK_TEXTS_URL override pattern already used for the dataset.
const BASE_URL = (typeof window !== 'undefined' && window.TYPERPUNK_API_URL) || '';

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

async function request(method, path, body) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        credentials: 'include',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch { /* empty body, e.g. logout */ }

    if (!res.ok) {
        throw new ApiError(res.status, (data && data.error) || `request failed (${res.status})`);
    }
    return data;
}

export const api = {
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body ?? {}),
    delete: path => request('DELETE', path),
};

// For the rare case a caller needs a real page navigation instead of a
// fetch - the Spotify OAuth login link has to be an actual top-level
// navigation so the browser can load Spotify's own consent screen.
export function apiUrl(path) {
    return `${BASE_URL}${path}`;
}
