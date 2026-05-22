# Extract Token

> **Tiếng Việt:** [README-vn.md](README-vn.md)

**Extract Token** helps you work with multiple Gemini accounts in Chrome from one place: manage accounts, open the right tab per account, send prompts, and keep chat history—while a small **macOS app** runs the local data service on your machine.

## What you need

| Item | Notes |
|------|--------|
| **Google Chrome** | For the Extract Token extension |
| **macOS** | For the desktop app that runs the local backend (recommended) |
| **Gemini accounts** | Signed in to [gemini.google.com](https://gemini.google.com) in Chrome |

The backend listens on your computer only (default `127.0.0.1:8787`). Account and history data are stored locally in a SQLite database managed by the macOS app.

## Getting started

### 1. Start the backend (macOS app)

1. Open **Extract AI Token** on your Mac (from the app package you installed).
2. The app starts the backend automatically and shows an icon in the **menu bar**.
3. Confirm status is **Running**:
   - Click the menu bar icon → **Open Dashboard**, or
   - Tray menu shows **● Running (port 8787)** (port may differ if you changed it in Settings).

**Tray menu (menu bar icon):**

| Action | What it does |
|--------|----------------|
| Open Dashboard | Status, API URL, account/history counts |
| Open Logs | Backend log output |
| Open Settings | Change port, local vs network bind |
| Copy API URL | Copies `http://127.0.0.1:<port>` for the extension |
| Start / Restart / Stop Backend | Control the local service |

Closing the app window hides it; the app keeps running in the tray. Quit fully from the tray menu when you want to stop everything.

**Settings (macOS app):**

- **Port** — default `8787`; must match the port in the Chrome extension.
- **Public bind** — off (recommended): only this Mac can connect. On: listens on all interfaces (`0.0.0.0`); use only on trusted networks.

After changing port or bind, use **Save & Restart** in Settings.

### 2. Install the Chrome extension

1. In Chrome, open `chrome://extensions`.
2. Turn on **Developer mode** (if you install from a local folder).
3. Click **Load unpacked** and select the `chrome-mv3` folder from your Extract Token package.
4. Pin the extension if you like; open the **side panel** (extension icon or Chrome side panel menu).

### 3. Connect extension ↔ backend

1. Open the **Extract Token** side panel.
2. Check the badge in the header:
   - **Connected** — extension is talking to the backend.
   - **Disconnected** — backend is off or host/port is wrong.
3. If disconnected:
   - Click **Settings** (gear) → set **Host** (`127.0.0.1`) and **Port** (same as the macOS app, usually `8787`) → **Save & Reconnect**.
   - Or click **Reconnect** (reload icon) after the macOS app shows **Running**.

The panel still opens when the backend is down; accounts and history sync once the connection is back.

## Using the side panel

The panel has four tabs. Data refreshes automatically every few seconds.

### Dashboard

Overview at a glance:

- Number of accounts (active / locked)
- Open Gemini tabs and **busy** accounts (currently processing a prompt)
- History message count
- Backend connection (`host:port`, connected or not)

Use this tab to see whether everything is healthy before sending chats.

### Accounts

Manage Gemini profiles:

1. Click **Add Account**.
2. In Chrome, open the Gemini tab for the account you want to add (logged in).
3. In the dialog, click **Detect From Active Gemini Tab** — fills **Page Root** and suggests a **Label** (name, email, tier).
4. Click **Create**.

Per account:

| Button | Action |
|--------|--------|
| Lock / Unlock | Disabled accounts are skipped for automation |
| Select | Chooses account for the Chat tab |
| Open Tab | Opens or focuses the Gemini tab for that account |
| Delete | Removes the account from storage |

Each account is tied to a Gemini URL (for example `https://gemini.google.com/u/0/app` or a custom page root).

### Chat

Send a test prompt through the extension (uses the selected account’s Gemini tab):

1. Choose an **account** in the dropdown.
2. Type your message in the text box.
3. Click **Send Prompt** — wait for **Latest response** below.
4. **Stop** — cancel generation while it is running.
5. **stream** — optional streaming mode (OpenAI-compatible SSE).
6. **Copy** — copy the latest response text.

The account must be **unlocked** and its tab should be open (use **Open Tab** on the Accounts tab if needed).

### History

Shows recent user/assistant messages stored while the backend was connected.

- **Clear History** — removes all stored history (cannot be undone from the panel).

## Typical workflow

1. Start the **macOS app** → backend **Running**.
2. Open Chrome → **side panel** shows **Connected**.
3. **Accounts** → add each Gemini profile (detect from the active tab).
4. **Open Tab** for the account you want to use.
5. **Chat** → select account → send prompts; check **History** for past turns.
6. **Dashboard** → monitor busy state when running several accounts.

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Disconnected** in the panel | Start or restart the backend in the macOS app; match host/port in extension Settings. |
| Warning about backend error | Read the message in the panel; open **Logs** in the macOS app. |
| Detect account fails | Active tab must be a Gemini page (`gemini.google.com`); refresh and try again. |
| Send prompt fails | Unlock account, open its tab, wait until Gemini UI is ready. |
| Port already in use | Change port in macOS **Settings**, save, then update the same port in the extension. |
| No history after chat | Backend must be **Connected** when sending; history is stored on the local service. |

## Disclaimer

This project is provided for learning, research, personal experimentation, and internal validation only. No commercial authorization is granted, and no warranty of stability, fitness, or results is provided. The author and repository maintainers are not responsible for any direct or indirect loss, account suspension, data loss, legal risk, or third-party claims arising from use, modification, distribution, deployment, or reliance on this project.

Do not use this project in ways that violate service terms, agreements, laws, or platform rules. Before any commercial use, review the [LICENSE](LICENSE), the relevant terms, and confirm that you have the author's written permission.

## License

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
