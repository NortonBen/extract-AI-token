# AI Browser Extension (WXT)

Extension-first skeleton for Gemini multi-account tab control.

## Run

```bash
cd /Users/benji/Projects/extract-AI-token/extension
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Output folder:

- `dist/chrome-mv3`

Load unpacked extension from that directory in Chrome.

## Current capabilities

- Account management (`gemini` only for now)
- One account maps to one Gemini URL pattern:
  - `https://gemini.google.com/u/{index}/app`
- Tab ensure/open per account
- Busy state per account + global
- Local history retention (in `chrome.storage.local`)
- Dashboard summary and quick chat test page in extension options

## Main files

- `entrypoints/background.ts`: account/tab/busy/chat orchestration
- `entrypoints/content.ts`: Gemini DOM send/read flow
- `entrypoints/options/*`: React UI for account/history/dashboard
- `src/lib/storage.ts`: storage/data layer
- `src/lib/messages.ts`: internal message contracts

## Next step

Replace in-extension persistence/logic with Rust backend bridge:

- `chrome.runtime.connectNative` (recommended), or
- local HTTP with token.
