- Long-lived personal-access tokens for CLI-style clients (the TUI) that
- have no cookie jar. Separate from the browser's session cookie so
- revoking one doesn't touch the other.
CREATE TABLE api_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
