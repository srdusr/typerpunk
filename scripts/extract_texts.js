#!/usr/bin/env node
/*
  Extract paragraphs from mirrored sites under similar/ to build a large texts.json.
  - Scans HTML files in similar/play.typeracer.com, similar/monkeytype.com, etc.
  - Extracts visible text from common content tags, splits into paragraphs, filters by length.
  - Deduplicates and shuffles, attaches category from source directory, and attribution as the source path.
  - Writes to repo-root texts.json for both CLI and Web to use.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SIMILAR_DIR = path.join(ROOT, 'similar');
const OUTPUT = path.join(ROOT, 'texts.json');

const CONTENT_TAGS = ['p', 'article', 'main', 'section'];

function findHtmlFiles(dir) {
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findHtmlFiles(full));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
            results.push(full);
        }
    }
    return results;
}

function stripBoilerplateTags(html) {
    return html.replace(/<(script|style|nav|footer|header|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function decodeEntities(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function extractTagText(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const out = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        const text = decodeEntities(match[1].replace(/<[^>]+>/g, ' '));
        out.push(text);
    }
    return out;
}

function isLikelyVisibleText(text) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t) return false;
    if (t.length < 60) return false; // avoid too-short snippets
    // avoid nav/footer boilerplate
    if (/©|copyright|cookie|privacy|terms|policy|subscribe|sign in|login|menu|footer|header/i.test(t)) return false;
    return true;
}

function splitIntoParagraphs(text) {
    const blocks = text
        .split(/\n\s*\n|\r\n\r\n/)
        .map(s => s.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const paras = [];
    for (const b of blocks) {
        if (b.length <= 400) {
            paras.push(b);
        } else {
            let start = 0;
            while (start < b.length) {
                const end = Math.min(start + 350, b.length);
                const slice = b.slice(start, end);
                const lastPeriod = slice.lastIndexOf('. ');
                const lastComma = slice.lastIndexOf(', ');
                const cut = lastPeriod > 150 ? lastPeriod + 1 : (lastComma > 150 ? lastComma + 1 : slice.length);
                paras.push(slice.slice(0, cut).trim());
                start += cut;
            }
        }
    }
    return paras;
}

try {
    const htmlFiles = findHtmlFiles(SIMILAR_DIR);
    const items = [];
    const seen = new Set();

    for (const file of htmlFiles) {
        const rel = path.relative(SIMILAR_DIR, file);
        const parts = rel.split(path.sep);
        const category = parts[0]?.replace(/\W+/g, '').toLowerCase() || 'general';
        const attribution = `similar/${rel}`;

        const html = stripBoilerplateTags(fs.readFileSync(file, 'utf8'));
        const textBits = [];
        for (const tag of CONTENT_TAGS) {
            for (const text of extractTagText(html, tag)) {
                if (isLikelyVisibleText(text)) textBits.push(text);
            }
        }

        const combined = textBits.join('\n\n');
        if (!combined.trim()) continue;

        const paras = splitIntoParagraphs(combined)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(s => s.length >= 80 && s.length <= 400);

        for (const content of paras) {
            const key = content.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            items.push({ category, content, attribution });
        }
    }

    // Shuffle
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }

    // If not enough, keep existing texts.json and merge
    let existing = [];
    if (fs.existsSync(OUTPUT)) {
        try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch {}
    }
    const merged = [...items, ...existing].slice(0, 5000); // cap to 5k entries

    fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
    console.log(`Wrote ${merged.length} texts to ${OUTPUT}`);
} catch (err) {
    console.error('extract_texts failed:', err);
    process.exit(1);
}
