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

/// Collapses the whitespace inside a chunk. The typing input is a single
/// line, so a chunk containing a newline can never be finished.
function flattenWhitespace(text) {
    return text.replace(/\s+/g, ' ').trim();
}

export function chunkPlainText(raw) {
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const paragraphs = normalized.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const source = paragraphs.length > 1 ? paragraphs : normalized.split('\n').map(l => l.trim()).filter(Boolean);
    const chunks = [];
    for (const block of source) {
        for (const piece of splitLong(block)) {
            const trimmed = flattenWhitespace(piece);
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


// Markdown notes are the most common thing someone brings to a typing app to
// study: lecture notes, a cheatsheet, a page of documentation. Typed
// verbatim, most of what you retype is punctuation - hashes, asterisks,
// backticks and link brackets - rather than the material itself.
//
// `strip` removes the decoration and keeps the prose, which is the mode for
// studying what the notes say. Left off, the file is typed exactly as
// written, which is the mode for learning the syntax.
export function chunkMarkdown(raw, { strip = true } = {}) {
    const normalized = raw.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    // Fenced code blocks are extracted whole and never stripped: their
    // punctuation is the point, and paragraph splitting would cut them apart.
    const segments = [];
    const fence = /```[^\n]*\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = fence.exec(normalized)) !== null) {
        if (m.index > last) segments.push({ text: normalized.slice(last, m.index), code: false });
        segments.push({ text: m[1], code: true });
        last = m.index + m[0].length;
    }
    if (last < normalized.length) segments.push({ text: normalized.slice(last), code: false });

    const chunks = [];
    for (const seg of segments) {
        if (seg.code) {
            // One line at a time: a code block is typed the way it is written.
            for (const line of seg.text.split('\n')) {
                const t = line.trim();
                if (t) chunks.push({ content: t, time: null, code: true });
            }
            continue;
        }
        for (const block of seg.text.split(/\n\s*\n/)) {
            let text = block.trim();
            if (!text) continue;
            if (strip) {
                text = text
                    .replace(/^\s{0,3}#{1,6}\s+/gm, '')            // heading markers
                    .replace(/^\s{0,3}>\s?/gm, '')                  // block quotes
                    .replace(/^\s*[-*+]\s+/gm, '')                  // bullet markers
                    .replace(/^\s*\d+[.)]\s+/gm, '')                // ordered list markers
                    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')       // images -> alt text
                    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links -> label
                    .replace(/`([^`]+)`/g, '$1')                    // inline code
                    .replace(/(\*\*|__)(.*?)\1/g, '$2')             // bold
                    .replace(/(\*|_)(.*?)\1/g, '$2')                // italics
                    .replace(/^\s*([-*_]\s*){3,}$/gm, '')           // horizontal rules
                    .replace(/\|/g, ' ')                            // table pipes
                    .replace(/[ \t]+/g, ' ')
                    .trim();
            }
            // A heading on its own becomes a one-word chunk that is not worth
            // typing; fold it into nothing and let the paragraph follow.
            if (!text || text.length < 3) continue;
            for (const piece of splitLong(text)) {
                const t = flattenWhitespace(piece);
                if (t) chunks.push({ content: t, time: null });
            }
        }
    }
    return chunks;
}

export function parseCustomContent(raw, filename, options = {}) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'srt') return { chunks: parseSrt(raw), language: null, timed: true };
    if (ext === 'vtt') return { chunks: parseVtt(raw), language: null, timed: true };
    if (ext === 'lrc') return { chunks: parseLrc(raw), language: null, timed: true };
    const language = languageForFilename(filename);
    if (ext === 'md' || ext === 'markdown') {
        return {
            chunks: chunkMarkdown(raw, { strip: options.stripMarkdown !== false }),
            language: null,
            timed: false,
            markdown: true,
        };
    }
    return { chunks: chunkPlainText(raw), language, timed: false };
}
