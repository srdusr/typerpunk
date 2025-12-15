# TyperPunk web client

Plain HTML, CSS and JavaScript, backed by the shared Rust core compiled to
WebAssembly. There is no bundler, no build step and no npm dependency tree,
which removes the supply chain a typical framework setup carries.

## Requirements

- Rust and `cargo`, for the WebAssembly core.
- `wasm-pack`. `launch.sh` installs it if it is missing.
- Node.js, used only to run the dataset script and the static file server. No
  packages are installed.

## Running it

```bash
./web/launch.sh
```

This builds the WebAssembly module, merges the text packs, and serves the app
on http://localhost:4173.

Accounts, the leaderboard, friends and multiplayer need `typerpunk-server` as
well. See the root README.

## Layout

```
src/screens/     one file per screen
src/app.js       screen controller and routing
src/game.js      WebAssembly game lifecycle
src/chart.js     end screen graph
src/stats.js     WPM and accuracy
src/customText.js  importing and chunking your own text
src/languages.js typing vocabularies
src/styles.css   all styling
wasm/            WebAssembly bindings, copied here by launch.sh, gitignored
index.html       entry point
serve.mjs        static file server
```

## Working on it

There is no build step. Edit a file under `src/` and reload the page.

The one exception is the Rust core: changing `crates/core` or `crates/wasm`
means running `launch.sh` again to rebuild the WebAssembly module.

`serve.mjs` sends the Content-Security-Policy. It forbids inline script, so
new code belongs in a file rather than in a `<script>` block.

## Tests

```bash
cd web/tests && python3 run_all.py
```

These drive the real application with Playwright. Both servers must already
be running. See `tests/README.md`.
