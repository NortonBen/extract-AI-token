#!/usr/bin/env bash
# Build the Rust backend in release mode and sync the binary to every
# location the Flutter wrapper might pick it up from:
#   - <repo>/build/macos-extract-ai-token-backend (dev / repo fallback)
#   - app/build/macos/Build/Products/Debug/**/Resources/extract-ai-token-backend
#   - app/build/macos/Build/Products/Release/**/Resources/extract-ai-token-backend
#
# Run this whenever you change backend/ Rust code so the macOS tray app
# launches the updated binary on next start.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root/backend"

echo "[1/3] cargo build --release"
cargo build --release

src="$repo_root/backend/target/release/backend"
if [[ ! -x "$src" ]]; then
  echo "ERROR: backend binary not found at $src" >&2
  exit 1
fi

echo "[2/3] sync to repo build/ fallback"
mkdir -p "$repo_root/build"
cp "$src" "$repo_root/build/macos-extract-ai-token-backend"

echo "[3/3] sync to Flutter app bundles (if present)"
shopt -s nullglob
for bundle in \
  "$repo_root/app/build/macos/Build/Products/Debug/"*.app \
  "$repo_root/app/build/macos/Build/Products/Release/"*.app
do
  dest="$bundle/Contents/Resources/extract-ai-token-backend"
  if [[ -d "$bundle/Contents/Resources" ]]; then
    cp "$src" "$dest"
    echo "  → $dest"
  fi
done

echo "Done. Restart the Flutter app to pick up the new backend."
