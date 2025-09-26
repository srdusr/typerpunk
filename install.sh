#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status messages
print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

# Function to print error messages
print_error() {
    echo -e "${RED}[!]${NC} $1"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if Rust is installed
if ! command -v rustc &> /dev/null; then
    print_status "Rust not found. Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    print_status "Rust is already installed"
fi

# Check if cargo is installed
if ! command -v cargo &> /dev/null; then
    print_error "Cargo not found. Please install Rust properly."
    exit 1
fi

# Try to generate texts.json from packs if npm is available
if command -v npm &> /dev/null; then
    print_status "Installing Node.js dependencies (for dataset scripts)..."
    npm install || print_warning "npm install failed; continuing without merging packs"
    if npm run --silent merge-packs; then
        print_status "Merged packs into texts.json"
    else
        print_warning "merge-packs script failed or missing; using existing texts.json"
    fi
else
    print_warning "npm not found; skipping dataset pack merge. Ensure texts.json exists at repo root."
fi

# Build the TUI version
print_status "Building the TUI version..."
cargo build --release --package typerpunk-tui --features tui

if [ $? -eq 0 ]; then
    print_status "Build successful! The TUI executable is located in target/release/typerpunk"
    print_status "You can run it with: ./target/release/typerpunk"
else
    print_error "Build failed. Please check the error messages above."
    exit 1
fi

print_status "Installation complete!" 