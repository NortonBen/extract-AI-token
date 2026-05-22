# Changelog

## [0.0.2] — 2026-05-22

### Added

- **Gemini live streaming** — OpenAI-compatible SSE (`stream=true`) via extension hook + backend bridge.
- **Tool calling** in streaming responses (final `tool_calls` chunks).
- **Usage / token stats** — `usage_counters`, dashboard metrics, reset in extension Settings.
- **Tab debug** — `GET /v1/debug/tab`, stream debug flag for extension.
- **Docker** — `Dockerfile`, `docker-compose.yml`, GHCR workflow (`linux/amd64`, `arm64`).
- **Extension** — GitHub link in side panel footer; README screenshots (`docs/screenshots/`).
- **Desktop app** — `desktop_tray.dart` aligned with legacy tray behavior; English tray menu.

### Changed

- Dashboard extension: removed Locked / History (lưu) cards; UI loads without waiting for backend.
- Desktop: show window on startup; memory optimizations (lazy tabs, log debounce, slower polling).
- Backend logs: `NO_COLOR`, cleaner ANSI in Flutter log view.
- History capped at 50 messages server-side.

### Fixed

- Stream parser / cumulative delta handling (empty completion, tool stream).
- macOS tray “Open Window” single-click (no menu refresh during click).
- ANSI escape codes in desktop log viewer.

### Downloads (CI assets on tag `v0.0.2`)

| Asset | Description |
|-------|-------------|
| `extension-chrome` zip | Chrome MV3 side panel |
| `extract-ai-token-backend-*.zip` / `.tar.gz` | CLI backend only |
| `extract-ai-token-v0.0.2-macos.dmg` / `.zip` | macOS desktop app |
| `extract-ai-token-windows.zip` | Windows desktop app |
| `extract-ai-token-linux.tar.gz` | Linux desktop bundle |
| `ghcr.io/<owner>/extract-ai-token:0.0.2` | Docker image |

## [0.0.1] — 2026-05-22

Initial public release: local backend, Chrome extension, desktop tray app, OpenAI-compatible API.
