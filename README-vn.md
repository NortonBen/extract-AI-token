# Extract Token

> **English:** [README.md](README.md)

**Extract Token** giúp bạn làm việc với nhiều tài khoản Gemini trên Chrome từ một chỗ: quản lý account, mở đúng tab cho từng account, gửi prompt và lưu lịch sử chat — kèm **ứng dụng macOS** chạy dịch vụ dữ liệu cục bộ trên máy bạn.

## Bạn cần chuẩn bị

| Hạng mục | Ghi chú |
|----------|---------|
| **Google Chrome** | Cài extension Extract Token |
| **macOS** | Ứng dụng desktop chạy backend cục bộ (khuyến nghị) |
| **Tài khoản Gemini** | Đã đăng nhập trên [gemini.google.com](https://gemini.google.com) trong Chrome |

Backend chỉ lắng nghe trên máy bạn (mặc định `127.0.0.1:8787`). Dữ liệu account và history lưu cục bộ trong SQLite do ứng dụng macOS quản lý.

## Bắt đầu sử dụng

### 1. Bật backend (ứng dụng macOS)

1. Mở **Extract AI Token** trên Mac (từ gói cài đặt bạn nhận được).
2. Ứng dụng tự khởi động backend và hiện biểu tượng trên **thanh menu** (menu bar).
3. Xác nhận trạng thái **Running**:
   - Bấm icon menu bar → **Open Dashboard**, hoặc
   - Menu tray hiển thị **● Running (port 8787)** (cổng có thể khác nếu bạn đổi trong Settings).

**Menu tray (icon menu bar):**

| Thao tác | Ý nghĩa |
|----------|---------|
| Open Dashboard | Trạng thái, URL API, số account/history |
| Open Logs | Nhật ký backend |
| Open Settings | Đổi cổng, bind local hoặc mạng |
| Copy API URL | Sao chép `http://127.0.0.1:<port>` cho extension |
| Start / Restart / Stop Backend | Điều khiển dịch vụ cục bộ |

Đóng cửa sổ app chỉ ẩn giao diện; app vẫn chạy nền qua tray. Thoát hẳn từ menu tray khi muốn dừng mọi thứ.

**Settings (app macOS):**

- **Port** — mặc định `8787`; phải trùng cổng trong extension Chrome.
- **Public bind** — tắt (khuyến nghị): chỉ máy này kết nối được. Bật: lắng nghe mọi interface (`0.0.0.0`); chỉ dùng trên mạng tin cậy.

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
   - **Settings** (bánh răng) → **Host** (`127.0.0.1`) và **Port** (trùng app macOS, thường `8787`) → **Save & Reconnect**.
   - Hoặc bấm **Reconnect** (icon reload) sau khi app macOS báo **Running**.

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

Gửi prompt thử qua extension (dùng tab Gemini của account đã chọn):

1. Chọn **account** trong dropdown.
2. Nhập nội dung vào ô text.
3. **Send Prompt** — đợi **Latest response** bên dưới.
4. **Stop** — hủy khi đang generate.
5. **stream** — bật chế độ stream (SSE tương thích OpenAI).
6. **Copy** — sao chép nội dung phản hồi mới nhất.

Account phải **mở khóa** và tab tương ứng nên mở sẵn (dùng **Open Tab** ở tab Accounts nếu cần).

### History

Hiển thị các tin user/assistant gần đây đã lưu khi backend kết nối.

- **Clear History** — xóa toàn bộ history (không hoàn tác từ panel).

## Quy trình thường dùng

1. Mở **app macOS** → backend **Running**.
2. Mở Chrome → side panel **Connected**.
3. **Accounts** → thêm từng profile Gemini (detect từ tab đang mở).
4. **Open Tab** cho account cần dùng.
5. **Chat** → chọn account → gửi prompt; xem **History** cho các lượt trước.
6. **Dashboard** → theo dõi busy khi chạy nhiều account.

## Xử lý sự cố

| Vấn đề | Cách xử lý |
|--------|------------|
| Panel báo **Disconnected** | Start/restart backend trong app macOS; khớp host/port trong Settings extension. |
| Cảnh báo lỗi backend | Đọc thông báo trên panel; mở **Logs** trong app macOS. |
| Detect account thất bại | Tab đang active phải là trang Gemini; refresh và thử lại. |
| Gửi prompt lỗi | Mở khóa account, mở tab, đợi giao diện Gemini sẵn sàng. |
| Port đã được dùng | Đổi port trong **Settings** macOS, lưu, cập nhật cùng port trên extension. |
| Không có history sau chat | Backend phải **Connected** khi gửi; history lưu trên dịch vụ cục bộ. |

## Tuyên bố miễn trừ trách nhiệm

Dự án chỉ phục vụ học tập, nghiên cứu, thử nghiệm cá nhân và kiểm thử nội bộ. Không cấp quyền sử dụng thương mại; không bảo đảm về độ ổn định, tính phù hợp hay kết quả. Tác giả và người duy trì kho mã không chịu trách nhiệm về mọi thiệt hại trực tiếp hoặc gián tiếp, khóa tài khoản, mất dữ liệu, rủi ro pháp lý hoặc khiếu nại từ bên thứ ba phát sinh từ việc sử dụng, sửa đổi, phân phối, triển khai hoặc phụ thuộc vào dự án.

Không sử dụng dự án theo cách vi phạm điều khoản dịch vụ, thỏa thuận, pháp luật hoặc quy tắc nền tảng. Trước khi dùng cho mục đích thương mại, hãy đọc [LICENSE](LICENSE), các điều khoản liên quan và xác nhận có sự cho phép bằng văn bản của tác giả.

## Giấy phép

[MIT](LICENSE) — Copyright (c) 2026 NortonBen.
