- Moderators are appointed by an administrator rather than by editing the
- database by hand. The first administrator is named by TYPERPUNK_ADMIN_USERNAME
- at startup, which is the only way in that does not require a running admin.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
