- Prices per item, and bundles.
--
- Everything was priced in three flat bands, so a plain colour swap cost the
- same as the most elaborate sprite and nothing signalled which items were
- worth more. Prices now vary by how much each item actually offers.
UPDATE cosmetics SET price_cents = CASE id
    - Plain colours: the cheapest thing in the store.
    WHEN 'caret-magenta'  THEN 149
    WHEN 'caret-amber'    THEN 149
    WHEN 'caret-cyan'     THEN 149
    WHEN 'caret-crimson'  THEN 149
    WHEN 'caret-lime'     THEN 179
    WHEN 'caret-violet'   THEN 179
    WHEN 'caret-ice'      THEN 179
    WHEN 'caret-ember'    THEN 199
    WHEN 'caret-bone'     THEN 199
    - Deeper colours, held back as the ones worth saving for.
    WHEN 'caret-void'     THEN 349
    WHEN 'caret-signal'   THEN 349
    - Flair, by how much drawing is in it.
    WHEN 'flair-star'     THEN 129
    WHEN 'flair-bolt'     THEN 129
    WHEN 'flair-shard'    THEN 129
    WHEN 'flair-eye'      THEN 179
    WHEN 'flair-circuit'  THEN 179
    WHEN 'flair-skull'    THEN 199
    WHEN 'flair-crown'    THEN 249
    WHEN 'flair-moth'     THEN 249
    WHEN 'flair-reactor'  THEN 299
    - Sprites are the most visible thing you own: everyone in the race sees
    - one, so they carry the highest single-item prices.
    WHEN 'sprite-dart'    THEN 249
    WHEN 'sprite-signal'  THEN 249
    WHEN 'sprite-blade'   THEN 299
    WHEN 'sprite-helm'    THEN 299
    WHEN 'sprite-core'    THEN 349
    WHEN 'sprite-rocket'  THEN 399
    ELSE price_cents
END;

CREATE TABLE bundles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bundle_items (
    bundle_id TEXT NOT NULL REFERENCES bundles(id) ON DELETE CASCADE,
    cosmetic_id TEXT NOT NULL REFERENCES cosmetics(id) ON DELETE CASCADE,
    PRIMARY KEY (bundle_id, cosmetic_id)
);

- A bundle is worth buying only if it is visibly cheaper than its parts, so
- each is priced below the sum of what it contains.
INSERT INTO bundles (id, name, description, price_cents, sort_order) VALUES
    ('bundle-starter', 'Starter Kit', 'A caret, a flair and a sprite to make a profile your own.', 449, 1),
    ('bundle-neon', 'Neon Set', 'The brightest carets in the store, together.', 549, 2),
    ('bundle-racer', 'Racer Set', 'Every race sprite.', 1299, 3),
    ('bundle-everything', 'The Lot', 'Every cosmetic currently in the store.', 3499, 4);

INSERT INTO bundle_items (bundle_id, cosmetic_id) VALUES
    ('bundle-starter', 'caret-cyan'), ('bundle-starter', 'flair-bolt'), ('bundle-starter', 'sprite-dart'),
    ('bundle-neon', 'caret-magenta'), ('bundle-neon', 'caret-cyan'), ('bundle-neon', 'caret-lime'), ('bundle-neon', 'caret-signal'),
    ('bundle-racer', 'sprite-dart'), ('bundle-racer', 'sprite-rocket'), ('bundle-racer', 'sprite-helm'),
    ('bundle-racer', 'sprite-core'), ('bundle-racer', 'sprite-signal'), ('bundle-racer', 'sprite-blade');

- "The Lot" is defined as everything, rather than listed by hand, so it stays
- correct as items are added.
INSERT INTO bundle_items (bundle_id, cosmetic_id)
    SELECT 'bundle-everything', id FROM cosmetics;

- Purchases can now be of a bundle.
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_kind_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_kind_check
    CHECK (kind IN ('cosmetic', 'supporter', 'bundle'));
ALTER TABLE purchases ADD COLUMN bundle_id TEXT REFERENCES bundles(id) ON DELETE SET NULL;
