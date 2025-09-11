#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color
YELLOW='\033[0;33m'

echo -e "${BLUE}Starting TyperPunk Web...${NC}"

# Resolve directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}/.."

# Ensure wasm-pack is available (auto-install if possible)
if ! command -v wasm-pack &> /dev/null; then
  echo -e "${YELLOW}wasm-pack not found. Attempting to install via cargo...${NC}"
  if command -v cargo &> /dev/null; then
    cargo install wasm-pack || {
      echo -e "${RED}Failed to install wasm-pack automatically. Please install manually: cargo install wasm-pack${NC}"
      exit 1
    }
  else
    echo -e "${RED}Rust cargo is not installed. Please install Rust and then run: cargo install wasm-pack${NC}"
    exit 1
  fi
fi

# Ensure node is available (used only to run scripts, no npm packages required)
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed. Please install Node.js to run the dataset merge and dev server scripts.${NC}"
  exit 1
fi

# Ensure dataset exists by merging packs at repo root (best-effort, no npm needed)
echo "Ensuring dataset (texts.json) exists by merging packs..."
(cd "$ROOT_DIR" && node scripts/merge_packs.js) \
  && echo "Merged packs into texts.json" \
  || echo -e "${YELLOW}Warning:${NC} Could not merge packs; continuing with existing texts.json"

# Build the WASM module
echo "Building WASM module..."
cd "$ROOT_DIR/crates/wasm"

# Clean previous build
rm -rf pkg target

# Build with wasm-pack
wasm-pack build --target web --release

# Check if build was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to build WASM module${NC}"
    exit 1
fi

cd "$SCRIPT_DIR"

# Copy the built WASM bindings into web/wasm for the browser to import directly
mkdir -p wasm
cp "$ROOT_DIR/crates/wasm/pkg/typerpunk_wasm.js" wasm/
cp "$ROOT_DIR/crates/wasm/pkg/typerpunk_wasm_bg.wasm" wasm/
echo "Copied WASM bindings into web/wasm/"

# Copy shared texts.json into web/src/data if present
mkdir -p src/data
if [ -f "$ROOT_DIR/texts.json" ]; then
  cp "$ROOT_DIR/texts.json" src/data/texts.json
  echo "Copied shared texts.json into web/src/data/"
else
  echo -e "${YELLOW}Warning:${NC} ../texts.json not found. Using fallback web/src/data/texts.json"
fi

# Start the static file server (no bundler, no npm dependencies)
echo -e "${GREEN}Starting development server...${NC}"
echo -e "${GREEN}Website will be available at: http://localhost:4173${NC}"
node serve.mjs
