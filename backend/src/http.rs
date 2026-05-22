use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{delete, get};
use axum::{Json, Router};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::{
    Account, AppendHistoryRequest, BusyState, DashboardSummary, HistoryMessage, ModelConfig, SetBusyRequest,
    UpsertAccountRequest, UpsertModelRequest,
};
use crate::state::{AccountRow, AppState, HistoryRow, ModelRow};

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
        .route("/v1/models", get(list_models).put(upsert_model))
        .route("/v1/models/{id}", delete(delete_model))
        .route("/v1/history", get(list_history).post(append_history).delete(clear_history))
        .route("/v1/busy", get(get_busy).post(set_busy))
        .route("/v1/dashboard", get(get_dashboard))
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true }))
}

async fn ws_upgrade(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(mut socket: WebSocket, state: AppState) {
    while let Some(msg) = socket.recv().await {
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

fn dispatch_ws_request(state: &AppState, req: WsRequest) -> WsResponse {
    let id = req.id.clone();
    let result: anyhow::Result<Value> = (|| {
        match req.req_type.as_str() {
            "ping" => Ok(serde_json::json!({"pong": true})),
            "state.get" => {
                let accounts: Vec<Account> = state.list_accounts()?.into_iter().map(account_from_row).collect();
                let history: Vec<HistoryMessage> = state.list_history(200)?.into_iter().map(history_from_row).collect();
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
                let models: Vec<ModelConfig> = state.list_models()?.into_iter().map(model_from_row).collect();
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
        }
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

async fn delete_account(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
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

async fn list_history(State(state): State<AppState>, Query(query): Query<HistoryQuery>) -> impl IntoResponse {
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

async fn set_busy(State(state): State<AppState>, Json(payload): Json<SetBusyRequest>) -> impl IntoResponse {
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
