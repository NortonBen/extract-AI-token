# Extract Token — Chrome extension

WXT + React extension for Gemini multi-account tab control. Persists accounts, history, and busy state through the Rust backend WebSocket when connected.

> Root docs: [README.md](../README.md) · [README-vn.md](../README-vn.md)

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Output: `dist/chrome-mv3` — load as an unpacked extension in Chrome.

## Capabilities

- Account management (`gemini`; `chatgpt` in the type system)
- URL patterns: `https://gemini.google.com/u/{index}/app` or custom `pageRoot`
- Detect account metadata from the active Gemini tab
- Tab ensure/open per account (local tab map in `chrome.storage.local`)
- Content-script commands: `ping`, `detect_account`, `send_prompt`, `read_response`
- Busy state per account + global (synced to backend when online)
- Side panel: accounts, chat, history, dashboard, backend host/port settings
- WebSocket client to backend (`127.0.0.1:8787` by default)

## Main files

| File | Role |
|------|------|
| `entrypoints/background.ts` | Backend WS client, account/tab/busy/chat orchestration |
| `entrypoints/content.ts` | Gemini DOM automation |
| `entrypoints/sidepanel/` | React side panel UI |
| `src/lib/storage.ts` | Local storage (tabs, backend config) |
| `src/lib/messages.ts` | Extension message contracts |
| `src/lib/extension-api.ts` | Side panel API helpers |

## Backend

Start the Rust server (or the macOS tray app) before expecting sync:

```bash
cd ../backend && cargo run
```

Configure connection in the side panel if host/port differ from defaults.
