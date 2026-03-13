#!/usr/bin/env node
// Writes the store catalogue to web/src/data/store.json.
//
// The store reads its catalogue from the server. With no server the page
// rendered its heading over an empty shop, which looks like a fault rather
// than a feature that needs signing in. This file is the same fallback the
// text packs already use: bundled with the client, served from the database
// and merged over the top once a server exists.
//
// Run it after changing prices or adding items:
//   node scripts/export_store.js
//
// It shells out to psql so it needs no node dependencies, matching the rest
// of the scripts here.
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const URL = process.env.DATABASE_URL
    || 'postgresql://typerpunk:typerpunk@localhost/typerpunk';

function query(sql) {
    const out = execFileSync('psql', [URL, '-At', '-c', sql], { encoding: 'utf8' });
    return JSON.parse(out.trim() || '[]');
}

const cosmetics = query(`
    SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.category, c.price_cents), '[]'::json)
    FROM (SELECT id, name, category, price_cents, value FROM cosmetics) c`);

const bundles = query(`
    SELECT COALESCE(json_agg(b ORDER BY b.sort_order), '[]'::json) FROM (
        SELECT b.id, b.name, b.description, b.price_cents, b.sort_order,
               COALESCE(SUM(c.price_cents), 0)::int AS full_price_cents,
               COALESCE(ARRAY_AGG(c.id ORDER BY c.id)
                        FILTER (WHERE c.id IS NOT NULL), '{}') AS items
        FROM bundles b
        LEFT JOIN bundle_items bi ON bi.bundle_id = b.id
        LEFT JOIN cosmetics c ON c.id = bi.cosmetic_id
        GROUP BY b.id, b.name, b.description, b.price_cents, b.sort_order
    ) b`);

const merch = query(`
    SELECT COALESCE(json_agg(m ORDER BY m.sort_order), '[]'::json) FROM (
        SELECT id, name, description, price_cents, shipping_cents, kind, variants, sort_order
        FROM merch WHERE available
    ) m`);

for (const row of [...bundles, ...merch]) delete row.sort_order;

const out = join(__dirname, '..', 'web', 'src', 'data', 'store.json');
writeFileSync(out, JSON.stringify({ cosmetics, bundles, merch }, null, 2) + '\n');
console.log(`Wrote ${cosmetics.length} cosmetics, ${bundles.length} bundles and ${merch.length} merch items to ${out}`);
