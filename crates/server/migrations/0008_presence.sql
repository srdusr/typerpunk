- Presence, for showing how many of your friends are around right now.
- Written as a plain timestamp column rather than a separate table: it is a
- single value per user, overwritten in place, with no history worth keeping.
ALTER TABLE users ADD COLUMN last_seen TEXT;

- The friends list filters on it for every accepted friendship.
CREATE INDEX idx_users_last_seen ON users(last_seen);
