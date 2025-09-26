# TyperPunk

A modern typing test application available in both terminal (TUI) and web versions.

## Project Structure

This is a monorepo containing two main parts:

1. **TUI Version** (`crates/tui`): A terminal-based typing test application
2. **Web Version** (`web/`): A web-based version for typerpunk.com


- `texts.json`: Shared dataset consumed by both CLI and Web (auto-generated).
- `data/packs/`: Offline pack files you can edit to add more texts.
- `scripts/merge_packs.js`: Merges all packs into `texts.json`.

## Prerequisites

- Rust toolchain (`rustup`, `cargo`)
- Node.js + npm
- For web: `wasm-pack` (install via `cargo install wasm-pack` or see https://rustwasm.github.io/wasm-pack/installer/)

## Running the TUI Version

```bash
# Clone and enter the repo
git clone https://github.com/srdusr/typerpunk.git
cd typerpunk

# Generate dataset from offline packs (recommended)
npm install
npm run merge-packs

# Run the TUI
cargo run --package typerpunk-tui
```

## Running the Website

```bash
# From repo root, ensure dataset exists
npm install
npm run merge-packs

# Launch the web dev server (builds WASM and starts Vite)
./web/launch.sh
```
The website will be available at http://localhost:3000

## Testing the Website

```bash
cd web
npm test
# or
npm test -- --watch
# or
npm test -- --coverage
```

## Building for Production (Web)

```bash
cd web
npm run build
npm run preview
```
The production build will be in the `web/dist` directory.

## Common Development Tasks (Web)

```bash
cd web
npm run lint
## Text Dataset (Offline Packs + Online)

TyperPunk uses a shared dataset `texts.json` for both CLI and Web.

- Offline (recommended):
  - Add files to `data/packs/*.json` with entries of the form:
    ```json
    {
      "category": "programming",
      "content": "A paragraph of 80–400 characters…",
      "attribution": "Author or Source"
    }
    ```
  - Merge all packs into `texts.json` at repo root:
    ```bash
    npm install
    npm run merge-packs
    ```
- Online (optional, web only):
  - Host a `texts.json` and set a URL in the page (e.g., `web/index.html`):
    ```html
    <script>
      window.TYPERPUNK_TEXTS_URL = "https://your.cdn/path/to/texts.json";
    </script>
    ```
  - The app will fetch the online dataset on load; if unavailable, it falls back to the bundled local file.

Notes:
- `web/launch.sh` copies the root `texts.json` to `web/src/data/texts.json` for local dev.
- A small fallback is checked into `web/src/data/texts.json` to ensure imports resolve.

## Category Filters

- Web UI (`web/src/components/MainMenu.tsx`):
  - A Category dropdown is available on the main menu.
  - Default is **Random**; selecting a category restricts the text pool to that category.

- CLI/TUI (`crates/core/src/ui.rs`, `crates/core/src/app.rs`):
  - On the main menu, use **Left/Right** arrows to cycle categories.
  - Display shows: `Category: Random (←/→ to change)` or the selected category name.
  - Press **Enter** to start; **Esc** to quit.

- Attribution:
  - Web shows attribution under the text.
  - CLI shows attribution below the typing area.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
