#!/usr/bin/env bash
# Resolve certificate env for macOS signing scripts.
# Source this file: source "$(dirname "$0")/macos-certificate-env.sh"
#
# Supported (first match wins):
#   MACOS_CERTIFICATE_BASE64 / CERTIFICATE_BASE64 — base64 .p12
#   MACOS_CERTIFICATE_PATH / CERTIFICATE_PATH     — path to .p12 file

macos_certificate_configured() {
  [[ -n "${MACOS_CERTIFICATE_BASE64:-}" || -n "${CERTIFICATE_BASE64:-}" ]] \
    || [[ -f "${MACOS_CERTIFICATE_PATH:-}" || -f "${CERTIFICATE_PATH:-}" ]]
}

macos_resolve_certificate_env() {
  if [[ -n "${CERTIFICATE_BASE64:-}" && -z "${MACOS_CERTIFICATE_BASE64:-}" ]]; then
    export MACOS_CERTIFICATE_BASE64="$CERTIFICATE_BASE64"
  fi

  local p12_path="${MACOS_CERTIFICATE_PATH:-${CERTIFICATE_PATH:-}}"
  if [[ -z "${MACOS_CERTIFICATE_BASE64:-}" && -n "$p12_path" && -f "$p12_path" ]]; then
    if base64 --help 2>/dev/null | grep -q -- '-i'; then
      export MACOS_CERTIFICATE_BASE64="$(base64 -i "$p12_path" | tr -d '\n')"
    else
      export MACOS_CERTIFICATE_BASE64="$(base64 < "$p12_path" | tr -d '\n')"
    fi
  fi
}
