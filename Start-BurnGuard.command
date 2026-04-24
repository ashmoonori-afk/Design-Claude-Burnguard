#!/usr/bin/env bash
# One-click launcher for BurnGuard Design (macOS).
# Double-click this file in Finder to start the backend + frontend dev servers.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[BurnGuard] Working directory: $SCRIPT_DIR"

if ! command -v bun >/dev/null 2>&1; then
    if [ -x "$HOME/.bun/bin/bun" ]; then
        export PATH="$HOME/.bun/bin:$PATH"
    fi
fi

if ! command -v bun >/dev/null 2>&1; then
    echo
    echo "[BurnGuard] Bun is not installed or not on PATH."
    echo "           Install it from https://bun.sh and try again."
    echo
    read -n 1 -s -r -p "Press any key to close..."
    echo
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[BurnGuard] First-time setup: running bun install..."
    if ! bun install; then
        echo
        echo "[BurnGuard] bun install failed. See log above."
        echo
        read -n 1 -s -r -p "Press any key to close..."
        echo
        exit 1
    fi
fi

echo "[BurnGuard] Starting dev servers (backend + frontend)..."
echo "           Close this window to stop the servers."
echo
bun run dev
status=$?

echo
echo "[BurnGuard] Dev servers stopped (exit $status)."
read -n 1 -s -r -p "Press any key to close..."
echo
exit "$status"
