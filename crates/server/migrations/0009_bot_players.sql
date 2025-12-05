- Bots are ordinary users with a flag, not a parallel identity system: they
- appear in the same tables, are ranked by the same query, and are joined to
- the same cosmetics. The flag exists so the client can label them, because a
- board that mixes synthetic scores into human ones without saying so is
- telling its users something untrue.
ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_users_is_bot ON users(is_bot);
