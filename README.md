# extract-AI-token

> **Tiếng Việt:** [README-vn.md](README-vn.md)

Chrome extension and Rust backend for controlling multiple Gemini accounts in the browser: per-account tabs, busy-state tracking, chat history, and sync over HTTP / WebSocket. An optional **macOS tray app** can launch and supervise the backend process.

## Project structure

| Directory | Description |
|-----------|-------------|
| `extension/` | Chrome extension (WXT + React): side panel, background service worker, Gemini content script |
| `backend/` | Rust API (Axum): REST + WebSocket, SQLite persistence |
| `app/` | Flutter macOS tray host — starts/stops the backend binary, health checks on port `8787` |
| `old/` | Archived reference code (not required to run) |

## Features

- **Multi-account Gemini** — one account maps to a URL such as `https://gemini.google.com/u/{index}/app` or a custom `pageRoot`
- **Tab control** — open/focus tabs per account; tab metadata stored locally in the extension
- **Content-script automation** — detect account info, send prompts, read responses on Gemini pages
- **Backend sync** — extension background connects to `ws://{host}:{port}/ws` (default `127.0.0.1:8787`); accounts, history, and busy state persist in SQLite when the backend is up
- **Side panel UI** — accounts, chat, history, dashboard, backend connection settings
- **macOS tray app** — background launcher for the compiled `backend` binary (no visible window)

Provider types in the data model include `gemini` and `chatgpt`; Gemini is the primary integration today.

## Requirements

| Component | Requirements |
|-----------|----------------|
| Extension | [Node.js](https://nodejs.org/) 20+, Google Chrome |
| Backend | [Rust](https://www.rust-lang.org/) stable (edition 2024) |
| macOS app (optional) | [Flutter](https://flutter.dev/) SDK, macOS |

## Quick start

### 1. Backend

**Option A — run from source**

```bash
cd backend
cargo run
```

**Option B — macOS tray app** (builds/runs the backend binary from the menu bar)

```bash
cd app
flutter run -d macos
```

Default listen address: `127.0.0.1:8787`. SQLite database: `backend/data/app.db` (or path set by the launcher).

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ADDR` | `127.0.0.1:8787` | Bind address |
| `SQLITE_PATH` | `data/app.db` | SQLite file path (relative to backend cwd) |
| `RUST_LOG` | `info` | Tracing log level |

Verify: `curl http://127.0.0.1:8787/health`

### 2. Extension

```bash
cd extension
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Load the unpacked extension from `extension/dist/chrome-mv3` in Chrome (`chrome://extensions` → Developer mode → Load unpacked).

Open the **side panel**, configure backend host/port if needed, and reconnect. The panel stays usable when the backend is offline; persistence syncs once connected.

More extension notes: [extension/README.md](extension/README.md).

## Backend API

### REST

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/ws` | WebSocket upgrade |
| `GET` / `PUT` | `/v1/accounts` | List / upsert accounts |
| `DELETE` | `/v1/accounts/{id}` | Delete account |
| `GET` / `PUT` | `/v1/models` | List / upsert model configs |
| `DELETE` | `/v1/models/{id}` | Delete model |
| `GET` / `POST` / `DELETE` | `/v1/history` | List / append / clear history |
| `GET` / `POST` | `/v1/busy` | Get / set busy state |
| `GET` | `/v1/dashboard` | Dashboard summary |

### WebSocket message types

Request envelope: `{ "id": "<uuid>", "type": "<command>", "payload": { ... } }`

| `type` | Description |
|--------|-------------|
| `ping` | Liveness check |
| `state.get` | Accounts, history (limit 200), busy |
| `dashboard.get` | Dashboard counters |
| `models.get` / `model.upsert` / `model.delete` | Model registry |
| `account.upsert` / `account.delete` | Account CRUD |
| `history.append` / `history.clear` | History writes |
| `busy.get` / `busy.set` | Busy flags |

## CI

GitHub Actions on push/PR to `main` and `master`:

- **backend** — `cargo fmt --check`, `clippy`, `test`, `release` build
- **extension** — `npm ci`, `npm run build`

Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Disclaimer

This project is built through reverse engineering and is provided for learning, research, personal experimentation, and internal validation only. No commercial authorization is granted, and no warranty of stability, fitness, or results is provided. The author and repository maintainers are not responsible for any direct or indirect loss, account suspension, data loss, legal risk, or third-party claims arising from use, modification, distribution, deployment, or reliance on this project.

Do not use this project in ways that violate service terms, agreements, laws, or platform rules. Before any commercial use, review the [LICENSE](LICENSE), the relevant terms, and confirm that you have the author's written permission.

## License

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
