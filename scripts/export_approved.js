#!/usr/bin/env node
/*
  Pulls approved community submissions out of a running server and writes them
  into data/packs/community-<category>.json, so the repository dataset and the
  live corpus do not drift apart.

  Approved passages are served from the database, and the client merges them on
  top of the bundled packs at startup. That is what makes them appear without a
  release. It also means a fresh checkout, an offline run, or the TUI (which
  reads texts.json directly) sees only what shipped. Running this and committing
  the result folds the live corpus back into the repository.

  Usage:
    node scripts/export_approved.js [http://localhost:8787]
    node scripts/merge_packs.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKS_DIR = path.join(ROOT, 'data', 'packs');
const base = (process.argv[2] || process.env.TYPERPUNK_API || 'http://localhost:8787').replace(/\/$/, '');

async function main() {
    const res = await fetch(`${base}/api/texts`);
    if (!res.ok) throw new Error(`${base}/api/texts returned ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
        console.log('no approved submissions to export');
        return;
    }

    // Grouped by category so an export lands in the same shape as a hand
    // written pack, and a reviewer can read the diff.
    const byCategory = new Map();
    for (const item of items) {
        if (!item.content || !item.category) continue;
        const entry = { category: item.category, content: item.content };
        if (item.attribution) entry.attribution = item.attribution;
        if (item.language) entry.language = item.language;
        if (!byCategory.has(item.category)) byCategory.set(item.category, []);
        byCategory.get(item.category).push(entry);
    }

    let written = 0;
    for (const [category, entries] of byCategory) {
        // Sorted by content so re-exporting produces the same file rather than
        // a reordered one, which would make every diff unreadable.
        entries.sort((a, b) => a.content.localeCompare(b.content));
        const file = path.join(PACKS_DIR, `community-${category}.json`);
        fs.writeFileSync(file, JSON.stringify(entries, null, 2) + '\n');
        console.log(`  ${path.relative(ROOT, file)}: ${entries.length}`);
        written += entries.length;
    }
    console.log(`exported ${written} approved passages; run scripts/merge_packs.js next`);
}

main().catch(err => {
    console.error('export failed:', err.message);
    process.exit(1);
});
