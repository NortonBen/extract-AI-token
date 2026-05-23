# Release v0.0.2

**Tag:** `v0.0.2`
**Date:** 2026-05-22

## Summary

Release **0.0.2** adds **real Gemini streaming**, **tool calls inside streams**, token/usage stats, **Docker** packaging, several extension and desktop improvements, and fixes for stream parsing, log output, and the macOS tray.

## Highlights

- Live Gemini SSE (`stream=true`) via the extension hook + backend bridge.
- Tool calls in streaming responses (final `tool_calls` chunks).
- Usage counters and dashboard metrics with a reset action in Settings.
- Docker image plus `docker-compose.yml`, published to GHCR for `linux/amd64` and `arm64`.
- README screenshots in `docs/screenshots/`; GitHub link in the side panel footer.
- macOS tray UX: single-click "Open Window" now works reliably.

## Install

1. Download the assets from [GitHub Releases](https://github.com/NortonBen/extract-AI-token/releases/tag/v0.0.2).
2. **Desktop (recommended):** macOS DMG/zip → open the app → backend listens on port `9516`.
3. **Extension:** unzip `*-chrome.zip` → `chrome://extensions` → **Load unpacked**.
4. **Docker:** `docker compose up -d`, then point the extension at `127.0.0.1:9516`.

## Docker

```bash
docker pull ghcr.io/nortonben/extract-ai-token:0.0.2
docker compose up -d
```

Full instructions: [DOCKER.md](DOCKER.md).

See [CHANGELOG.md](../CHANGELOG.md) for the full list of changes.
