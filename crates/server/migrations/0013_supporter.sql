- Whether an account has paid to remove the ad slots. There is no payment
- processor yet, so nothing sets this to true, but the flag exists so the
- slots have a real rule to follow rather than being shown to everybody with
- a note saying they will be conditional later.
ALTER TABLE users ADD COLUMN is_supporter BOOLEAN NOT NULL DEFAULT FALSE;
