# Migrate the server from SQLite to PostgreSQL - DONE

Done on 2026-08-30. The server runs on Postgres 18: sqlx switched to the
`postgres` feature, 95 placeholders renumbered to `$N`, `REAL` columns
widened to `DOUBLE PRECISION` (Postgres REAL is float4 and will not decode
into f64), the `flagged` and `is_bot` flags made real BOOLEANs, the
leaderboard's derived table given the alias Postgres requires, and
`INSERT OR IGNORE` rewritten as `ON CONFLICT DO NOTHING`. Integration tests
run against a real database, each in its own throwaway schema, since
Postgres has no in-memory mode.

## Still open

- **Timestamps are still TEXT.** They are RFC3339 and sort correctly as
  text, so this is not a correctness problem, but `TIMESTAMPTZ` would let
  the database do date arithmetic instead of the application.
- **LISTEN/NOTIFY is unused.** Multiplayer rooms are still in-process, so
  the server cannot yet run as more than one instance.

---

## Original note


## Why

The server is a multi-user network service. It handles auth, sessions,
friendships, leaderboards, live multiplayer races, and rate limiting. SQLite
allows only one writer at a time. Races, leaderboard writes, and rate-limit
counters all write at the same time, so the single writer is the wrong shape
for this workload.

PostgreSQL gives three things the server needs:

- MVCC. Concurrent writers do not block each other.
- Real timestamp types. `created_at` and `expires_at` are `TEXT` today.
- `LISTEN`/`NOTIFY`. This maps onto multiplayer room pub/sub, and lets the
  server run as more than one instance.

Keep `mitmux` on SQLite. It is a single-user local tool, and its pure-Go
SQLite driver is what keeps cross-compilation free of CGO.

## Scope

Server only (`crates/server`). The TUI, WASM, and Steam builds do not touch
the database.

## What makes this cheap

- The migrations use no SQLite-only syntax. There is no `AUTOINCREMENT`, no
  `PRAGMA`, no `strftime`, and no `WITHOUT ROWID`.
- Primary keys are `TEXT` UUIDs, not integer rowids.
- All 33 call sites use the runtime `sqlx::query` function, not the
  `sqlx::query!` macro. There is no compile-time schema metadata, so no
  `cargo sqlx prepare` step and no offline query cache to regenerate.

## Steps

1. Change the sqlx feature in `crates/server/Cargo.toml` from `sqlite` to
   `postgres`. Keep `runtime-tokio-rustls`, `time`, and `uuid`.
2. Change the pool type from `SqlitePool` to `PgPool` in `state.rs`, and
   change the connection string handling in `main.rs`.
3. Convert every placeholder from `?` to `$1`, `$2`, and so on. Postgres
   numbers its placeholders. This is the largest mechanical change: 33
   queries across `auth.rs`, `stats.rs`, `friends.rs`, `multiplayer.rs`,
   `cosmetics.rs`, `anticheat.rs`, `rate_limit.rs`, and `spotify.rs`.
4. Change `created_at TEXT` and `expires_at TEXT` to `TIMESTAMPTZ` in the
   migrations. Update the Rust structs to `time::OffsetDateTime`.
5. Replace any `INSERT OR REPLACE` or `INSERT OR IGNORE` with
   `INSERT ... ON CONFLICT`. Check `cosmetics.rs` and `rate_limit.rs` first.
6. Add a `docker-compose.yml` with a `postgres` service, so a contributor can
   start a database with one command.
7. Run the full test suite against the new backend.

## Verify

- `cargo test --workspace` passes.
- Two clients can finish a multiplayer race at the same time, and both
  results are written.
- A session expires at the correct time. This confirms the `TIMESTAMPTZ`
  conversion.
- Rate limiting still rejects a burst from one user.

## Follow-up

Move multiplayer room pub/sub from in-process state to `LISTEN`/`NOTIFY`.
Only after that can the server run more than one instance.
