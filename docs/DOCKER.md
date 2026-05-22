# Docker — Extract AI Token (backend API)

Image chạy **backend** (`extract-ai-token`): HTTP API + WebSocket trên cổng **9516**. Extension Chrome và tự động hóa Gemini vẫn chạy trên **máy host** (trình duyệt); container chỉ phục vụ API/SQLite.

## Yêu cầu

- Docker 20.10+ và Docker Compose v2 (hoặc plugin `compose`)

## Build image (local)

```bash
chmod +x scripts/docker-build.sh
./scripts/docker-build.sh
```

Tùy chọn:

```bash
IMAGE=ghcr.io/you/extract-ai-token:v1.0.0 ./scripts/docker-build.sh
PLATFORM=linux/amd64 ./scripts/docker-build.sh
```

Hoặc trực tiếp:

```bash
docker build -t extract-ai-token:latest .
```

## Chạy với Docker Compose (khuyến nghị)

```bash
docker compose up -d
docker compose logs -f
```

- API: `http://127.0.0.1:9516`
- Health: `curl http://127.0.0.1:9516/health`
- Dữ liệu SQLite: volume `extract-ai-token-data` → `/data/app.db` trong container

Đổi cổng host:

```bash
EXTRACT_TOKEN_PORT=19516 docker compose up -d
```

Dừng / xóa:

```bash
docker compose down
docker compose down -v   # xóa cả volume DB
```

## Chạy với `docker run`

```bash
docker run -d \
  --name extract-ai-token \
  -p 9516:9516 \
  -e APP_ADDR=0.0.0.0:9516 \
  -e SQLITE_PATH=/data/app.db \
  -v extract-ai-token-data:/data \
  --restart unless-stopped \
  extract-ai-token:latest
```

## Biến môi trường

| Biến | Mặc định (image) | Ý nghĩa |
|------|------------------|---------|
| `APP_ADDR` | `0.0.0.0:9516` | Bind trong container (phải `0.0.0.0` để map port) |
| `SQLITE_PATH` | `/data/app.db` | Đường dẫn DB (nên gắn volume `/data`) |
| `RUST_LOG` | `info` | Mức log |
| `NO_COLOR` | `1` | Tắt ANSI trong log |

## Cấu hình extension Chrome

1. Chạy container và map `9516:9516`.
2. Trong extension → Settings backend: **Host** `127.0.0.1`, **Port** `9516` (hoặc cổng host bạn map).
3. Mở tab Gemini trên **cùng máy** với Docker; extension gửi lệnh qua API local.

> **Lưu ý:** Không chạy đồng thời backend trong Docker **và** app desktop/CLI trên cùng cổng `9516` trên host.

## Image từ GitHub Container Registry

Khi push tag `v*.*.*`, workflow [`.github/workflows/docker.yml`](../.github/workflows/docker.yml) đẩy image:

`ghcr.io/<owner>/<repo>:<version>`

Ví dụ:

```bash
docker pull ghcr.io/<owner>/extract-ai-token:1.0.0
docker run -d -p 9516:9516 -v extract-ai-token-data:/data ghcr.io/<owner>/extract-ai-token:1.0.0
```

## Giới hạn

- Không có GUI/tray trong image — chỉ backend.
- Automation Gemini cần extension + Chrome trên host; Docker không thay trình duyệt.
