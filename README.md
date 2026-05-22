# extract-AI-token

Chrome extension và backend Rust để điều khiển nhiều tài khoản Gemini trên trình duyệt: mở tab theo account, theo dõi trạng thái busy, lưu lịch sử chat và đồng bộ qua API/WebSocket.

## Cấu trúc dự án

| Thư mục | Mô tả |
|--------|--------|
| `extension/` | Extension Chrome (WXT + React), side panel và content script trên Gemini |
| `backend/` | API HTTP + WebSocket (Axum), lưu SQLite |

## Yêu cầu

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/) stable (edition 2024)
- Google Chrome (để load extension unpacked)

## Chạy nhanh

### Backend

```bash
cd backend
cargo run
```

Mặc định lắng nghe `127.0.0.1:8787`, database tại `data/app.db`.

Biến môi trường (tùy chọn):

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `APP_ADDR` | `127.0.0.1:8787` | Địa chỉ bind |
| `SQLITE_PATH` | `data/app.db` | Đường dẫn SQLite |
| `RUST_LOG` | `info` | Mức log tracing |

### Extension

```bash
cd extension
npm install
npm run dev
```

Build production:

```bash
npm run build
```

Load extension unpacked từ `extension/dist/chrome-mv3` trong Chrome.

Chi tiết extension: xem [extension/README.md](extension/README.md).

## API backend (tóm tắt)

- `GET /health` — health check
- `GET /ws` — WebSocket (lệnh `ping`, `state.get`, `account.upsert`, …)
- `GET/PUT /v1/accounts`, `DELETE /v1/accounts/{id}`
- `GET/PUT /v1/models`, `DELETE /v1/models/{id}`
- `GET/POST/DELETE /v1/history`
- `GET/POST /v1/busy`
- `GET /v1/dashboard`

## CI

GitHub Actions chạy trên mỗi push/PR lên `main` và `master`:

- **backend**: `cargo fmt --check`, `cargo clippy`, `cargo test`, `cargo build --release`
- **extension**: `npm ci`, `npm run build`

Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Disclaimer

This project is built through reverse engineering and is provided for learning, research, personal experimentation, and internal validation only. No commercial authorization is granted, and no warranty of stability, fitness, or results is provided. The author and repository maintainers are not responsible for any direct or indirect loss, account suspension, data loss, legal risk, or third-party claims arising from use, modification, distribution, deployment, or reliance on this project.

Do not use this project in ways that violate service terms, agreements, laws, or platform rules. Before any commercial use, review the LICENSE, the relevant terms, and confirm that you have the author's written permission.

## Giấy phép

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
