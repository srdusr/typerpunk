- Physical goods: shirts, mugs, deskmats.
--
- These differ from cosmetics in three ways that the schema has to carry. They
- have a size or colour to choose. They need a shipping address. And nothing
- is granted on payment: an order is recorded for someone to pack and post.
CREATE TABLE merch (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    - 'shirt', 'mug', 'deskmat'. Groups the store display.
    kind TEXT NOT NULL,
    - Sizes or colours. Empty means the item has only one form.
    variants TEXT[] NOT NULL DEFAULT '{}',
    - Postage, charged once per order rather than per item.
    shipping_cents INTEGER NOT NULL DEFAULT 0,
    available BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO merch (id, name, description, price_cents, kind, variants, shipping_cents, sort_order) VALUES
    ('shirt-mark', 'Mark T-Shirt', 'The TyperPunk mark, printed small on the left chest.', 2600, 'shirt',
     ARRAY['S','M','L','XL','2XL'], 600, 1),
    ('shirt-layout', 'Home Row T-Shirt', 'ASDF JKL; across the chest, set in the same face the app types in.', 2800, 'shirt',
     ARRAY['S','M','L','XL','2XL'], 600, 2),
    ('mug-prompt', 'Prompt Mug', 'The mark on one side, a blinking block cursor on the other. 11oz.', 1600, 'mug',
     '{}', 700, 3),
    ('mug-wpm', 'WPM Mug', 'Reads "measured in words per minute, drunk in cups per hour". 11oz.', 1600, 'mug',
     '{}', 700, 4),
    ('deskmat-track', 'Race Deskmat', 'The race track across 900x400mm, stitched edge, rubber base.', 3800, 'deskmat',
     '{}', 900, 5),
    ('deskmat-mark', 'Mark Deskmat', 'The mark bottom-right on plain black. 900x400mm, stitched edge.', 3600, 'deskmat',
     '{}', 900, 6);

- Orders. A purchase row already records payment; this records what has to be
- packed and where it goes. The address comes back from the processor, which
- collected it during checkout, so it is never typed into this site.
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_kind_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_kind_check
    CHECK (kind IN ('cosmetic', 'supporter', 'bundle', 'merch'));
ALTER TABLE purchases ADD COLUMN merch_id TEXT REFERENCES merch(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN merch_variant TEXT;
- Set once the item is posted. NULL means it is still waiting to be packed.
ALTER TABLE purchases ADD COLUMN shipped_at TEXT;
ALTER TABLE purchases ADD COLUMN shipping_address TEXT;

CREATE INDEX idx_purchases_unshipped ON purchases(kind, status, shipped_at);
