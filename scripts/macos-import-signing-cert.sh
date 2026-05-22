#!/usr/bin/env bash
# Import Developer ID Application certificate (.p12) into a temporary keychain (CI/local).
#
# Required when certificate is configured (see macos-certificate-env.sh):
#   MACOS_CERTIFICATE_PASSWORD or CERTIFICATE_PASSWORD
#   KEYCHAIN_PASSWORD

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=macos-certificate-env.sh
source "$SCRIPT_DIR/macos-certificate-env.sh"

macos_resolve_certificate_env

if ! macos_certificate_configured; then
  echo "error: no certificate configured (MACOS_CERTIFICATE_BASE64 or CERTIFICATE_PATH)" >&2
  exit 1
fi

: "${MACOS_CERTIFICATE_BASE64:?certificate base64 is empty after resolve}"
: "${MACOS_CERTIFICATE_PASSWORD:=${CERTIFICATE_PASSWORD:-}}"
: "${MACOS_CERTIFICATE_PASSWORD:?Set MACOS_CERTIFICATE_PASSWORD or CERTIFICATE_PASSWORD}"
: "${KEYCHAIN_PASSWORD:?Set KEYCHAIN_PASSWORD}"

KEYCHAIN_PATH="${RUNNER_TEMP:-/tmp}/build.keychain-db"
CERT_PATH="${RUNNER_TEMP:-/tmp}/certificate.p12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "$MACOS_CERTIFICATE_BASE64" | base64 --decode > "$CERT_PATH"
security import "$CERT_PATH" -P "$MACOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH" $(security list-keychains -d user | tr -d '"')

echo "Signing identities:"
security find-identity -v -p codesigning "$KEYCHAIN_PATH"
