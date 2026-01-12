# TyperPunk

Competitive typing for the terminal and the browser. It has solo practice,
live multiplayer races, code and command drills, and a practice mode that
targets the keys you personally get wrong.

The web client and the terminal client share one Rust core, so both score a
test the same way.

## Contents

- [What it does](#what-it-does)
- [Running it](#running-it)
- [Modes](#modes)
- [Text packs](#text-packs)
- [Server](#server)
- [Deployment](#deployment)
- [Development](#development)
- [Security](#security)
- [Licence](#licence)

## What it does

- Solo tests by word count, by time, or on a fixed passage.
- Live races against other people, or against bots when nobody else is
  around.
- Code and command drills. Each one explains what the line does.
- Practice mode, which generates text weighted toward the characters you
  mistype or hesitate on.
- Custom text. Import your own notes and work through them over several
  sittings.
- Accounts, personal bests, a leaderboard, and friends.

## Running it

You need Rust and Node.js. The web client also needs `wasm-pack`, which
`web/launch.sh` installs if it is missing.

### Web client

```bash
./web/launch.sh
```

This builds the WebAssembly core, merges the text packs, and serves the app
on http://localhost:4173. There is no bundler and no npm dependency tree.
Edit a file under `web/src/` and reload the page.

The multiplayer, account and leaderboard features need the server as well.
See [Server](#server).

### Terminal client

```bash
cargo run --package typerpunk-tui
```

`./install.sh` builds it and puts it on your path.

## Modes

| Mode | What it types |
| --- | --- |
| Random | A passage from any pack |
| Words | A fixed number of common words |
| Timed | As many words as you can before the clock runs out |
| Zen | No timer and no word limit |
| Practice | Words weighted toward your own weak keys |
| Custom | Text you import, including markdown notes |
| Lyrics | The song currently playing on Spotify |

Alongside those are the text packs, listed below.

Sixteen typing languages are available for the generated-word modes. This
sets the vocabulary you type, not the language of the interface. The
interface is English only. See `TODO-ui-languages.md`.

## Text packs

`data/packs/*.json` holds the passages. Each entry looks like this:

```json
{
  "category": "quotes",
  "content": "The best way out is always through.",
  "attribution": "Robert Frost"
}
```

`attribution` is optional. Leave it out for original prose rather than
inventing a source. Code entries take two more fields:

```json
{
  "category": "shell",
  "language": "shell",
  "content": "awk -F: '{print $1, $7}' /etc/passwd",
  "attribution": "awk",
  "explanation": "-F sets the field separator."
}
```

`language` is one of `javascript`, `python`, `rust`, `clike` or `shell`, and
selects the syntax highlighting. `explanation` is shown while you type in
single player, and after the race in multiplayer.

After editing a pack, rebuild the merged dataset:

```bash
node scripts/merge_packs.js
```

This writes `texts.json` and `web/src/data/texts.json`.

Passages must be a single line. The typing input is one line, so a passage
containing a newline cannot be finished.

### Community submissions

Signed-in users can submit passages from the Contribute screen. Nothing
reaches other players until a moderator approves it. Approved passages are
served from the database and merged over the bundled packs when the client
starts.

To fold approved submissions back into the repository:

```bash
node scripts/export_approved.js http://localhost:8787
node scripts/merge_packs.js
```

The first administrator is named by `TYPERPUNK_ADMIN_USERNAME` at startup.
Administrators appoint moderators from the Contribute screen.

## Server

`typerpunk-server` provides accounts, stats, the leaderboard, friends,
multiplayer rooms and the Spotify integration. It needs PostgreSQL.

```bash
sudo -u postgres createuser --pwprompt typerpunk
sudo -u postgres createdb -O typerpunk typerpunk
sudo -u postgres createdb -O typerpunk typerpunk_test

cp crates/server/.env.example crates/server/.env
cargo run --package typerpunk-server
```

Migrations run at startup. Configuration is by environment variable; see
`crates/server/.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Listen port, default 8787 |
| `FRONTEND_ORIGIN` | Origin allowed by CORS |
| `COOKIE_SECURE` | Set to 1 behind TLS |
| `TYPERPUNK_ENV` | Set to `production` to enforce the checks below |
| `TYPERPUNK_ADMIN_USERNAME` | Account to make an administrator at startup |
| `TEXTS_JSON_PATH` | Dataset the race passages come from |
| `SPOTIFY_CLIENT_ID` | Spotify application ID, for Lyrics mode |
| `SPOTIFY_CLIENT_SECRET` | Spotify application secret |
| `STRIPE_SECRET_KEY` | Stripe API key, for the store |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the Stripe webhook |

### Store

The store sells cosmetics and a supporter subscription. Checkout is hosted by
Stripe: the buyer is redirected there, pays there, and returns. No card
details reach this server.

Nothing is granted at checkout. Stripe calls `/api/billing/webhook` when the
payment succeeds, the server verifies the signature, and only then does the
item appear. Set both Stripe variables. With either one missing, the store
still displays but every checkout answers 501.

Prices come from the `cosmetics` and `bundles` tables. The client sends an
item id, never an amount.

## Deployment

Put a reverse proxy in front. Serve `web/` as static files and route
`/api/*` and `/ws/*` to the server. That makes the API same-origin, so no
CORS configuration is needed in the browser.

Set `TYPERPUNK_ENV=production`. The server then refuses to start if:

- `COOKIE_SECURE` is not 1, which would send the session cookie in clear.
- `DATABASE_URL` is still the development default.
- `FRONTEND_ORIGIN` is `http://` on a host that is not local.

A warning in a log nobody reads is not a safeguard, so these are refusals
rather than warnings.

Terminate TLS at the proxy and send HSTS from there. The application sets the
other security headers itself.

### Secrets

Every setting is read from the environment. Copy `crates/server/.env.example`
to `crates/server/.env` for local work. That file is gitignored and is the
only place a password or a client secret belongs.

In production, prefer real environment variables to a file on disk. A systemd
unit can take them from `EnvironmentFile=`, with the file owned by root and
mode 600:

```ini
[Service]
EnvironmentFile=/etc/typerpunk/env
ExecStart=/usr/local/bin/typerpunk-server
User=typerpunk
```

Container runtimes and hosting platforms have their own secret stores. The
server reads plain environment variables in every case, so nothing in the
application changes.

Do not put a secret in `.env.example`, in a commit message, or in an issue.
If one is exposed, rotate it: change the database password, restart the
server, and invalidate sessions by clearing the `sessions` table.

The first administrator is created by setting `TYPERPUNK_ADMIN_USERNAME` to an
account that has already registered. Unset it afterwards. It exists to create
the first administrator and to recover if the last one is removed.

## Development

```bash
cargo test --workspace --exclude typerpunk-steam    # Rust
cd web/tests && python3 run_all.py                  # browser
```

The browser tests drive the real application with Playwright. They need both
servers running; see `web/tests/README.md`.

`crates/steam` is a Bevy desktop client and is excluded from the default test
run because it is slow to build.

Repository layout:

```
crates/core      typing engine, shared by every client
crates/wasm      WebAssembly bindings for the web client
crates/tui       terminal client
crates/server    HTTP and WebSocket server
crates/steam     desktop client (Bevy)
web/             web client, no build step
data/packs/      text packs
scripts/         dataset tools
```

### Terminal client parity

The terminal client has accounts, the leaderboard and friends. Multiplayer
racing is on hold there: it needs a WebSocket client and a live-updating race
view, which is close to the size of the whole web multiplayer build.

## Security

- Passwords are hashed with Argon2. Sessions are HttpOnly, SameSite=Lax
  cookies, and Secure when `COOKIE_SECURE` is set.
- Every query is parameterised. Every value rendered into the page is
  escaped, including imported file content and file names.
- Custom text is read in the browser and never uploaded.
- The Spotify and lyrics endpoints have fixed upstream hosts, so neither can
  be pointed elsewhere. Both are rate limited.
- The client sends a Content-Security-Policy that forbids inline script.
- Dependencies are checked against the OSV database. The server build has no
  known advisories.

Report a security problem by opening an issue, or privately if it is
exploitable.

## Licence

MIT. See [LICENSE](LICENSE).
