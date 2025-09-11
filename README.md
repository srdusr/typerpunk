# TyperPunk

A modern typing test in your terminal (CLI) and in the browser (Web).

## Quick Start

- **CLI (Terminal UI)**
  ```bash
  # Clone and enter
  git clone https://github.com/yourusername/typerpunk.git
  cd typerpunk

  # Install for CLI (builds TUI and optionally merges dataset packs)
  ./install.sh

  # Run CLI
  cargo run --package typerpunk-tui
  ```

- **Web**
  ```bash
  # From repo root: builds WASM and starts the static dev server
  ./web/launch.sh
  ```
  Opens http://localhost:4173

## Dataset (shared by CLI and Web)

- **Offline (recommended)**
  - Add texts to `data/packs/*.json` with fields:
    ```json
    { "category": "programming", "content": "80-400 chars…", "attribution": "Author" }
    ```
  - Merge packs into the shared `texts.json` at repo root:
    ```bash
    node scripts/merge_packs.js
    ```

- **Online (optional, web only)**
  - Host a `texts.json` and set a URL in the page (e.g., `web/index.html`):
    ```html
    <script>window.TYPERPUNK_TEXTS_URL = "https://your.cdn/path/to/texts.json";</script>
    ```
  - The web app uses the online dataset if reachable; otherwise it falls back to the bundled file.

Notes:
- `web/launch.sh` copies the root `texts.json` into `web/src/data/texts.json` for local dev.
- A small fallback dataset is kept in `web/src/data/texts.json`.

## CLI Keys

- Start: Enter
- Quit: Esc
- Change category: Left/Right
- Delete word: Ctrl+Backspace / Alt+Backspace / Ctrl+H / Ctrl+W

## Scripts Scope

- `install.sh`: CLI-focused (Rust toolchain, dataset merge via Node, builds TUI)
- `web/launch.sh`: Web dev workflow (WASM build + zero-dependency static server)

No npm packages are used anywhere in this repo. Node.js is used only as a
runtime for small built-in-module-only scripts (`scripts/merge_packs.js`,
`web/serve.mjs`); nothing is ever installed from the npm registry.

## Repo Layout

```
typerpunk/
├── Cargo.toml            # Workspace configuration
├── crates/
│   ├── core/            # Shared core functionality
│   └── tui/             # Terminal UI implementation
├── data/
│   └── packs/           # Offline dataset packs
├── web/                 # Web app (plain HTML/CSS/JS, no build step)
│   ├── src/
│   ├── index.html
│   └── serve.mjs
├── scripts/
│   └── merge_packs.js   # Merge packs into texts.json
└── README.md
```

## License

MIT
