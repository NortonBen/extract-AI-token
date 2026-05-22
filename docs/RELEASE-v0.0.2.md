# Release v0.0.2

**Tag:** `v0.0.2`  
**Date:** 2026-05-22

## Tóm tắt (Tiếng Việt)

Bản **0.0.2** bổ sung **stream Gemini thật**, **tools trong stream**, thống kê token/usage, **Docker**, cải thiện extension/desktop và sửa nhiều lỗi stream/log/tray trên macOS.

### Cài nhanh

1. Tải asset từ [GitHub Releases](https://github.com/NortonBen/extract-AI-token/releases/tag/v0.0.2).
2. **Desktop (khuyến nghị):** DMG/zip macOS → mở app → backend chạy cổng `9516`.
3. **Extension:** giải nén `*-chrome.zip` → `chrome://extensions` → Load unpacked.
4. **Docker:** `docker compose up -d` → extension trỏ `127.0.0.1:9516`.

### Docker

```bash
docker pull ghcr.io/nortonben/extract-ai-token:0.0.2
docker compose up -d
```

Chi tiết: [DOCKER.md](DOCKER.md).

---

## English summary

See [CHANGELOG.md](../CHANGELOG.md) for the full list.

**Highlights:** live Gemini SSE, tool calls in streams, usage counters, Docker image, README screenshots, desktop tray fixes, extension dashboard UX.
