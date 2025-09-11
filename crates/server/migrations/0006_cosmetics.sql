- Scoped to 'caret' and 'flair' only, not 'theme' - the app already has 7
- free built-in themes (see web/src/theme.js), and selling some themes
- while others stay free in the same picker would be a confusing mix of
- paid and unpaid options in one list. Caret color and a small username
- flair badge are both genuinely new, non-overlapping cosmetic slots.
CREATE TABLE cosmetics (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('caret', 'flair')),
    price_cents INTEGER NOT NULL,
    - Caret: a CSS color. Flair: a short glyph/emoji shown next to a
    - username on the leaderboard and public profile.
    value TEXT NOT NULL
);

CREATE TABLE user_cosmetics (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cosmetic_id TEXT NOT NULL REFERENCES cosmetics(id) ON DELETE CASCADE,
    acquired_at TEXT NOT NULL,
    PRIMARY KEY (user_id, cosmetic_id)
);

ALTER TABLE users ADD COLUMN equipped_caret TEXT;
ALTER TABLE users ADD COLUMN equipped_flair TEXT;

- A small seed catalog so the store isn't empty on a fresh install.
INSERT INTO cosmetics (id, name, category, price_cents, value) VALUES
    ('caret-magenta', 'Magenta Caret', 'caret', 199, '#ff2fb0'),
    ('caret-amber', 'Amber Caret', 'caret', 199, '#ffb703'),
    ('caret-cyan', 'Cyan Caret', 'caret', 199, '#00e5ff'),
    ('flair-star', 'Star', 'flair', 149, 'star'),
    ('flair-bolt', 'Bolt', 'flair', 149, 'bolt'),
    ('flair-skull', 'Skull', 'flair', 149, 'skull');
