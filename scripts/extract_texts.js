#!/usr/bin/env node
/*
  Extract paragraphs from mirrored sites under similar/ to build a large texts.json.
  - Scans HTML files in similar/play.typeracer.com, similar/monkeytype.com, etc.
  - Extracts visible text nodes, splits into paragraphs, filters by length.
  - Deduplicates and shuffles, attaches category from source directory, and attribution as the source path.
  - Writes to repo-root texts.json for both CLI and Web to use.
*/
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '..');
const SIMILAR_DIR = path.join(ROOT, 'similar');
const OUTPUT = path.join(ROOT, 'texts.json');

function isLikelyVisibleText(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (t.length < 60) return false; // avoid too-short snippets
  // avoid nav/footer boilerplate
  if (/©|copyright|cookie|privacy|terms|policy|subscribe|sign in|login|menu|footer|header/i.test(t)) return false;
  return true;
}

function splitIntoParagraphs(text) {
  // Split by double newline or sentence groups
  const blocks = text
    .split(/\n\s*\n|\r\n\r\n/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const paras = [];
  for (const b of blocks) {
    // Further chunk into 80-350 char ranges
    if (b.length <= 400) {
      paras.push(b);
    } else {
      let start = 0;
      while (start < b.length) {
        let end = Math.min(start + 350, b.length);
        // try to cut at sentence boundary
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

(async () => {
  try {
    const htmlFiles = await glob('**/*.html', { cwd: SIMILAR_DIR, absolute: true, dot: false, nodir: true });
    const items = [];
    const seen = new Set();

    for (const file of htmlFiles) {
      const rel = path.relative(SIMILAR_DIR, file);
      const parts = rel.split(path.sep);
      const category = parts[0]?.replace(/\W+/g, '').toLowerCase() || 'general';
      const attribution = `similar/${rel}`;

      const html = fs.readFileSync(file, 'utf8');
      const $ = cheerio.load(html);

      // Remove script/style/nav/footer elements
      $('script, style, nav, footer, header, noscript').remove();
      // Collect text from paragraphs and common content containers
      const textBits = [];
      $('p, article, main, section, .content, .text, .article, .post').each((_, el) => {
        const t = $(el).text();
        if (isLikelyVisibleText(t)) textBits.push(t);
      });

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
})();
