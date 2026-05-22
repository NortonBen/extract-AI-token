#!/usr/bin/env bash
# Build a drag-to-Applications DMG from a macOS .app bundle.
#
# Usage:
#   ./scripts/create-macos-dmg.sh <path-to.app> <output.dmg> [volume-name]
#
# Example:
#   ./scripts/create-macos-dmg.sh \
#     "app/build/macos/Build/Products/Release/Extract AI Token.app" \
#     "extract-ai-token-macos.dmg" \
#     "Extract AI Token"

set -euo pipefail

APP_PATH="${1:?Usage: $0 <path-to.app> <output.dmg> [volume-name]}"
OUTPUT_DMG="${2:?Usage: $0 <path-to.app> <output.dmg> [volume-name]}"
VOL_NAME="${3:-Extract AI Token}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "error: app bundle not found: $APP_PATH" >&2
  exit 1
fi

APP_NAME="$(basename "$APP_PATH")"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

cp -R "$APP_PATH" "$STAGE/$APP_NAME"
ln -s /Applications "$STAGE/Applications"

rm -f "$OUTPUT_DMG"
hdiutil create \
  -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$OUTPUT_DMG"

echo "Created $OUTPUT_DMG"
