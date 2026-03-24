#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="fluid/gui/frontend"
STATIC_DIR="fluid/gui/static"

# ── Colours ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }

# ── Prerequisite checks ──────────────────────────────────────────────────────

echo -e "\n${BOLD}Fluid — Build & Run${NC}\n"

check_cmd() {
    command -v "$1" &>/dev/null || error "$1 is not installed. Please install it first."
}

check_version() {
    local cmd="$1" min="$2" actual="$3"
    local sorted
    sorted=$(printf '%s\n%s' "$min" "$actual" | sort -V | head -n1)
    if [ "$sorted" != "$min" ]; then
        error "$cmd version $actual is below the minimum required ($min)"
    fi
}

check_cmd python3
check_cmd node
check_cmd npm
check_cmd docker

PYTHON_VER=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
NODE_VER=$(node -v | sed 's/^v//')

check_version "python3" "3.10" "$PYTHON_VER"
check_version "node"    "18.0.0" "$NODE_VER"

info "python3  $PYTHON_VER"
info "node     $NODE_VER"
info "npm      $(npm -v)"
info "docker   $(docker --version | grep -oP '\d+\.\d+\.\d+')"

# ── Install Python package ────────────────────────────────────────────────────

echo ""
info "Installing Python package …"
pip install -e ".[gui]" --quiet

# ── Build frontend + Electron app ────────────────────────────────────────────

info "Installing frontend dependencies …"
(cd "$FRONTEND_DIR" && npm install --silent)

info "Building frontend …"
(cd "$FRONTEND_DIR" && npm run build)

info "Copying build to static directory …"
rm -rf "$STATIC_DIR/assets" "$STATIC_DIR/index.html"
cp -r "$FRONTEND_DIR/dist/." "$STATIC_DIR/"

info "Packaging Electron app …"
(cd "$FRONTEND_DIR" && npx electron-builder)

# ── Locate and launch ────────────────────────────────────────────────────────

echo ""
APPIMAGE=$(find "$FRONTEND_DIR/dist-electron" -name '*.AppImage' -type f 2>/dev/null | head -n1)
DMG=$(find "$FRONTEND_DIR/dist-electron" -name '*.dmg' -type f 2>/dev/null | head -n1)
EXE=$(find "$FRONTEND_DIR/dist-electron" -name '*.exe' -type f 2>/dev/null | head -n1)

if [ -n "$APPIMAGE" ]; then
    info "Build complete: $APPIMAGE"
    chmod +x "$APPIMAGE"
    echo -e "\nLaunching Fluid …\n"
    exec "$APPIMAGE"
elif [ -n "$DMG" ]; then
    info "Build complete: $DMG"
    echo -e "\nOpen the .dmg to install Fluid:\n  open \"$DMG\""
elif [ -n "$EXE" ]; then
    info "Build complete: $EXE"
    echo -e "\nRun the installer:\n  $EXE"
else
    warn "No packaged app found in $FRONTEND_DIR/dist-electron/"
    warn "You can still run the dev version with: fluid-gui"
fi
