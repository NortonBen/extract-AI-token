use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::convert::Infallible;
use tokio::sync::mpsc;
use tokio::time::Duration;
use tokio_stream::wrappers::UnboundedReceiverStream;

use crate::models::{
    Account, AppendHistoryRequest, BusyState, DashboardSummary, HistoryMessage, ModelConfig,
    SetBusyRequest, UpsertAccountRequest, UpsertModelRequest,
};
use crate::state::{AccountRow, AppState, HistoryRow, ModelRow, WsRpcResponse};
use crate::stream_bridge::StreamEvent;
use crate::tab_debug::entry_from_ws_value;
use crate::sanitize::{apply_output_format, resolve_output_format, OutputFormat};
use crate::tools::{
    build_prompt, looks_like_tool_calls_json, openai_tool_message, resolve_tool_calls_relaxed,
    ChatMessage, ToolDefinition,
};

#[derive(Deserialize)]
pub struct HistoryQuery {
    limit: Option<i64>,
}

#[derive(Serialize)]
pub struct ApiError {
    error: String,
}

#[derive(Debug, Deserialize)]
struct WsRequest {
    id: String,
    #[serde(rename = "type")]
    req_type: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Serialize)]
struct WsResponse {
    id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_upgrade))
        .route("/v1/accounts", get(list_accounts).put(upsert_account))
        .route("/v1/accounts/{id}", delete(delete_account))
        .route("/v1/models", get(openai_list_models).put(upsert_model))
        .route("/v1/models/{id}", delete(delete_model))
        .route("/v1/admin/models", get(list_models).put(upsert_model))
        .route("/v1/admin/models/{id}", delete(delete_model))
        .route(
            "/v1/history",
            get(list_history).post(append_history).delete(clear_history),
        )
        .route("/v1/busy", get(get_busy).post(set_busy))
        .route("/v1/dashboard", get(get_dashboard))
        .route("/v1/chat/completions", post(openai_chat_completions))
        .route("/v1/debug/tab", get(list_tab_debug))
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true }))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: AppState) {
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    state.set_ws_sender(tx).await;
    loop {
        tokio::select! {
            outbound = rx.recv() => {
                match outbound {
                    Some(text) => {
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            incoming = socket.recv() => {
                let Some(msg) = incoming else { break; };
                let message = match msg {
                    Ok(Message::Text(text)) => text,
                    Ok(Message::Binary(_)) => continue,
                    Ok(Message::Close(_)) => break,
                    Ok(Message::Ping(bytes)) => {
                        if socket.send(Message::Pong(bytes)).await.is_err() {
                            break;
                        }
                        continue;
                    }
                    Ok(Message::Pong(_)) => continue,
                    Err(_) => break,
                };

                if let Ok(value) = serde_json::from_str::<Value>(&message) {
                    if value.get("debug_push").and_then(|x| x.as_bool()) == Some(true) {
                        handle_debug_push(&state, &value);
                        continue;
                    }
                    if value.get("stream_push").and_then(|x| x.as_bool()) == Some(true) {
                        handle_stream_push(&state, &value);
                        continue;
                    }
                    let id = value.get("id").and_then(|x| x.as_str()).unwrap_or_default();
                    if !id.is_empty() && value.get("ok").is_some() {
                        let response = WsRpcResponse {
                            ok: value.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
                            data: value.get("data").cloned(),
                            error: value.get("error").and_then(|x| x.as_str()).map(|x| x.to_string()),
                        };
                        let _ = state.resolve_ws_response(id, response).await;
                        continue;
                    }
                }

                let parsed: Result<WsRequest, _> = serde_json::from_str(&message);
                let response = match parsed {
                    Ok(req) => dispatch_ws_request(&state, req),
                    Err(err) => WsResponse {
                        id: "unknown".to_string(),
                        ok: false,
                        data: None,
                        error: Some(format!("invalid request: {err}")),
                    },
                };

                let text = match serde_json::to_string(&response) {
                    Ok(v) => v,
                    Err(err) => {
                        let fallback = WsResponse {
                            id: response.id,
                            ok: false,
                            data: None,
                            error: Some(format!("response serialize failed: {err}")),
                        };
                        match serde_json::to_string(&fallback) {
                            Ok(v) => v,
                            Err(_) => String::from("{\"id\":\"unknown\",\"ok\":false,\"error\":\"internal_error\"}"),
                        }
                    }
                };

                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }
    state.clear_ws_sender().await;
}

fn handle_debug_push(state: &AppState, value: &Value) {
    if let Some(entry) = entry_from_ws_value(value) {
        state.push_tab_debug(entry);
    }
}

async fn list_tab_debug(
    State(state): State<AppState>,
    Query(query): Query<TabDebugQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(100).clamp(1, 500) as usize;
    let entries = state.list_tab_debug(limit);
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "object": "tab_debug_log",
            "count": entries.len(),
            "entries": entries
        })),
    )
        .into_response()
}

#[derive(Deserialize)]
struct TabDebugQuery {
    limit: Option<i64>,
}

fn handle_stream_push(state: &AppState, value: &Value) {
    let stream_id = value
        .get("stream_id")
        .and_then(|x| x.as_str())
        .unwrap_or_default();
    if stream_id.is_empty() {
        return;
    }
    let event = value
        .get("event")
        .and_then(|x| x.as_str())
        .unwrap_or_default();
    match event {
        "delta" => {
            let delta = value
                .get("delta")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string();
            let full = value
                .get("text")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());
            if !delta.is_empty() || full.is_some() {
                let _ = state.push_gemini_stream(
                    stream_id,
                    StreamEvent::Delta { delta, full },
                );
            }
        }
        "done" => {
            let text = value
                .get("text")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string();
            let _ = state.push_gemini_stream(stream_id, StreamEvent::Done { text });
        }
        "error" => {
            let err = value
                .get("error")
                .and_then(|x| x.as_str())
                .unwrap_or("stream error")
                .to_string();
            let _ = state.push_gemini_stream(stream_id, StreamEvent::Error(err));
        }
        _ => {}
    }
}

fn dispatch_ws_request(state: &AppState, req: WsRequest) -> WsResponse {
    let id = req.id.clone();
    let result: anyhow::Result<Value> = (|| match req.req_type.as_str() {
        "ping" => Ok(serde_json::json!({"pong": true})),
        "state.get" => {
            let accounts: Vec<Account> = state
                .list_accounts()?
                .into_iter()
                .map(account_from_row)
                .collect();
            let history: Vec<HistoryMessage> = state
                .list_history(200)?
                .into_iter()
                .map(history_from_row)
                .collect();
            let busy = state.busy.lock().expect("busy mutex poisoned").clone();
            Ok(serde_json::json!({
                "accounts": accounts,
                "history": history,
                "busy": busy
            }))
        }
        "dashboard.get" => {
            let accounts = state.list_accounts()?;
            let busy = state.busy.lock().expect("busy mutex poisoned").clone();
            let dashboard = DashboardSummary {
                account_count: accounts.len(),
                enabled_account_count: accounts.iter().filter(|x| x.enabled).count(),
                busy_count: busy.accounts.values().filter(|value| **value).count(),
                history_count: state.history_count()?,
            };
            Ok(serde_json::to_value(dashboard)?)
        }
        "models.get" => {
            let models: Vec<ModelConfig> = state
                .list_models()?
                .into_iter()
                .map(model_from_row)
                .collect();
            Ok(serde_json::to_value(models)?)
        }
        "model.upsert" => {
            let payload: UpsertModelRequest = serde_json::from_value(req.payload)?;
            let now = Utc::now();
            let row = ModelRow {
                id: payload.id,
                provider: payload.provider,
                label: payload.label,
                enabled: payload.enabled,
                created_at: now,
                updated_at: now,
            };
            state.upsert_model(&row)?;
            Ok(serde_json::to_value(model_from_row(row))?)
        }
        "model.delete" => {
            #[derive(Deserialize)]
            struct DeleteModel {
                id: String,
            }
            let payload: DeleteModel = serde_json::from_value(req.payload)?;
            state.delete_model(&payload.id)?;
            Ok(serde_json::json!({"deleted": true}))
        }
        "account.upsert" => {
            let payload: UpsertAccountRequest = serde_json::from_value(req.payload)?;
            let now = Utc::now();
            let row = AccountRow {
                id: payload.id,
                provider: payload.provider,
                user_index: payload.user_index,
                page_root: payload.page_root,
                label: payload.label,
                enabled: payload.enabled,
                default_model: payload.default_model,
                created_at: now,
                updated_at: now,
            };
            state.upsert_account(&row)?;
            Ok(serde_json::to_value(account_from_row(row))?)
        }
        "account.delete" => {
            #[derive(Deserialize)]
            struct DeleteAccount {
                account_id: String,
            }
            let payload: DeleteAccount = serde_json::from_value(req.payload)?;
            state.delete_account(&payload.account_id)?;
            Ok(serde_json::json!({"deleted": true}))
        }
        "history.clear" => {
            state.clear_history()?;
            Ok(serde_json::json!({"cleared": true}))
        }
        "history.append" => {
            let payload: AppendHistoryRequest = serde_json::from_value(req.payload)?;
            let row = HistoryRow {
                id: payload.id,
                account_id: payload.account_id,
                model: payload.model,
                role: payload.role,
                content: payload.content,
                created_at: Utc::now(),
            };
            state.append_history(&row)?;
            Ok(serde_json::to_value(history_from_row(row))?)
        }
        "busy.set" => {
            let payload: SetBusyRequest = serde_json::from_value(req.payload)?;
            let mut busy = state.busy.lock().expect("busy mutex poisoned");
            busy.accounts.insert(payload.account_id, payload.busy);
            busy.global_busy = busy.accounts.values().any(|value| *value);
            Ok(serde_json::to_value(busy.clone())?)
        }
        "busy.get" => {
            let busy = state.busy.lock().expect("busy mutex poisoned").clone();
            Ok(serde_json::to_value(busy)?)
        }
        _ => Err(anyhow::anyhow!("unsupported type: {}", req.req_type)),
    })();

    match result {
        Ok(data) => WsResponse {
            id,
            ok: true,
            data: Some(data),
            error: None,
        },
        Err(err) => WsResponse {
            id,
            ok: false,
            data: None,
            error: Some(err.to_string()),
        },
    }
}

async fn list_accounts(State(state): State<AppState>) -> impl IntoResponse {
    match state.list_accounts() {
        Ok(rows) => {
            let out: Vec<Account> = rows.into_iter().map(account_from_row).collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn upsert_account(
    State(state): State<AppState>,
    Json(payload): Json<UpsertAccountRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let row = AccountRow {
        id: payload.id,
        provider: payload.provider,
        user_index: payload.user_index,
        page_root: payload.page_root,
        label: payload.label,
        enabled: payload.enabled,
        default_model: payload.default_model,
        created_at: now,
        updated_at: now,
    };
    match state.upsert_account(&row) {
        Ok(_) => (StatusCode::OK, Json(account_from_row(row))).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn delete_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.delete_account(&id) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn list_models(State(state): State<AppState>) -> impl IntoResponse {
    match state.list_models() {
        Ok(rows) => {
            let out: Vec<ModelConfig> = rows.into_iter().map(model_from_row).collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

/// OpenAI-compatible `GET /v1/models` (used by OpenAI SDK `client.models.list()`).
async fn openai_list_models(State(state): State<AppState>) -> impl IntoResponse {
    let created = Utc::now().timestamp();
    let mut ids: Vec<String> = match state.list_models() {
        Ok(rows) => rows
            .into_iter()
            .filter(|r| r.enabled)
            .map(|r| r.id)
            .collect(),
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: err.to_string(),
                }),
            )
                .into_response();
        }
    };
    if ids.is_empty() {
        ids = vec![
            "gemini-flash".to_string(),
            "google/gemini-flash".to_string(),
        ];
    }
    let data: Vec<Value> = ids
        .into_iter()
        .map(|id| {
            serde_json::json!({
                "id": id,
                "object": "model",
                "created": created,
                "owned_by": "extract-ai-token"
            })
        })
        .collect();
    let out = serde_json::json!({
        "object": "list",
        "data": data
    });
    (StatusCode::OK, Json(out)).into_response()
}

async fn upsert_model(
    State(state): State<AppState>,
    Json(payload): Json<UpsertModelRequest>,
) -> impl IntoResponse {
    let now = Utc::now();
    let row = ModelRow {
        id: payload.id,
        provider: payload.provider,
        label: payload.label,
        enabled: payload.enabled,
        created_at: now,
        updated_at: now,
    };
    match state.upsert_model(&row) {
        Ok(_) => (StatusCode::OK, Json(model_from_row(row))).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn delete_model(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.delete_model(&id) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn append_history(
    State(state): State<AppState>,
    Json(payload): Json<AppendHistoryRequest>,
) -> impl IntoResponse {
    let row = HistoryRow {
        id: payload.id,
        account_id: payload.account_id,
        model: payload.model,
        role: payload.role,
        content: payload.content,
        created_at: Utc::now(),
    };
    match state.append_history(&row) {
        Ok(_) => (StatusCode::OK, Json(history_from_row(row))).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn list_history(
    State(state): State<AppState>,
    Query(query): Query<HistoryQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(100).clamp(1, 1000);
    match state.list_history(limit) {
        Ok(rows) => {
            let out: Vec<HistoryMessage> = rows.into_iter().map(history_from_row).collect();
            (StatusCode::OK, Json(out)).into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn clear_history(State(state): State<AppState>) -> impl IntoResponse {
    match state.clear_history() {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiError {
                error: err.to_string(),
            }),
        )
            .into_response(),
    }
}

async fn set_busy(
    State(state): State<AppState>,
    Json(payload): Json<SetBusyRequest>,
) -> impl IntoResponse {
    let mut busy = state.busy.lock().expect("busy mutex poisoned");
    busy.accounts.insert(payload.account_id, payload.busy);
    busy.global_busy = busy.accounts.values().any(|value| *value);
    (StatusCode::OK, Json(busy.clone())).into_response()
}

async fn get_busy(State(state): State<AppState>) -> impl IntoResponse {
    let busy: BusyState = state.busy.lock().expect("busy mutex poisoned").clone();
    (StatusCode::OK, Json(busy)).into_response()
}

async fn get_dashboard(State(state): State<AppState>) -> impl IntoResponse {
    let accounts = match state.list_accounts() {
        Ok(rows) => rows,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: err.to_string(),
                }),
            )
                .into_response();
        }
    };
    let history_count = match state.history_count() {
        Ok(count) => count,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiError {
                    error: err.to_string(),
                }),
            )
                .into_response();
        }
    };
    let busy = state.busy.lock().expect("busy mutex poisoned").clone();
    let summary = DashboardSummary {
        account_count: accounts.len(),
        enabled_account_count: accounts.iter().filter(|x| x.enabled).count(),
        busy_count: busy.accounts.values().filter(|value| **value).count(),
        history_count,
    };
    (StatusCode::OK, Json(summary)).into_response()
}

#[derive(Debug, Deserialize)]
struct OpenAiChatCompletionRequest {
    model: Option<String>,
    messages: Vec<ChatMessage>,
    #[serde(default)]
    tools: Vec<ToolDefinition>,
    stream: Option<bool>,
    /// `raw` (default when stream=true) or `md` (default when stream=false).
    format: Option<String>,
    account_id: Option<String>,
}

async fn openai_chat_completions(
    State(state): State<AppState>,
    Json(payload): Json<OpenAiChatCompletionRequest>,
) -> impl IntoResponse {
    let prompt = build_prompt(&payload.messages, &payload.tools);
    if prompt.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiError {
                error: "missing user prompt".to_string(),
            }),
        )
            .into_response();
    }

    let account_id = if let Some(id) = payload.account_id.clone() {
        id
    } else {
        match state.list_accounts() {
            Ok(rows) => rows
                .into_iter()
                .find(|a| a.enabled)
                .map(|a| a.id)
                .unwrap_or_default(),
            Err(_) => String::new(),
        }
    };
    if account_id.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiError {
                error: "no enabled account".to_string(),
            }),
        )
            .into_response();
    }

    let model = payload
        .model
        .clone()
        .unwrap_or_else(|| "google/gemini-flash".to_string());

    let stream = payload.stream.unwrap_or(false);
    let output_format = resolve_output_format(stream, payload.format.as_deref());

    if stream {
        let stream_id = format!("chatcmpl-{}", Utc::now().timestamp_millis());
        let rx = state.open_gemini_stream(stream_id.clone());
        let st = state.clone();
        let sid = stream_id.clone();
        let aid = account_id.clone();
        let m = model.clone();
        let p = prompt.clone();
        tokio::spawn(async move {
            if let Err(err) = st
                .call_ws_client(
                    "controller.execute",
                    serde_json::json!({
                        "action": "send_prompt_stream",
                        "stream_id": sid,
                        "account_id": aid,
                        "model": m,
                        "prompt": p,
                    }),
                    Duration::from_secs(10),
                )
                .await
            {
                let _ = st.push_gemini_stream(&sid, StreamEvent::Error(err.to_string()));
            }
        });
        return sse_gemini_live(
            state.clone(),
            model,
            stream_id,
            rx,
            payload.tools,
            output_format,
        )
        .into_response();
    }

    let call = state
        .call_ws_client(
            "controller.execute",
            serde_json::json!({
                "action": "send_prompt",
                "account_id": account_id,
                "model": model,
                "prompt": prompt
            }),
            Duration::from_secs(180),
        )
        .await;
    let data = match call {
        Ok(v) => v,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(ApiError {
                    error: err.to_string(),
                }),
            )
                .into_response();
        }
    };
    let raw_response = data
        .get("response_text")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let raw_html = data
        .get("response_html")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    // Parse tool_calls from raw text before markdown/HTML sanitization.
    let tool_calls = resolve_tool_calls_relaxed(&raw_response, &payload.tools);
    let looks_like_tools = looks_like_tool_calls_json(&raw_response);
    let content_source = if output_format == OutputFormat::Md && !raw_html.trim().is_empty() {
        raw_html.as_str()
    } else {
        raw_response.as_str()
    };
    let mut response_text = if tool_calls.is_empty() {
        apply_output_format(content_source, output_format)
    } else {
        String::new()
    };
    if tool_calls.is_empty() && response_text.trim().is_empty() && !content_source.trim().is_empty() {
        response_text = apply_output_format(content_source, output_format);
    }
    if !payload.tools.is_empty() && tool_calls.is_empty() && looks_like_tools {
        tracing::warn!(
            "tools requested but tool_calls extraction failed; response_prefix={}",
            raw_response.chars().take(400).collect::<String>()
        );
    }
    if tool_calls.is_empty() && response_text.trim().is_empty() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(ApiError {
                error: "empty model response from Gemini (no text or tool_calls)".to_string(),
            }),
        )
            .into_response();
    }

    let id = format!("chatcmpl-{}", Utc::now().timestamp_millis());
    let created = Utc::now().timestamp();
    let usage = serde_json::json!({
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0
    });

    let choice = if !tool_calls.is_empty() {
        serde_json::json!({
            "index": 0,
            "message": openai_tool_message(&tool_calls),
            "finish_reason": "tool_calls"
        })
    } else {
        serde_json::json!({
            "index": 0,
            "message": { "role": "assistant", "content": response_text },
            "finish_reason": "stop"
        })
    };

    let out = serde_json::json!({
        "id": id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [choice],
        "usage": usage
    });
    (StatusCode::OK, Json(out)).into_response()
}

/// Live SSE: forwards Gemini StreamGenerate deltas from extension via WS (`stream_push`).
fn sse_gemini_live(
    state: AppState,
    model: String,
    stream_id: String,
    mut rx: mpsc::UnboundedReceiver<StreamEvent>,
    tools: Vec<ToolDefinition>,
    output_format: OutputFormat,
) -> impl IntoResponse {
    let has_tools = !tools.is_empty();
    let (tx, rx_sse) = mpsc::unbounded_channel::<Result<Event, Infallible>>();
    let created = Utc::now().timestamp();

    let role_event = serde_json::json!({
        "id": stream_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "delta": { "role": "assistant" },
            "finish_reason": null
        }]
    });
    let _ = tx.send(Ok(Event::default().data(role_event.to_string())));

    let model_task = model.clone();
    let id_task = stream_id.clone();
    tokio::spawn(async move {
        let mut full_text = String::new();
        let mut stream_error: Option<String> = None;
        /// True only when a content or tool_calls chunk was sent to the client.
        let mut sent_sse = false;

        while let Some(evt) = rx.recv().await {
            match evt {
                StreamEvent::Delta { delta, full } => {
                    if let Some(snap) = full {
                        if snap.len() > full_text.len() {
                            full_text = snap;
                        }
                    } else if !delta.is_empty() {
                        full_text.push_str(&delta);
                    }
                    // Old handleStreamChat: buffer text when tools defined (avoid leaking tool JSON).
                    if has_tools {
                        continue;
                    }
                    if delta.is_empty() {
                        continue;
                    }
                    let piece = if output_format == OutputFormat::Raw {
                        delta.clone()
                    } else {
                        apply_output_format(&delta, output_format)
                    };
                    if piece.is_empty() {
                        continue;
                    }
                    let event = serde_json::json!({
                        "id": id_task,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model_task,
                        "choices": [{
                            "index": 0,
                            "delta": { "content": piece },
                            "finish_reason": null
                        }]
                    });
                    if tx.send(Ok(Event::default().data(event.to_string()))).is_err() {
                        return;
                    }
                    sent_sse = true;
                }
                StreamEvent::Done { text } => {
                    if !text.is_empty() && text.len() >= full_text.len() {
                        full_text = text;
                    }
                    break;
                }
                StreamEvent::Error(err) => {
                    stream_error = Some(err);
                    break;
                }
            }
        }

        if let Some(err) = stream_error {
            let event = serde_json::json!({
                "id": id_task,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_task,
                "choices": [{
                    "index": 0,
                    "delta": { "content": format!("Error: {err}") },
                    "finish_reason": "stop"
                }]
            });
            let _ = tx.send(Ok(Event::default().data(event.to_string())));
            let _ = tx.send(Ok(Event::default().data("[DONE]")));
            return;
        }

        let raw = full_text.clone();
        let tool_calls = resolve_tool_calls_relaxed(&raw, &tools);
        let looks_like_tools = looks_like_tool_calls_json(&raw);
        if has_tools && tool_calls.is_empty() && looks_like_tools {
            tracing::warn!(
                "stream: tools requested but tool_calls extraction failed; response_prefix={}",
                raw.chars().take(400).collect::<String>()
            );
        }
        let content_text = if tool_calls.is_empty() {
            let formatted = apply_output_format(&raw, output_format);
            if formatted.trim().is_empty() && !raw.trim().is_empty() {
                raw.trim().to_string()
            } else {
                formatted
            }
        } else {
            String::new()
        };

        let finish_reason = if !tool_calls.is_empty() {
            "tool_calls"
        } else {
            "stop"
        };

        if !tool_calls.is_empty() {
            for (i, tc) in tool_calls.iter().enumerate() {
                let chunk_a = serde_json::json!({
                    "id": id_task,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model_task,
                    "choices": [{
                        "index": 0,
                        "delta": {
                            "tool_calls": [{
                                "index": i,
                                "id": tc.id,
                                "type": tc.call_type,
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": ""
                                }
                            }]
                        },
                        "finish_reason": null
                    }]
                });
                if tx.send(Ok(Event::default().data(chunk_a.to_string()))).is_ok() {
                    sent_sse = true;
                }

                let chunk_b = serde_json::json!({
                    "id": id_task,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": model_task,
                    "choices": [{
                        "index": 0,
                        "delta": {
                            "tool_calls": [{
                                "index": i,
                                "function": {
                                    "arguments": tc.function.arguments
                                }
                            }]
                        },
                        "finish_reason": null
                    }]
                });
                let _ = tx.send(Ok(Event::default().data(chunk_b.to_string())));
            }
        } else if !sent_sse && !content_text.is_empty() {
            // Tools buffer or DOM fallback: emit accumulated text once (old handleStreamChat).
            let event = serde_json::json!({
                "id": id_task,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_task,
                "choices": [{
                    "index": 0,
                    "delta": { "content": content_text },
                    "finish_reason": null
                }]
            });
            let _ = tx.send(Ok(Event::default().data(event.to_string())));
            sent_sse = true;
        } else if !sent_sse && !raw.trim().is_empty() {
            // Last resort: model text present but formatting/tools path produced no SSE yet.
            let fallback = raw.trim().to_string();
            let event = serde_json::json!({
                "id": id_task,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_task,
                "choices": [{
                    "index": 0,
                    "delta": { "content": fallback },
                    "finish_reason": null
                }]
            });
            tracing::warn!(
                "stream: emitting raw fallback content (len={}) stream_id={}",
                fallback.len(),
                id_task
            );
            let _ = tx.send(Ok(Event::default().data(event.to_string())));
            sent_sse = true;
        }

        state.close_gemini_stream(&id_task);

        let final_event = serde_json::json!({
            "id": id_task,
            "object": "chat.completion.chunk",
            "created": created,
            "model": model_task,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": finish_reason
            }]
        });
        let _ = tx.send(Ok(Event::default().data(final_event.to_string())));
        let _ = tx.send(Ok(Event::default().data("[DONE]")));
    });

    Sse::new(UnboundedReceiverStream::new(rx_sse)).keep_alive(KeepAlive::default())
}

fn account_from_row(row: AccountRow) -> Account {
    Account {
        id: row.id,
        provider: row.provider,
        user_index: row.user_index,
        page_root: row.page_root,
        label: row.label,
        enabled: row.enabled,
        default_model: row.default_model,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn history_from_row(row: HistoryRow) -> HistoryMessage {
    HistoryMessage {
        id: row.id,
        account_id: row.account_id,
        model: row.model,
        role: row.role,
        content: row.content,
        created_at: row.created_at,
    }
}

fn model_from_row(row: ModelRow) -> ModelConfig {
    ModelConfig {
        id: row.id,
        provider: row.provider,
        label: row.label,
        enabled: row.enabled,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::message_content_to_string;
    use serde_json::json;

    #[test]
    fn message_content_string() {
        assert_eq!(message_content_to_string(&json!("hello")), "hello");
    }

    #[test]
    fn openai_request_with_tools_deserializes() {
        let body = json!({
            "model": "gemini-flash",
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "description": "Get weather",
                    "parameters": { "type": "object" }
                }
            }],
            "messages": [
                { "role": "user", "content": "Weather in Hanoi?" }
            ]
        });
        let req: OpenAiChatCompletionRequest = serde_json::from_value(body).unwrap();
        assert_eq!(req.tools.len(), 1);
        assert!(build_prompt(&req.messages, &req.tools).contains("get_weather"));
    }
}
