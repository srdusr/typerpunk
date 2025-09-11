const LANGUAGE_BY_EXT = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'javascript', tsx: 'javascript',
    py: 'python',
    rs: 'rust',
    c: 'clike', h: 'clike', cpp: 'clike', hpp: 'clike', cc: 'clike', java: 'clike', go: 'clike', cs: 'clike',
    sh: 'shell', bash: 'shell', zsh: 'shell',
};

const KEYWORDS = {
    javascript: new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'from', 'new', 'this', 'async', 'await', 'try', 'catch', 'switch', 'case', 'break', 'continue', 'typeof', 'null', 'undefined', 'true', 'false']),
    python: new Set(['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'class', 'import', 'from', 'as', 'try', 'except', 'with', 'lambda', 'None', 'True', 'False', 'pass', 'break', 'continue', 'yield', 'self']),
    rust: new Set(['fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'loop', 'match', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'self', 'Self', 'true', 'false', 'const', 'static']),
    clike: new Set(['int', 'float', 'double', 'char', 'void', 'if', 'else', 'for', 'while', 'return', 'struct', 'class', 'public', 'private', 'static', 'const', 'new', 'true', 'false', 'null']),
    shell: new Set(['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'function', 'echo', 'export', 'local']),
};

const LINE_COMMENT = { javascript: '//', rust: '//', clike: '//', shell: '#', python: '#' };

export function languageForFilename(filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    return LANGUAGE_BY_EXT[ext] || null;
}

export function highlightClasses(text, language) {
    const classes = new Array(text.length).fill(null);
    if (!language || !KEYWORDS[language]) return classes;
    const keywords = KEYWORDS[language];
    const commentMarker = LINE_COMMENT[language];
    const tokenRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|#[^\n]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*)/g;
    let match;
    while ((match = tokenRegex.exec(text)) !== null) {
        const token = match[0];
        const start = match.index;
        let cls = null;
        if (token[0] === '"' || token[0] === "'" || token[0] === '`') {
            cls = 'syn-string';
        } else if ((token.startsWith('//') || token.startsWith('#')) && token.startsWith(commentMarker || '\0')) {
            cls = 'syn-comment';
        } else if (/^\d/.test(token)) {
            cls = 'syn-number';
        } else if (keywords.has(token)) {
            cls = 'syn-keyword';
        }
        if (cls) {
            for (let i = 0; i < token.length; i++) classes[start + i] = cls;
        }
    }
    return classes;
}

function splitLong(str, maxLen = 400) {
    if (str.length <= maxLen) return [str];
    const parts = [];
    let start = 0;
    while (start < str.length) {
        const end = Math.min(start + maxLen, str.length);
        const slice = str.slice(start, end);
        const lastNewline = slice.lastIndexOf('\n');
        const lastSpace = slice.lastIndexOf(' ');
        const minCut = Math.floor(maxLen * 0.4);
        const cut = lastNewline > minCut ? lastNewline + 1 : (lastSpace > minCut ? lastSpace + 1 : slice.length);
        parts.push(str.slice(start, start + cut));
        start += cut;
    }
    return parts;
}

export function chunkPlainText(raw) {
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const source = paragraphs.length > 1 ? paragraphs : normalized.split('\n').map(l => l.trim()).filter(Boolean);
    const chunks = [];
    for (const block of source) {
        for (const piece of splitLong(block)) {
            const trimmed = piece.trim();
            if (trimmed) chunks.push({ content: trimmed, time: null });
        }
    }
    return chunks;
}

function timeToSeconds(str) {
    // "00:00:01,000" / "00:00:01.000" (h:mm:ss) or "00:12.34" (mm:ss, lrc-style)
    const parts = str.replace(',', '.').split(':').map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] ?? null;
}

function parseSrt(raw) {
    const blocks = raw.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
    const chunks = [];
    for (const block of blocks) {
        const lines = block.split('\n').filter(Boolean);
        let i = 0;
        if (/^\d+$/.test((lines[i] || '').trim())) i += 1;
        let time = null;
        const timing = lines[i] || '';
        const startMatch = timing.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->/);
        if (startMatch) {
            time = timeToSeconds(startMatch[1]);
            i += 1;
        }
        const text = lines.slice(i).join(' ').replace(/<[^>]+>/g, '').trim();
        if (text) chunks.push({ content: text, time });
    }
    return chunks;
}

function parseVtt(raw) {
    const body = raw.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n/, '').trim();
    const blocks = body.split(/\n\s*\n/);
    const chunks = [];
    for (const block of blocks) {
        const lines = block.split('\n').filter(Boolean);
        let i = 0;
        if (lines[i] && !/-->/.test(lines[i])) i += 1; // optional cue identifier
        let time = null;
        const timing = lines[i] || '';
        const startMatch = timing.match(/(\d{2}:)?(\d{2}:\d{2}[.,]\d{3})\s*-->/);
        if (startMatch) {
            time = timeToSeconds((startMatch[1] || '') + startMatch[2]);
            i += 1;
        }
        const text = lines.slice(i).join(' ').replace(/<[^>]+>/g, '').trim();
        if (text) chunks.push({ content: text, time });
    }
    return chunks;
}

function parseLrc(raw) {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const chunks = [];
    for (const line of lines) {
        const match = line.match(/^((?:\[\d{2}:\d{2}(?:\.\d{2,3})?\])+)(.*)$/);
        if (!match) continue;
        const text = match[2].trim();
        if (!text) continue;
        const firstStamp = match[1].match(/\[(\d{2}:\d{2}(?:\.\d{2,3})?)\]/);
        const time = firstStamp ? timeToSeconds(firstStamp[1]) : null;
        chunks.push({ content: text, time });
    }
    return chunks;
}

export function parseCustomContent(raw, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'srt') return { chunks: parseSrt(raw), language: null, timed: true };
    if (ext === 'vtt') return { chunks: parseVtt(raw), language: null, timed: true };
    if (ext === 'lrc') return { chunks: parseLrc(raw), language: null, timed: true };
    const language = languageForFilename(filename);
    return { chunks: chunkPlainText(raw), language, timed: false };
}
