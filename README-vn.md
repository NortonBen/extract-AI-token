# extract-AI-token

> **English:** [README.md](README.md)

Extension Chrome và backend Rust để điều khiển nhiều tài khoản Gemini trên trình duyệt: tab theo account, trạng thái busy, lịch sử chat và đồng bộ qua HTTP / WebSocket. **Ứng dụng tray macOS** (tùy chọn) có thể khởi chạy và giám sát tiến trình backend.

## Cấu trúc dự án

| Thư mục | Mô tả |
|--------|--------|
| `extension/` | Extension Chrome (WXT + React): side panel, service worker nền, content script Gemini |
| `backend/` | API Rust (Axum): REST + WebSocket, lưu SQLite |
| `app/` | Ứng dụng tray Flutter macOS — bật/tắt binary backend, kiểm tra health cổng `8787` |
| `old/` | Mã tham khảo / lưu trữ (không bắt buộc để chạy) |

## Tính năng

- **Nhiều tài khoản Gemini** — mỗi account gắn URL dạng `https://gemini.google.com/u/{index}/app` hoặc `pageRoot` tùy chỉnh
- **Điều khiển tab** — mở/focus tab theo account; metadata tab lưu cục bộ trong extension
- **Tự động hóa content script** — nhận diện account, gửi prompt, đọc phản hồi trên trang Gemini
- **Đồng bộ backend** — background kết nối `ws://{host}:{port}/ws` (mặc định `127.0.0.1:8787`); account, history và busy lưu SQLite khi backend hoạt động
- **Giao diện side panel** — account, chat, history, dashboard, cấu hình kết nối backend
- **App tray macOS** — chạy nền binary `backend` (không hiện cửa sổ)

Model dữ liệu hỗ trợ provider `gemini` và `chatgpt`; tích hợp chính hiện tại là Gemini.

## Yêu cầu

| Thành phần | Yêu cầu |
|------------|---------|
| Extension | [Node.js](https://nodejs.org/) 20+, Google Chrome |
| Backend | [Rust](https://www.rust-lang.org/) stable (edition 2024) |
| App macOS (tùy chọn) | [Flutter](https://flutter.dev/) SDK, macOS |

## Chạy nhanh

### 1. Backend

**Cách A — chạy từ mã nguồn**

```bash
cd backend
cargo run
```

**Cách B — app tray macOS** (khởi chạy binary backend từ menu bar)

```bash
cd app
flutter run -d macos
```

Mặc định lắng nghe `127.0.0.1:8787`. Database SQLite: `backend/data/app.db` (hoặc đường dẫn do launcher đặt).

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `APP_ADDR` | `127.0.0.1:8787` | Địa chỉ bind |
| `SQLITE_PATH` | `data/app.db` | Đường dẫn SQLite (tương đối thư mục backend) |
| `RUST_LOG` | `info` | Mức log tracing |

Kiểm tra: `curl http://127.0.0.1:8787/health`

### 2. Extension

```bash
cd extension
npm install
npm run dev
```

Build production:

```bash
npm run build
```

Load extension unpacked từ `extension/dist/chrome-mv3` trong Chrome (`chrome://extensions` → Chế độ nhà phát triển → Tải tiện ích đã giải nén).

Mở **side panel**, cấu hình host/port backend nếu cần và reconnect. Panel vẫn dùng được khi backend tắt; đồng bộ khi kết nối lại.

Chi tiết extension: [extension/README.md](extension/README.md).

## API backend

### REST

| Method | Path | Mô tả |
|--------|------|--------|
| `GET` | `/health` | Health check |
| `GET` | `/ws` | Nâng cấp WebSocket |
| `GET` / `PUT` | `/v1/accounts` | Liệt kê / upsert account |
| `DELETE` | `/v1/accounts/{id}` | Xóa account |
| `GET` / `PUT` | `/v1/models` | Liệt kê / upsert model |
| `DELETE` | `/v1/models/{id}` | Xóa model |
| `GET` / `POST` / `DELETE` | `/v1/history` | Đọc / thêm / xóa history |
| `GET` / `POST` | `/v1/busy` | Đọc / ghi busy |
| `GET` | `/v1/dashboard` | Tóm tắt dashboard |

### Lệnh WebSocket

Envelope: `{ "id": "<uuid>", "type": "<command>", "payload": { ... } }`

| `type` | Mô tả |
|--------|--------|
| `ping` | Kiểm tra sống |
| `state.get` | Account, history (tối đa 200), busy |
| `dashboard.get` | Số liệu dashboard |
| `models.get` / `model.upsert` / `model.delete` | Quản lý model |
| `account.upsert` / `account.delete` | CRUD account |
| `history.append` / `history.clear` | Ghi history |
| `busy.get` / `busy.set` | Cờ busy |

## CI

GitHub Actions trên push/PR nhánh `main` và `master`:

- **backend** — `cargo fmt --check`, `clippy`, `test`, build release
- **extension** — `npm ci`, `npm run build`

Workflow: [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Tuyên bố miễn trừ trách nhiệm

Dự án được xây dựng thông qua reverse engineering, chỉ phục vụ học tập, nghiên cứu, thử nghiệm cá nhân và kiểm thử nội bộ. Không cấp quyền sử dụng thương mại; không bảo đảm về độ ổn định, tính phù hợp hay kết quả. Tác giả và người duy trì kho mã không chịu trách nhiệm về mọi thiệt hại trực tiếp hoặc gián tiếp, khóa tài khoản, mất dữ liệu, rủi ro pháp lý hoặc khiếu nại từ bên thứ ba phát sinh từ việc sử dụng, sửa đổi, phân phối, triển khai hoặc phụ thuộc vào dự án.

Không sử dụng dự án theo cách vi phạm điều khoản dịch vụ, thỏa thuận, pháp luật hoặc quy tắc nền tảng. Trước khi dùng cho mục đích thương mại, hãy đọc [LICENSE](LICENSE), các điều khoản liên quan và xác nhận có sự cho phép bằng văn bản của tác giả.

Bản tiếng Anh (tham chiếu pháp lý): [Disclaimer](README.md#disclaimer).

## Giấy phép

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
