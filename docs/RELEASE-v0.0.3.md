# Release v0.0.3

**Tag:** `v0.0.3`
**Date:** 2026-05-22

## Summary

Release **0.0.3** focuses on **more stable Gemini automation**: the extension **keeps the tab open** between prompts, opens a **new conversation** through the SPA sidebar instead of reloading the page, and the desktop app **shuts the backend down cleanly** on quit.

## Highlights

| Area | What changed |
|------|--------------|
| **Extension** | Reuse the same tab after each chat; the prepare step clicks **New chat** via `aria-label` and `href="/app"`. |
| **Extension** | Still falls back to `recreateAccountTab` when the tab is stuck, times out, or the message channel closes. |
| **Desktop** | Cleaner backend shutdown; embedded binary wired through `backend_binary.dart`. |
| **CI** | Tagging `v0.0.3` builds the extension zip, multi-platform backends, macOS/Windows/Linux apps, and the GHCR Docker image. |

## Install

1. Download the assets from [GitHub Releases](https://github.com/NortonBen/extract-AI-token/releases/tag/v0.0.3).
2. **Desktop (recommended):** macOS DMG/zip → open the app → backend listens on port `9516`.
3. **Extension:** unzip `ai-browser-extension-0.0.3-chrome.zip` (or the equivalent CI name) → `chrome://extensions` → **Load unpacked** (or update the existing one).
4. **Backend only:** the `extract-ai-token-backend-*` zip/tarball, or the Docker image below.

## Docker

```bash
docker pull ghcr.io/nortonben/extract-ai-token:0.0.3
docker compose up -d
```

Full instructions: [DOCKER.md](DOCKER.md).

## Upgrade from 0.0.2

- Reload the extension after installing the new zip (or rebuild locally with `npm run build` in `extension/`).
- No backend configuration change is needed if you stay on `127.0.0.1:9516`.
- The Gemini tab now **stays inside the Extract Token group between prompts** — different from 0.0.2, which closed the tab after every chat.

See [CHANGELOG.md](../CHANGELOG.md) for the full list of changes.
