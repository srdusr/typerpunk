// Local development only.
//
// The static file server (port 4173) and typerpunk-server (port 8787) are
// different origins during development, so the client is told where the API
// is. A production deployment puts a reverse proxy in front and routes
// /api/* to the backend, which makes the API same-origin and this file a
// no-op. See web/src/api.js for the default.
//
// This lives in a file rather than in a <script> block in index.html so the
// Content-Security-Policy can forbid inline script entirely.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    window.TYPERPUNK_API_URL = `${location.protocol}//${location.hostname}:8787`;
}
