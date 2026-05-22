# Release v0.0.3

**Tag:** `v0.0.3`  
**Date:** 2026-05-22

## Tóm tắt (Tiếng Việt)

Bản **0.0.3** tập trung vào **automation Gemini ổn định hơn**: extension **giữ tab** giữa các prompt, mở **cuộc trò chuyện mới** qua sidebar (không reload cả trang), và desktop cải thiện **tắt backend** khi thoát app.

### Điểm nổi bật

| Thành phần | Thay đổi |
|------------|----------|
| **Extension** | Tái sử dụng tab sau mỗi chat; `prepare` click `Cuộc trò chuyện mới` (`aria-label`, `href="/app"`). |
| **Extension** | Vẫn `recreateAccountTab` khi tab kẹt / timeout / channel đóng. |
| **Desktop** | Shutdown backend sạch hơn; binary nhúng qua `backend_binary.dart`. |
| **CI** | Tag `v0.0.3` → extension zip, backend đa nền, app macOS/Windows/Linux, Docker GHCR. |

### Cài nhanh

1. Tải asset từ [GitHub Releases](https://github.com/NortonBen/extract-AI-token/releases/tag/v0.0.3).
2. **Desktop (khuyến nghị):** DMG/zip macOS → mở app → backend cổng `9516`.
3. **Extension:** giải nén `ai-browser-extension-0.0.3-chrome.zip` (hoặc tên tương tự từ CI) → `chrome://extensions` → Load unpacked (hoặc cập nhật bản đã load).
4. **Chỉ backend:** zip/tar.gz `extract-ai-token-backend-*` hoặc Docker bên dưới.

### Docker

```bash
docker pull ghcr.io/nortonben/extract-ai-token:0.0.3
docker compose up -d
```

Chi tiết: [DOCKER.md](DOCKER.md).

### Nâng cấp từ 0.0.2

- Reload extension sau khi cài bản zip mới (hoặc build local `npm run build` trong `extension/`).
- Không cần đổi cấu hình backend nếu vẫn dùng `127.0.0.1:9516`.
- Tab Gemini có thể **ở lại** trong nhóm **Extract Token** giữa các lần gửi prompt — hành vi mới so với 0.0.2 (trước đây đóng tab sau mỗi chat).

---

## English summary

**Extension:** Reuse Gemini tabs between automated prompts; after each successful chat, reset via in-page **New chat** navigation instead of closing the tab or full page reload. **Desktop:** Cleaner backend shutdown on quit; embedded binary wiring. See [CHANGELOG.md](../CHANGELOG.md).
