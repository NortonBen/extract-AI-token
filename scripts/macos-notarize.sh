#!/usr/bin/env bash
# Submit a .app or .dmg to Apple notarization and staple the ticket.
#
# Usage:
#   ./scripts/macos-notarize.sh <path-to.app-or.dmg>
#
# Required env (app-specific password):
#   APPLE_ID
#   APPLE_APP_SPECIFIC_PASSWORD
#   APPLE_TEAM_ID
#
# Or API key:
#   APPLE_API_KEY_ID, APPLE_API_ISSUER_ID, APPLE_API_KEY (base64 .p8)

set -euo pipefail

ARTIFACT="${1:?Usage: $0 <path-to.app-or.dmg>}"

if [[ ! -e "$ARTIFACT" ]]; then
  echo "error: artifact not found: $ARTIFACT" >&2
  exit 1
fi

echo "Submitting for notarization: $ARTIFACT"

if [[ -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER_ID:-}" && -n "${APPLE_API_KEY:-}" ]]; then
  KEY_PATH="$(mktemp -t AuthKey).p8"
  trap 'rm -f "$KEY_PATH"' EXIT
  echo "$APPLE_API_KEY" | base64 --decode > "$KEY_PATH"
  xcrun notarytool submit "$ARTIFACT" \
    --key "$KEY_PATH" \
    --key-id "$APPLE_API_KEY_ID" \
    --issuer "$APPLE_API_ISSUER_ID" \
    --wait
else
  : "${APPLE_ID:?Set APPLE_ID or API key env vars}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?Set APPLE_APP_SPECIFIC_PASSWORD}"
  : "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"
  xcrun notarytool submit "$ARTIFACT" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait
fi

echo "Stapling notarization ticket..."
xcrun stapler staple "$ARTIFACT"
xcrun stapler validate "$ARTIFACT"

echo "Notarization complete: $ARTIFACT"
