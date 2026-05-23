# Changelog

## [0.0.4] — 2026-05-23

### Added

- **Extension Settings — "After each chat"** — pick the behaviour after every successful prompt: **Open a new tab** (default) · **Reload the page (new chat)** · **Keep the same tab**. Stored in `chrome.storage.local`, exposed through `behavior.get` / `behavior.set`.
- **Parallel-send ephemeral tabs** — when a new prompt is sent to an account that is already mid-flight, the extension spins up a **secondary Gemini tab** (not registered in the account-tab mapping) that runs the request independently and closes when done. The primary tab keeps streaming undisturbed.
- **HTTP-level "tab busy" check** — `activeStreamRequests` counter inside the MAIN-world hook tracks every in-flight `StreamGenerate` fetch/XHR (even when the extension has not "armed" a session). The count is broadcast through `window.postMessage` as `active-count`. Background uses it for:
  - **`isTabStreamBusy(tabId)`** — fast probe before deciding whether to allocate an ephemeral tab.
  - **`waitForTabStreamIdle(tabId, 15s)`** — required gate for the **Reload the page** mode so reloads never abort a stream mid-flight.
- **Unhook cleanup on page unload** — snapshot `EventTarget.prototype.addEventListener` **before** `patchVisibility` (which filters `pagehide`), then register a dedicated `pagehide` listener that drains the counter and `disarmSession()` cleanly before the document tears down. The hook re-applies automatically on the next page's `document_start`.

### Changed

- `sendPrompt` / `sendPromptStream` now decide the starting tab through a **two-layer dispatcher**: `accountsInFlight` (local extension flag) plus an HTTP-level probe fallback → routes to primary vs ephemeral tab.
- `applyAfterChatBehavior(accountId)` replaces the hard-coded close-after-each-chat path: dispatches based on `AppBehaviorConfig.afterChat`.
- Stream interceptor `patchFetch`: even **unarmed** StreamGenerate requests are tracked via a `TransformStream` passthrough on the app branch, so the bridge knows the tab is busy.
- Every MAIN-world hook bootstrap (especially after a reload) calls `emitActiveStreams()` so the isolated bridge starts at `count=0` and never inherits stale state.

### UI

- Settings modal: new **"After each chat"** section with a `Select` for the three modes and descriptive tooltips.

### Key files

- [extension/entrypoints/background.ts](extension/entrypoints/background.ts) — dispatcher + idle gate for the reload path.
- [extension/entrypoints/stream-intercept.content.ts](extension/entrypoints/stream-intercept.content.ts) — `activeStreamRequests`, `trackStreamStart/End`, `registerUnloadCleanup`.
- [extension/entrypoints/content.ts](extension/entrypoints/content.ts) — `activeStreamCount` + `waitForStreamIdle` + `gemini.tab.busy_check` / `gemini.tab.wait_idle` handlers.
- [extension/src/lib/storage.ts](extension/src/lib/storage.ts) + [types.ts](extension/src/lib/types.ts) + [messages.ts](extension/src/lib/messages.ts) + [extension-api.ts](extension/src/lib/extension-api.ts) — `AppBehaviorConfig { afterChat }`.

### Downloads (CI assets on tag `v0.0.4`)

| Asset | Description |
|-------|-------------|
| `extension-chrome` zip | Chrome MV3 side panel |
| `extract-ai-token-backend-*.zip` / `.tar.gz` | Standalone CLI backend |
| `extract-ai-token-v0.0.4-macos.dmg` / `.zip` | macOS desktop app |
| `extract-ai-token-windows.zip` | Windows desktop app |
| `extract-ai-token-linux.tar.gz` | Linux desktop bundle |
| `ghcr.io/<owner>/extract-ai-token:0.0.4` | Docker image |

## [0.0.3] — 2026-05-22

### Added

- **Extension — reuse the Gemini tab** — keep the tab between successful prompts instead of closing and reopening it.
- **Extension — prepare the next prompt** — click **New chat** in the SPA sidebar instead of reloading the page; resets stream/composer state inside the content script.
- **Desktop — `backend_binary.dart`** — clearer reference to the embedded backend binary inside the app bundle.

### Changed

- Extension uses `prepareAccountTabForNextChat` instead of `closeAccountTab` after `send_prompt` / streaming completes.
- Desktop: cleaner backend shutdown on app quit; updated build/sign scripts and the release workflow.

### Downloads (CI assets on tag `v0.0.3`)

| Asset | Description |
|-------|-------------|
| `extension-chrome` zip | Chrome MV3 side panel |
| `extract-ai-token-backend-*.zip` / `.tar.gz` | Standalone CLI backend |
| `extract-ai-token-v0.0.3-macos.dmg` / `.zip` | macOS desktop app |
| `extract-ai-token-windows.zip` | Windows desktop app |
| `extract-ai-token-linux.tar.gz` | Linux desktop bundle |
| `ghcr.io/<owner>/extract-ai-token:0.0.3` | Docker image |

## [0.0.2] — 2026-05-22

### Added

- **Gemini live streaming** — OpenAI-compatible SSE (`stream=true`) via the extension hook + backend bridge.
- **Tool calling** support in streaming responses (final `tool_calls` chunks).
- **Usage / token stats** — `usage_counters`, dashboard metrics, reset in extension Settings.
- **Tab debug** — `GET /v1/debug/tab`, stream debug flag for the extension.
- **Docker** — `Dockerfile`, `docker-compose.yml`, GHCR workflow (`linux/amd64`, `arm64`).
- **Extension** — GitHub link in the side panel footer; README screenshots in `docs/screenshots/`.
- **Desktop app** — `desktop_tray.dart` aligned with the legacy tray behaviour; English tray menu labels.

### Changed

- Dashboard extension: removed the Locked / History (saved) cards; UI loads without waiting for the backend.
- Desktop: show window on startup; memory optimisations (lazy tabs, log debounce, slower polling).
- Backend logs: `NO_COLOR`, cleaner ANSI output in the Flutter log view.
- History capped at 50 messages server-side.

### Fixed

- Stream parser / cumulative delta handling (empty completion, tool stream).
- macOS tray "Open Window" single-click (no menu refresh while a click is being processed).
- ANSI escape codes in the desktop log viewer.

### Downloads (CI assets on tag `v0.0.2`)

| Asset | Description |
|-------|-------------|
| `extension-chrome` zip | Chrome MV3 side panel |
| `extract-ai-token-backend-*.zip` / `.tar.gz` | Standalone CLI backend |
| `extract-ai-token-v0.0.2-macos.dmg` / `.zip` | macOS desktop app |
| `extract-ai-token-windows.zip` | Windows desktop app |
| `extract-ai-token-linux.tar.gz` | Linux desktop bundle |
| `ghcr.io/<owner>/extract-ai-token:0.0.2` | Docker image |

## [0.0.1] — 2026-05-22

Initial public release: local backend, Chrome extension, desktop tray app, OpenAI-compatible API.
