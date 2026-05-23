# Release v0.0.4

**Tag:** `v0.0.4`
**Date:** 2026-05-23

## Summary

Release **0.0.4** gives users an explicit **choice** about what should happen after every chat (new tab · reload · keep), handles **parallel** prompts on the same account safely, and guarantees that the "reload" mode never tears down a tab while a **StreamGenerate** request is still in flight.

## Highlights

| Area | What's new |
|------|------------|
| **Settings → After each chat** | Three modes: **Open a new tab** (default, matches 0.0.3) · **Reload the page (new chat)** · **Keep the same tab**. |
| **Parallel send** | A second prompt fired at a busy account now spawns an **ephemeral Gemini tab** that runs alongside the primary one and closes when done. The primary tab keeps streaming undisturbed. |
| **HTTP-level busy tracking** | The MAIN-world hook tracks every in-flight fetch/XHR `StreamGenerate` via `activeStreamRequests`. Background queries it through `gemini.tab.busy_check` and `gemini.tab.wait_idle`. |
| **Safe reload** | The **Reload the page** mode waits up to 15 s for the active stream count to reach zero before reloading. If the tab cannot drain in time, the extension falls back to closing it so no stream is ever aborted mid-flight. |
| **Page-unload cleanup** | An early snapshot of `EventTarget.prototype.addEventListener` lets us register a `pagehide` listener even after `patchVisibility` blocks them. On unload we drain the counter and `disarmSession()` cleanly; the hook re-installs at the next `document_start`. |

## Install

1. Download the assets from [GitHub Releases](https://github.com/NortonBen/extract-AI-token/releases/tag/v0.0.4).
2. **Desktop:** macOS DMG/zip → open the app → backend listens on port `9516`.
3. **Extension:** unzip the MV3 bundle → `chrome://extensions` → **Load unpacked** (or Reload if it was already loaded).
4. **Backend only:** the `extract-ai-token-backend-*` zip / tarball, or the Docker image below.

## Docker

```bash
docker pull ghcr.io/nortonben/extract-ai-token:0.0.4
docker compose up -d
```

Full instructions: [DOCKER.md](DOCKER.md).

## Upgrade from 0.0.3

- Reload the extension after installing the new zip.
- Open the side panel **Settings** and pick the desired mode under **After each chat**.
- The backend still defaults to `127.0.0.1:9516`; no config change required.
- The previous behaviour (close the tab after each chat) maps to the new default **Open a new tab**.

## Technical notes

**Two-layer busy detection.** `sendPrompt` / `sendPromptStream` first check `accountsInFlight` (a local extension Set kept in sync with each in-flight call) and, if that doesn't flag the account, probe the page itself via the MAIN-world `activeStreamRequests` counter. Either signal is enough to allocate an ephemeral tab.

**TransformStream passthrough for unarmed streams.** When a StreamGenerate request fires while the extension hasn't armed a session (e.g. the user typed a prompt manually in Gemini), the patched fetch still wraps the body in a `TransformStream` whose `flush` decrements the counter. This keeps the busy signal honest regardless of whether the extension initiated the request.

**Reload path:** before issuing `prepareAccountTabForNextChat(accountId)`, background sends `gemini.tab.wait_idle` to the content script (max 15 s). The content script resolves immediately when `activeStreamCount === 0`, and otherwise waits for the next `active-count` event that brings it to zero. On timeout, the tab is recycled with `chrome.tabs.remove` + `removeAccountTab` instead of being reloaded.

**Hook lifecycle around reload:**
1. Page is alive — patched `fetch`/`XHR` increments `activeStreamRequests` on entry, decrements on completion/error/abort.
2. Stream ends → counter reaches 0 → bridge fires waiting promises in content script.
3. Background sees idle, triggers `prepareAccountTabForNextChat` → SPA "New chat" or page reload.
4. On reload, `pagehide` fires → cleanup drains the counter and disarms the session.
5. The new page runs `document_start` → `registerUnloadCleanup()` → `patchVisibility()` → `patchFetch()` → `patchXHR()` → `patchBeacon()` → final `emitActiveStreams()` resets the bridge to 0.

See [CHANGELOG.md](../CHANGELOG.md) for the file-level breakdown.
