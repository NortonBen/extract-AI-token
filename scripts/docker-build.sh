#!/usr/bin/env bash
# Build Docker image for extract-ai-token backend API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE:-extract-ai-token:latest}"
PLATFORM="${PLATFORM:-}"

args=(--file Dockerfile --tag "$IMAGE" .)
if [[ -n "$PLATFORM" ]]; then
  args=(--platform "$PLATFORM" "${args[@]}")
fi

echo "Building $IMAGE ..."
docker build "${args[@]}"
echo "Done. Run: docker compose up -d   (or: docker run -p 9516:9516 -v extract-ai-token-data:/data $IMAGE)"
