CREATE TABLE test_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode_key TEXT NOT NULL,
    wpm REAL NOT NULL,
    raw_wpm REAL NOT NULL,
    accuracy REAL NOT NULL,
    time_seconds REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_test_results_user_id ON test_results(user_id);
CREATE INDEX idx_test_results_mode_key ON test_results(mode_key);
