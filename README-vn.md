# Extract Token

> **English:** [README.md](README.md)

**Extract Token** giúp bạn làm việc với nhiều tài khoản Gemini trên Chrome từ một chỗ: quản lý account, mở đúng tab cho từng account, gửi prompt và lưu lịch sử chat — kèm **ứng dụng desktop** chạy dịch vụ dữ liệu cục bộ trên máy bạn.

## Khả năng tin nhắn & API

| Khả năng | Trạng thái | Ghi chú |
|----------|:----------:|---------|
| Prompt **text** (side panel, API) | ✅ | Ô chat chỉ nhập chữ; API dùng `messages[].content` dạng chuỗi hoặc multipart chỉ có `type: "text"` |
| **Tools** / function calling | ✅ | Tương thích OpenAI: `tools`, `tool_calls`, vòng lặp `tool` nhiều lượt — xem [Ví dụ 5](#ví-dụ-5--chat-từ-script-tương-thích-openai) |
| **File** (đính kèm, upload) | ❌ | Chưa hỗ trợ |
| **Ảnh** (vision / đa phương thức) | ❌ | Chưa hỗ trợ — phần `image_url` và các phần không phải text trong `content` bị bỏ qua |

## Hỗ trợ nền tảng

### Hệ điều hành

| Thành phần | macOS | Windows | Linux |
|------------|:-----:|:-------:|:-----:|
| **Extension Chrome** (side panel) | ✅ | ✅ | ✅ |
| **Ứng dụng desktop** (tray + khởi chạy backend) | ✅ | ✅ | ✅ |
| **Backend cục bộ** (SQLite, API, WebSocket) | ✅ | ✅ | ✅ |

Backend chỉ lắng nghe trên máy bạn (mặc định `127.0.0.1:9516`). Account và history lưu cục bộ trong SQLite, do app desktop quản lý trên từng hệ điều hành.

### Trình duyệt (extension)

Dùng trên trình duyệt **Chromium** hỗ trợ **Manifest V3** và **Side Panel** (cùng gói extension: `chrome-mv3`).

| Trình duyệt | Hỗ trợ | Ghi chú |
|-------------|:------:|---------|
| Google Chrome | ✅ | Khuyến nghị; Chrome 114+ cho side panel |
| Microsoft Edge | ✅ | Tải extension unpacked |
| Brave, Arc, Chromium, … | ✅ | Nếu có MV3 + side panel |
| Firefox | ❌ | Định dạng extension khác (chưa có) |
| Safari | ❌ | Không hỗ trợ |

### Dịch vụ AI / web

| Dịch vụ | Hỗ trợ | Ghi chú |
|---------|:------:|---------|
| **Google Gemini** | ✅ | Chính; extension chạy trên `gemini.google.com` |
| **ChatGPT** | — | Có trong kiểu account; chưa tự động hóa web |

### Ghi chú theo hệ điều hành (app desktop)

| HĐH | Tray | Binary backend (đóng gói / build) |
|-----|------|-------------------------------------|
| **macOS** | Icon menu bar | `macos-backend` / `Resources/backend` |
| **Windows** | Khay thông báo (notification area) | `windows-backend.exe` cạnh app |
| **Linux** | System tray (tùy môi trường desktop) | `linux-backend` cạnh app |

Trên **Linux**, **Copy API URL** từ tray có thể cần cài `wl-copy`, `xclip` hoặc `xsel` nếu sao chép clipboard thất bại.

### Chưa hỗ trợ

- **File** và **ảnh** trong chat hoặc API (hiện chỉ text và tools)
- Di động (iOS / Android)
- Cài extension trên Firefox / Safari
- Chỉ dùng extension mà **không** có backend cục bộ trên cùng máy (cấu hình mặc định)

## Bạn cần chuẩn bị

| Hạng mục | Ghi chú |
|----------|---------|
| **Trình duyệt Chromium** | Chrome, Edge hoặc tương thích — cho extension |
| **Hệ điều hành desktop** | macOS, Windows hoặc Linux — cho app tray chạy backend |
| **Tài khoản Gemini** | Đã đăng nhập tại [gemini.google.com](https://gemini.google.com) |

## Chạy `extract-ai-token` (CLI) và ứng dụng desktop

Có hai cách chạy API cục bộ: **app desktop** (tray + giao diện, tự bật backend) hoặc **CLI `extract-ai-token`** (chỉ backend). Cùng cổng và API mặc định `127.0.0.1:9516`.

### Tải về (GitHub Releases)

Trên bản release có tag `v*.*.*`, chọn file đúng hệ điều hành:

| File | Nội dung |
|------|----------|
| `extract-ai-token-backend-macos.zip` | CLI `extract-ai-token` (macOS, universal) |
| `extract-ai-token-backend-windows.zip` | CLI `extract-ai-token.exe` |
| `extract-ai-token-backend-linux.tar.gz` | CLI `extract-ai-token` |
| `extract-ai-token-v*-macos.dmg` | Bộ cài macOS (kéo app vào Applications) |
| `extract-ai-token-v*-macos.zip` | `.app` dạng zip (tùy chọn) |
| `extract-ai-token-windows.zip` | Thư mục app Windows + `backend.exe` |
| `extract-ai-token-linux.tar.gz` | Thư mục `bundle/` Linux + `backend` |

Gói extension Chrome đăng riêng (`extension-chrome`).

### A. Ứng dụng desktop (khuyến nghị)

**macOS**

1. Tải **`extract-ai-token-v*-macos.dmg`** từ release (đã ký + notarize nếu đã cấu hình [secret release](docs/MACOS_SIGNING.md)).
2. Mở DMG → kéo **Extract AI Token** vào **Applications**.
3. Mở app từ Applications (hoặc Spotlight). Backend tự chạy; tìm icon **menu bar**.
4. Tray → **Open Dashboard** → trạng thái **Running**.

Hoặc dùng file `.zip`: giải nén rồi mở **Extract AI Token.app**.

Nếu macOS báo *“Apple could not verify…”* (bản build chưa ký):

- **Chuột phải** vào app → **Open** → **Open** một lần, hoặc:

  ```bash
  xattr -cr "/Applications/Extract AI Token.app"
  ```

Người phát hành: xem [docs/MACOS_SIGNING.md](docs/MACOS_SIGNING.md) để bật **chữ ký Developer ID + notarize** khi push tag.

**Windows**

1. Giải nén `extract-ai-token-windows.zip`.
2. Chạy **`app.exe`** trong thư mục `Release` (cùng thư mục có `backend.exe`).
3. Dùng icon **system tray** → Dashboard / Settings.

**Linux**

1. Giải nén `extract-ai-token-linux.tar.gz`.
2. Trong thư mục `bundle`:

   ```bash
   chmod +x app backend
   ./app
   ```

3. Menu **tray**; một số desktop cần panel hỗ trợ AppIndicator.

**Chạy từ mã nguồn** (cần Flutter SDK):

```bash
# 1) Build backend vào build/ (tên file phải khớp app)
cd backend && cargo build --release
cd ..
mkdir -p build
cp backend/target/release/backend build/macos-backend          # macOS
# cp backend/target/release/backend.exe build/windows-backend.exe  # Windows
# cp backend/target/release/backend build/linux-backend            # Linux

# 2) Chạy app Flutter
cd app
flutter pub get
flutter run -d macos      # hoặc: windows, linux
```

Build release:

```bash
cd app && flutter build macos --release    # macos | windows | linux
```

Sau đó copy binary backend cạnh file app đã build (xem [`.github/workflows/release.yml`](.github/workflows/release.yml)).

---

### B. Chỉ CLI — `extract-ai-token`

Tiến trình backend độc lập (không có tray). Dùng khi chỉ cần HTTP/WebSocket hoặc khởi chạy bằng script.

**macOS / Linux**

```bash
unzip extract-ai-token-backend-macos.zip   # hoặc giải nén .tar.gz trên Linux
chmod +x extract-ai-token
./extract-ai-token
```

**Windows (PowerShell)**

```powershell
Expand-Archive extract-ai-token-backend-windows.zip -DestinationPath .
.\extract-ai-token.exe
```

**Biến môi trường**

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `APP_ADDR` | `127.0.0.1:9516` | Địa chỉ lắng nghe (`host:port`) |
| `SQLITE_PATH` | `data/app.db` | File SQLite (tạo theo thư mục làm việc) |
| `RUST_LOG` | `info` | Mức log (`debug`, `info`, …) |

**Ví dụ**

```bash
# Cổng và DB mặc định trong ./data/app.db
./extract-ai-token

# Đổi cổng
APP_ADDR=127.0.0.1:9516 ./extract-ai-token

# Đổi đường dẫn database
SQLITE_PATH="$HOME/.extract-ai-token/app.db" ./extract-ai-token
```

Kiểm tra:

```bash
curl http://127.0.0.1:9516/health
```

Dừng bằng `Ctrl+C` trong terminal.

**Bắt app desktop dùng binary CLI tùy chỉnh** (tùy chọn):

```bash
export AI_BROWSER_BACKEND_BIN=/đường/dẫn/tuyệt/đối/tới/extract-ai-token
open app.app   # macOS — app sẽ spawn binary này thay vì bản đóng gói sẵn
```

**Build CLI từ mã nguồn**

```bash
cd backend
cargo build --release
# Binary: backend/target/release/backend (có thể đổi tên thành extract-ai-token)
./target/release/backend
```

Binary universal macOS (tùy chọn, giống CI):

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cd backend
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-apple-darwin
lipo -create \
  target/aarch64-apple-darwin/release/backend \
  target/x86_64-apple-darwin/release/backend \
  -output ../build/extract-ai-token
chmod +x ../build/extract-ai-token
```

> **Lưu ý:** Mỗi cổng chỉ nên có **một** backend — CLI **hoặc** process do app quản lý, không chạy trùng cùng port.

## Bắt đầu sử dụng

### 1. Bật backend (app desktop hoặc CLI)

**Dùng app desktop:** mở app theo hướng dẫn [A. Ứng dụng desktop](#a-ứng-dụng-desktop-khuyến-nghị) ở trên; xác nhận **Running** trên tray/Dashboard.

**Chỉ dùng CLI:** chạy `./extract-ai-token` (xem [B. Chỉ CLI](#b-chỉ-cli--extract-ai-token)); cấu hình extension Chrome cùng host/port.

**Menu tray:**

| Thao tác | Ý nghĩa |
|----------|---------|
| Open Dashboard | Trạng thái, URL API, số account/history |
| Open Logs | Nhật ký backend |
| Open Settings | Đổi cổng, bind local hoặc mạng |
| Copy API URL | Sao chép `http://127.0.0.1:<port>` cho extension |
| Start / Restart / Stop Backend | Điều khiển dịch vụ cục bộ |

Đóng cửa sổ app chỉ ẩn giao diện; app vẫn chạy nền qua tray. Thoát hẳn từ menu tray khi muốn dừng mọi thứ.

**Settings (app desktop):**

- **Port** — mặc định `9516`; phải trùng cổng trong extension Chrome.
- **Public bind** — tắt (khuyến nghị): chỉ localhost (`127.0.0.1`). Bật: lắng nghe mọi interface (`0.0.0.0`); chỉ dùng trên mạng tin cậy.

Sau khi đổi port hoặc bind, bấm **Save & Restart** trong Settings.

### 2. Cài extension Chrome

1. Mở `chrome://extensions` trong Chrome.
2. Bật **Chế độ nhà phát triển** (nếu cài từ thư mục local).
3. **Tải tiện ích đã giải nén** → chọn thư mục `chrome-mv3` trong gói Extract Token.
4. Ghim extension nếu muốn; mở **side panel** (icon extension hoặc menu side panel của Chrome).

### 3. Kết nối extension ↔ backend

1. Mở **side panel** Extract Token.
2. Xem nhãn trên header:
   - **Connected** — extension đang nói chuyện với backend.
   - **Disconnected** — backend tắt hoặc host/port sai.
3. Nếu disconnected:
   - **Settings** (bánh răng) → **Host** (`127.0.0.1`) và **Port** (trùng app desktop, thường `9516`) → **Save & Reconnect**.
   - Hoặc bấm **Reconnect** (icon reload) sau khi app desktop báo **Running**.

Panel vẫn mở được khi backend tắt; account và history đồng bộ lại khi kết nối được.

## Dùng side panel

Panel có bốn tab. Dữ liệu tự làm mới vài giây một lần.

### Dashboard

Tổng quan nhanh:

- Số account (đang bật / đã khóa)
- Tab Gemini đang mở và account **busy** (đang xử lý prompt)
- Số tin nhắn history
- Kết nối backend (`host:port`, connected hay không)

Dùng tab này để kiểm tra hệ thống ổn trước khi chat.

### Accounts

Quản lý profile Gemini:

1. Bấm **Add Account**.
2. Trong Chrome, mở tab Gemini của account cần thêm (đã đăng nhập).
3. Trong hộp thoại, bấm **Detect From Active Gemini Tab** — điền **Page Root** và gợi ý **Label** (tên, email, tier).
4. Bấm **Create**.

Theo từng account:

| Nút | Tác dụng |
|-----|----------|
| Lock / Unlock | Account bị khóa sẽ không dùng cho tự động hóa |
| Select | Chọn account cho tab Chat |
| Open Tab | Mở hoặc focus tab Gemini của account |
| Delete | Xóa account khỏi bộ nhớ |

Mỗi account gắn một URL Gemini (ví dụ `https://gemini.google.com/u/0/app` hoặc page root tùy chỉnh).

### Chat

Gửi prompt **chỉ text** thử qua extension (dùng tab Gemini của account đã chọn). Chưa hỗ trợ đính kèm file hoặc ảnh.

1. Chọn **account** trong dropdown.
2. Nhập nội dung vào ô text.
3. **Send Prompt** — đợi **Latest response** bên dưới.
4. **Stop** — hủy khi đang generate.
5. **stream** — bật chế độ stream (SSE tương thích OpenAI).
6. **Copy** — sao chép nội dung phản hồi mới nhất.

Account phải **mở khóa** và tab tương ứng nên mở sẵn (dùng **Open Tab** ở tab Accounts nếu cần).

### History

Hiển thị các tin user/assistant gần đây đã lưu khi backend kết nối (tối đa **50** tin mới nhất; tin cũ hơn tự xóa).

- **Clear History** — xóa toàn bộ history (không hoàn tác từ panel).

## Quy trình thường dùng

1. Mở **app desktop** → backend **Running**.
2. Mở Chrome → side panel **Connected**.
3. **Accounts** → thêm từng profile Gemini (detect từ tab đang mở).
4. **Open Tab** cho account cần dùng.
5. **Chat** → chọn account → gửi prompt; xem **History** cho các lượt trước.
6. **Dashboard** → theo dõi busy khi chạy nhiều account.

## Ví dụ

### Ví dụ 1 — Lần đầu dùng (một tài khoản Gemini)

| Bước | Thao tác |
|------|----------|
| 1 | Mở **Extract AI Token** (app desktop) → tray báo **● Running (port 9516)** |
| 2 | Trong Chrome, mở [gemini.google.com](https://gemini.google.com) và đăng nhập |
| 3 | Mở side panel **Extract Token** → nhãn **Connected** |
| 4 | **Accounts** → **Add Account** → **Detect From Active Gemini Tab** → **Create** |
| 5 | **Open Tab** — extension mở/focus tab Gemini của account |
| 6 | **Chat** → chọn account → nhập prompt → **Send Prompt** |

### Ví dụ 2 — Công việc và cá nhân (hai profile Google)

Mỗi URL Gemini đã đăng nhập tương ứng một account:

| Nhãn account | URL Gemini (ví dụ) | Cách thêm |
|--------------|-------------------|-----------|
| Công việc | `https://gemini.google.com/u/0/app` | Mở URL → Add Account → Detect |
| Cá nhân | `https://gemini.google.com/u/1/app` | Đổi tài khoản Google → mở `/u/1/app` → Detect lại |

Trong **Chat**, chọn **Công việc** hoặc **Cá nhân** trước khi gửi. **Dashboard** cho biết account nào đang mở tab.

### Ví dụ 3 — Kiểm tra backend đang chạy

```bash
curl http://127.0.0.1:9516/health
```

Kỳ vọng: HTTP `200` khi app desktop báo **Running**.

Xem danh sách account (sau khi đã thêm trong extension):

```bash
curl http://127.0.0.1:9516/v1/accounts
```

### Ví dụ 4 — Chat từ side panel

1. **Accounts** → **Open Tab** cho account **Công việc**.
2. **Chat** → chọn **Công việc** → prompt:

   `Liệt kê 3 ưu và 3 nhược điểm của làm việc từ xa dạng bullet.`

3. **Send Prompt** → đọc **Latest response** → **Copy** nếu cần.
4. Bật **stream** để xem phản hồi từng phần (SSE).
5. **History** — các lượt user/assistant sau khi gửi thành công.

### Ví dụ 5 — Chat từ script (tương thích OpenAI)

URL backend: `http://127.0.0.1:9516` (đổi port nếu bạn đã chỉnh trong Settings).

**curl (một lần trả lời):**

```bash
curl -s http://127.0.0.1:9516/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-flash",
    "stream": false,
    "messages": [{ "role": "user", "content": "Bây giờ là mấy giờ UTC?" }]
  }'
```

Tùy chọn: ghim account cụ thể (ID từ `GET /v1/accounts` hoặc tab Accounts):

```json
"account_id": "gemini-0"
```

**Node.js (script có sẵn trong repo):**

```bash
cd examples/nodejs
node accounts.mjs
node chat.mjs "mấy giờ rồi?"
node chat-stream.mjs "haiku về cà phê"

npm install
node openai-sdk.mjs "chào bạn"
STREAM=1 node openai-sdk.mjs "stream 1 fact"
node tools.mjs
```

API hỗ trợ **text** và **tools** / **tool_calls** (function calling kiểu OpenAI): gửi `tools[]` trong body, nhận `finish_reason: "tool_calls"` khi model trả JSON gọi tool. **File** và **ảnh** chưa hỗ trợ.

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `BASE_URL` | `http://127.0.0.1:9516` | URL backend |
| `MODEL` | `gemini-flash` | Tên model gửi lên API |
| `ACCOUNT_ID` | account enabled đầu tiên | Account Gemini dùng cho request |
| `STREAM` | `0` | Đặt `1` để stream trong `openai-sdk.mjs` |

Chi tiết request/response: [`examples/nodejs/README.md`](examples/nodejs/README.md).

**Python (SDK OpenAI):**

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:9516/v1",
    api_key="not-used",  # backend bỏ qua auth; SDK vẫn cần chuỗi placeholder
)

reply = client.chat.completions.create(
    model="gemini-flash",
    messages=[{"role": "user", "content": "Chào bằng tiếng Việt"}],
)
print(reply.choices[0].message.content)
```

Điều kiện cho ví dụ API: app desktop **Running**, có ít nhất một account **đang bật** trong extension, và tab Gemini tương ứng **đang mở** khi gửi chat.

## Xử lý sự cố

| Vấn đề | Cách xử lý |
|--------|------------|
| Panel báo **Disconnected** | Start/restart backend trong app desktop; khớp host/port trong Settings extension. |
| Cảnh báo lỗi backend | Đọc thông báo trên panel; mở **Logs** trong app desktop. |
| Detect account thất bại | Tab đang active phải là trang Gemini; refresh và thử lại. |
| Gửi prompt lỗi | Mở khóa account, mở tab, đợi giao diện Gemini sẵn sàng. |
| Port đã được dùng | Đổi port trong **Settings** app desktop, lưu, cập nhật cùng port trên extension. |
| Không thấy tray trên Linux | Kiểm tra system tray của môi trường desktop; khởi động lại app. |
| Extension không cài được | Dùng Chromium có MV3; cần hỗ trợ side panel (Chrome 114+). |
| Không có history sau chat | Backend phải **Connected** khi gửi; history lưu trên dịch vụ cục bộ. |
| macOS “could not verify” / cảnh báo malware | Dùng DMG release **đã notarize**, hoặc chuột phải → **Open** / `xattr -cr` (xem [MACOS_SIGNING.md](docs/MACOS_SIGNING.md)). |

## Tuyên bố miễn trừ trách nhiệm

Dự án chỉ phục vụ học tập, nghiên cứu, thử nghiệm cá nhân và kiểm thử nội bộ. Không cấp quyền sử dụng thương mại; không bảo đảm về độ ổn định, tính phù hợp hay kết quả. Tác giả và người duy trì kho mã không chịu trách nhiệm về mọi thiệt hại trực tiếp hoặc gián tiếp, khóa tài khoản, mất dữ liệu, rủi ro pháp lý hoặc khiếu nại từ bên thứ ba phát sinh từ việc sử dụng, sửa đổi, phân phối, triển khai hoặc phụ thuộc vào dự án.

Không sử dụng dự án theo cách vi phạm điều khoản dịch vụ, thỏa thuận, pháp luật hoặc quy tắc nền tảng. Trước khi dùng cho mục đích thương mại, hãy đọc [LICENSE](LICENSE), các điều khoản liên quan và xác nhận có sự cho phép bằng văn bản của tác giả.

## Giấy phép

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
