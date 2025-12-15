#!/usr/bin/env node
// Zero-dependency static file server for the TyperPunk web app.
// Replaces the Vite dev server so the web app has no npm runtime dependency.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

// Sent with every response.
//
// The API origin is separate during development, so connect-src has to allow
// it. In production the reverse proxy makes the API same-origin and
// API_ORIGIN can be left unset, which drops the extra source.
const API_ORIGIN = process.env.API_ORIGIN || (PORT === 4173 ? 'http://localhost:8787 ws://localhost:8787' : '');

const SECURITY_HEADERS = {
    // No inline script: index.html loads every script from a file so this can
    // stay strict. Style needs Google Fonts' stylesheet, and the font files
    // come from gstatic. The favicon is a data: URI.
    'Content-Security-Policy': [
        "default-src 'self'",
        // wasm-unsafe-eval is required to instantiate WebAssembly. It permits
        // WASM compilation only, not eval() or inline script, and the typing
        // engine is a WASM module - without it nothing types at all.
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        `connect-src 'self'${API_ORIGIN ? ' ' + API_ORIGIN : ''}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ].join('; '),
    // Stops a browser second-guessing a declared Content-Type, which is how a
    // served file gets treated as script.
    'X-Content-Type-Options': 'nosniff',
    // frame-ancestors covers this for modern browsers; the header is for the
    // ones that do not implement it.
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Nothing here uses any of them.
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

async function resolveFile(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null;
    }
    const safePath = normalize(join(ROOT, decoded));
    if (safePath !== ROOT && !safePath.startsWith(ROOT + sep)) return null;

    let target = safePath;
    try {
        const info = await stat(target);
        if (info.isDirectory()) target = join(target, 'index.html');
    } catch {
        return null;
    }

    try {
        await stat(target);
        return target;
    } catch {
        return null;
    }
}

const server = createServer(async (req, res) => {
    const filePath = (await resolveFile(req.url)) || (await resolveFile('/index.html'));
    if (!filePath) {
        res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
    }
    try {
        const body = await readFile(filePath);
        const type = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
        // This replaces a dev server, and the app is under active
        // development - no cache headers at all left the browser free to
        // hold onto old JS/CSS indefinitely with no way to tell it changed,
        // which has already caused a real "why don't I see the fix" report.
        res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' });
        res.end(body);
    } catch (err) {
        res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' });
        res.end('Internal server error');
        console.error(err);
    }
});

server.listen(PORT, HOST, () => {
    console.log(`TyperPunk web running at http://localhost:${PORT}`);
});
