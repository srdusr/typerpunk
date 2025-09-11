# TyperPunk Web

A modern web-based typing test application, in plain HTML, CSS, and JavaScript, backed by the shared Rust/WASM game core. No npm packages, no bundler, no build step. This avoids pulling in the npm dependency tree entirely, which removes the main supply-chain attack surface a typical React/Vite frontend carries.

Features:

- Real-time WPM and accuracy tracking
- Ghost text typing interface
- Light/dark mode support
- Responsive design
- Modern UI with cyberpunk-inspired theme

## Prerequisites

- Rust and `cargo` (for the WASM game core)
- `wasm-pack` (installed automatically by `launch.sh` if missing)
- Node.js (used only to run the zero-dependency dev server and dataset scripts; no npm packages are installed)

## Getting Started

```bash
# From repo root: builds WASM, merges the dataset, and starts the dev server
./web/launch.sh
```

Opens http://localhost:4173

## Project Structure

```
web/
├── src/
│   ├── screens/        # Screen renderers (main menu, typing game, end screen)
│   ├── app.js           # Top-level screen controller
│   ├── game.js          # WASM game instance lifecycle
│   ├── chart.js          # Canvas-based WPM/accuracy graph
│   ├── stats.js          # WPM/accuracy calculation
│   ├── theme.js           # Light/dark theme state
│   ├── main.js            # Application entry point
│   └── styles.css         # Global styles
├── wasm/                # WASM bindings, copied here by launch.sh (gitignored)
├── index.html           # HTML entry point
└── serve.mjs            # Zero-dependency static file server
```

## Development

The project uses:

- Vanilla JavaScript (ES modules), no framework or bundler
- The browser's native `<canvas>` API for the results graph
- Node's built-in `http` module for local serving (`serve.mjs`)
- Plain CSS for styling

Because there is no build step, editing a file under `src/` and reloading the page is the whole workflow.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
