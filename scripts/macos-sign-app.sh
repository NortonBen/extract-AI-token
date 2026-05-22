#!/usr/bin/env bash
# Sign .app and embedded backend for Hardened Runtime + notarization.
#
# Usage:
#   ./scripts/macos-sign-app.sh <path-to.app>
#
# Env:
#   CODESIGN_IDENTITY — optional; defaults to first "Developer ID Application" identity

set -euo pipefail

APP_PATH="${1:?Usage: $0 <path-to.app>}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTITLEMENTS="$REPO_ROOT/app/macos/Runner/Release.entitlements"

if [[ ! -d "$APP_PATH" ]]; then
  echo "error: not a directory: $APP_PATH" >&2
  exit 1
fi

IDENTITY="${CODESIGN_IDENTITY:-}"
if [[ -z "$IDENTITY" ]]; then
  IDENTITY="$(security find-identity -v -p codesigning | grep 'Developer ID Application' | head -1 | sed -E 's/^[[:space:]]*[0-9]+) (.+) [0-9]+$/\1/')"
fi
if [[ -z "$IDENTITY" ]]; then
  echo "error: no Developer ID Application identity found. Import a certificate first." >&2
  exit 1
fi

echo "Using identity: $IDENTITY"

sign_file() {
  local target="$1"
  local use_entitlements="${2:-0}"
  if [[ "$use_entitlements" == "1" && -f "$ENTITLEMENTS" ]]; then
    codesign --force --options runtime --timestamp \
      --entitlements "$ENTITLEMENTS" \
      --sign "$IDENTITY" "$target"
  else
    codesign --force --options runtime --timestamp \
      --sign "$IDENTITY" "$target"
  fi
}

# Innermost binaries first (frameworks, dylibs, plugins).
if [[ -d "$APP_PATH/Contents/Frameworks" ]]; then
  find "$APP_PATH/Contents/Frameworks" -type f \( -name '*.dylib' -o -perm -111 \) | while read -r f; do
    sign_file "$f" 0 || true
  done
  find "$APP_PATH/Contents/Frameworks" -depth -name '*.framework' | while read -r f; do
    sign_file "$f" 0
  done
fi

if [[ -d "$APP_PATH/Contents/PlugIns" ]]; then
  find "$APP_PATH/Contents/PlugIns" -depth \( -name '*.dylib' -o -name '*.framework' -o -perm -111 \) | while read -r f; do
    [[ -f "$f" || -d "$f" ]] && sign_file "$f" 0 || true
  done
fi

BACKEND="$APP_PATH/Contents/Resources/extract-ai-token-backend"
if [[ -f "$BACKEND" ]]; then
  chmod +x "$BACKEND"
  sign_file "$BACKEND" 0
fi

RUNNER="$APP_PATH/Contents/MacOS/Runner"
if [[ -f "$RUNNER" ]]; then
  sign_file "$RUNNER" 1
fi

sign_file "$APP_PATH" 1

echo "Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl -a -vv "$APP_PATH" || true

echo "Signed $APP_PATH"
