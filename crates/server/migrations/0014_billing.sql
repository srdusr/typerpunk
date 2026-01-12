- Payments.
--
- Checkout is hosted by the processor, so no card details ever reach this
- server and it stays outside PCI scope. What is recorded here is only what
- is needed to fulfil an order and to answer "did this person pay".
CREATE TABLE purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    - 'cosmetic' or 'supporter'.
    kind TEXT NOT NULL CHECK (kind IN ('cosmetic', 'supporter')),
    - The cosmetic bought, or NULL for a supporter subscription.
    cosmetic_id TEXT REFERENCES cosmetics(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    - The processor's own session id. Unique, so a webhook delivered twice
    - cannot grant the same item twice: fulfilment keys off this row.
    session_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    paid_at TEXT
);

CREATE INDEX idx_purchases_user ON purchases(user_id);
CREATE INDEX idx_purchases_status ON purchases(status);

- When the supporter subscription runs out. NULL means never subscribed.
ALTER TABLE users ADD COLUMN supporter_until TEXT;
