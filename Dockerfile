# syntax=docker/dockerfile:1

# ── Build backend (extract-ai-token CLI) ─────────────────────────────────────
FROM rust:1-bookworm AS builder

WORKDIR /app/backend
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src

RUN cargo build --release && cp target/release/backend /extract-ai-token

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /extract-ai-token /usr/local/bin/extract-ai-token

ENV APP_ADDR=0.0.0.0:9516 \
    SQLITE_PATH=/data/app.db \
    RUST_LOG=info \
    NO_COLOR=1

RUN mkdir -p /data && chown -R 65534:65534 /data

VOLUME ["/data"]
EXPOSE 9516

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:9516/health || exit 1

USER nobody
WORKDIR /data

ENTRYPOINT ["/usr/local/bin/extract-ai-token"]
