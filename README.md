# TyperPunk

A modern typing game for terminal (TUI) and in the browser (Web).

## Quick Start

- **TUI (Terminal UI)**
  ```bash
  # Clone and enter
  git clone https://github.com/srdusr/typerpunk.git
  cd typerpunk

  # Install for TUI (builds TUI and optionally merges dataset packs)
  ./install.sh

  # Run TUI
  cargo run --package typerpunk-tui
  ```

- **Web**
  ```bash
  # From repo root: builds WASM and starts Vite
  ./web/launch.sh
  ```
  Opens http://localhost:3000

## Dataset (shared by TUI and Web)

- **Offline (recommended)**
  - Add texts to `data/packs/*.json` with fields:
    ```json
    { "category": "programming", "content": "80–400 chars…", "attribution": "Author" }
    ```
  - Merge packs into the shared `texts.json` at repo root:
    ```bash
    npm install
    npm run merge-packs
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

## TUI Keys

- Start: Enter
- Quit: Esc
- Change category: Left/Right
- Delete word: Ctrl+Backspace / Alt+Backspace / Ctrl+H / Ctrl+W

## Scripts Scope

- `install.sh`: TUI-focused (Rust toolchain, dataset merge if npm is present, builds TUI)
- `web/launch.sh`: Web dev workflow (WASM build + Vite dev server)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
