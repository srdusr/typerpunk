- A fuller catalogue. The store shipped with six items, which is not enough
- for the screen to be worth opening twice.
--
- Racer sprites join carets and flair as a third slot: the sprite shown for
- you in a multiplayer race. Unequipped players fall back to the sprite their
- position in the room assigns, so nothing is required to race.
ALTER TABLE cosmetics DROP CONSTRAINT IF EXISTS cosmetics_category_check;
ALTER TABLE cosmetics ADD CONSTRAINT cosmetics_category_check
    CHECK (category IN ('caret', 'flair', 'sprite'));

ALTER TABLE users ADD COLUMN equipped_sprite TEXT;

INSERT INTO cosmetics (id, name, category, price_cents, value) VALUES
    - Carets. Priced the same as each other: they are the same thing in a
    - different colour, and pricing them apart would only be arbitrary.
    ('caret-crimson',   'Crimson Caret',   'caret', 199, '#ff3b5c'),
    ('caret-violet',    'Violet Caret',    'caret', 199, '#a855f7'),
    ('caret-lime',      'Lime Caret',      'caret', 199, '#a3e635'),
    ('caret-ice',       'Ice Caret',       'caret', 199, '#7dd3fc'),
    ('caret-ember',     'Ember Caret',     'caret', 199, '#fb923c'),
    ('caret-bone',      'Bone Caret',      'caret', 199, '#e7e5e4'),
    ('caret-void',      'Void Caret',      'caret', 299, '#6b21a8'),
    ('caret-signal',    'Signal Caret',    'caret', 299, '#22d3ee'),

    - Flair, shown beside a username on the leaderboard and public profile.
    ('flair-crown',     'Crown',           'flair', 149, 'crown'),
    ('flair-circuit',   'Circuit',         'flair', 149, 'circuit'),
    ('flair-eye',       'Eye',             'flair', 149, 'eye'),
    ('flair-shard',     'Shard',           'flair', 149, 'shard'),
    ('flair-moth',      'Moth',            'flair', 199, 'moth'),
    ('flair-reactor',   'Reactor',         'flair', 199, 'reactor'),

    - Race sprites.
    ('sprite-dart',     'Dart',            'sprite', 249, 'dart'),
    ('sprite-rocket',   'Rocket',          'sprite', 249, 'rocket'),
    ('sprite-helm',     'Helm',            'sprite', 249, 'helm'),
    ('sprite-core',     'Core',            'sprite', 249, 'core'),
    ('sprite-signal',   'Signal',          'sprite', 249, 'signal'),
    ('sprite-blade',    'Blade',           'sprite', 249, 'blade')
ON CONFLICT (id) DO NOTHING;
