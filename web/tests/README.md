# TyperPunk web test suite

Playwright end-to-end tests covering the major user-facing flows: typing a
test through to the end screen, account/store/cosmetics, and
leaderboard/friends. These replace the ad-hoc scripts written into `/tmp`
during development - checked in here so they survive past one session and
can be re-run for regressions.

## Prerequisites

- Python 3 with the `playwright` package installed (`pip install
  playwright && playwright install chromium`, or on Arch,
  `pacman -S python-playwright`).
- The web app's dev server running on port 4173:
  `cd web && node serve.mjs`
- The backend running on port 8787, pointed at a throwaway database (do not
  run tests against a production database):
  `DATABASE_URL="postgres://typerpunk:typerpunk_dev@127.0.0.1/typerpunk_test" \
    PORT=8787 COOKIE_SECURE=0 cargo run --package typerpunk-server`

Both servers must already be running before starting the suite - it does
not launch or manage them itself.

## Running

```
cd web/tests
python3 run_all.py
```

Each `test_*.py` file exposes a single `run()` function that raises
`AssertionError` on failure. `run_all.py` imports and calls each one in
turn, continuing after a failure so one broken test doesn't hide the
others, and exits non-zero if anything failed.

To run a single file directly: `python3 test_typing_flow.py`.

## Adding a test

Add a new `test_*.py` file with a `run()` function, using Playwright's sync
API (see the existing files for the pattern). `run_all.py` discovers files
by the `test_*.py` name, so no registration step is needed.
