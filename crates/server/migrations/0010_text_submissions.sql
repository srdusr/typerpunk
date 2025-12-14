- Community-submitted passages, the way a text corpus actually grows past
- what fits in a repository. Nothing here reaches players until a moderator
- approves it.
ALTER TABLE users ADD COLUMN is_moderator BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE text_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    attribution TEXT,
    - Syntax language for code passages; NULL for prose.
    language TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_text_submissions_status ON text_submissions(status);
CREATE INDEX idx_text_submissions_user ON text_submissions(user_id);

- One submission per passage, regardless of whitespace or case. Built on
- md5() rather than a stored hash column so the constraint cannot drift out
- of step with the content it is derived from.
CREATE UNIQUE INDEX idx_text_submissions_dedupe
    ON text_submissions (md5(lower(btrim(content))));
