mod http;
mod models;
mod sanitize;
mod state;
mod stream_bridge;
mod tab_debug;
mod tokens;
mod tools;

use std::env;
use std::net::SocketAddr;

use anyhow::Context;
use state::AppState;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::info;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let use_ansi = std::env::var_os("NO_COLOR").is_none()
        && std::io::IsTerminal::is_terminal(&std::io::stderr());
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tab_debug=info")),
        )
        .with_ansi(use_ansi)
        .init();

    let addr = env::var("APP_ADDR").unwrap_or_else(|_| "127.0.0.1:9516".to_string());
    let db_path = env::var("SQLITE_PATH").unwrap_or_else(|_| "data/app.db".to_string());

    let state = AppState::init(&db_path).with_context(|| "initialize app state")?;
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    let app = http::router(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let socket_addr: SocketAddr = addr
        .parse()
        .with_context(|| format!("invalid APP_ADDR={addr}"))?;
    let listener = TcpListener::bind(socket_addr).await?;
    info!("backend listening on {}", socket_addr);
    info!("sqlite path: {}", db_path);
    eprintln!(
        "[tab_debug] extension tab/stream debug → in ra console này (WS debug_push); xem thêm GET /v1/debug/tab"
    );

    axum::serve(listener, app).await?;
    Ok(())
}
