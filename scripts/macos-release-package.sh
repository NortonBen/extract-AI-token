#!/usr/bin/env bash
# Package macOS release: sign app (only if certificate present), DMG, optional notarize, zip.
#
# Certificate (any one):
#   MACOS_CERTIFICATE_BASE64 / CERTIFICATE_BASE64
#   MACOS_CERTIFICATE_PATH / CERTIFICATE_PATH
#   MACOS_CERTIFICATE_PASSWORD / CERTIFICATE_PASSWORD
#   KEYCHAIN_PASSWORD
#
# Notarization (optional, requires signed build):
#   APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
#   or APPLE_API_KEY_ID + APPLE_API_ISSUER_ID + APPLE_API_KEY

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck source=macos-certificate-env.sh
source "$REPO_ROOT/scripts/macos-certificate-env.sh"

APP="$(ls -dt app/build/macos/Build/Products/Release/*.app | head -1)"
TAG="${GITHUB_REF_NAME:-local}"
DMG="extract-ai-token-${TAG}-macos.dmg"
ZIP="extract-ai-token-${TAG}-macos.zip"

if [[ ! -d "$APP" ]]; then
  echo "error: Release .app not found. Run: flutter build macos --release" >&2
  exit 1
fi

macos_resolve_certificate_env

if macos_certificate_configured; then
  echo "==> Certificate found — signing app"
  ./scripts/macos-import-signing-cert.sh
  ./scripts/macos-sign-app.sh "$APP"
else
  echo "==> No certificate — skipping code sign (unsigned DMG)"
  echo "    Set MACOS_CERTIFICATE_BASE64 or CERTIFICATE_PATH to sign. See docs/MACOS_SIGNING.md"
fi

echo "==> Create DMG"
./scripts/create-macos-dmg.sh "$APP" "$DMG" "Extract AI Token"

if macos_certificate_configured; then
  if [[ -n "${APPLE_ID:-}" || -n "${APPLE_API_KEY_ID:-}" ]]; then
    echo "==> Notarize DMG"
    ./scripts/macos-notarize.sh "$DMG"
    echo "Signed and notarized: $DMG"
  else
    echo "warn: App is signed but not notarized (add APPLE_ID or API key secrets)." >&2
    echo "      Gatekeeper may still show a warning until notarized." >&2
  fi
fi

APP_NAME="$(basename "$APP")"
(
  cd "$(dirname "$APP")"
  zip -r --symlinks "$REPO_ROOT/$ZIP" "$APP_NAME"
)

echo "Artifacts: $DMG, $ZIP"
