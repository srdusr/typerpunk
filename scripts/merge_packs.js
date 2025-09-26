#!/usr/bin/env node
/*
  Merge all JSON packs from data/packs/*.json into texts.json at repo root.
  Each pack item: { category: string, content: string, attribution: string }
*/
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'data', 'packs');
const OUTPUT = path.join(ROOT, 'texts.json');

(async () => {
  try {
    const files = await glob('*.json', { cwd: PACKS_DIR, absolute: true });
    const items = [];
    const seen = new Set();

    for (const file of files) {
      const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const item of pack) {
        if (!item || !item.content) continue;
        const key = `${item.category || ''}\u0000${item.content.trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({
          category: String(item.category || 'general'),
          content: String(item.content),
          attribution: String(item.attribution || path.relative(ROOT, file)),
        });
      }
    }

    // Shuffle
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    fs.writeFileSync(OUTPUT, JSON.stringify(items, null, 2));
    console.log(`Merged ${items.length} items into ${OUTPUT}`);
  } catch (err) {
    console.error('merge_packs failed:', err);
    process.exit(1);
  }
})();
