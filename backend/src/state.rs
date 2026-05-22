use crate::models::{BusyState, Provider};
use crate::stream_bridge::{StreamBridge, StreamEvent};
use crate::tab_debug::{TabDebugEntry, TabDebugLog};
use anyhow::Context;
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params};
use serde_json::Value;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tokio::sync::{Mutex as AsyncMutex, mpsc, oneshot};
use tokio::time::{Duration, timeout};

#[derive(Debug, Clone)]
pub struct WsRpcResponse {
    pub ok: bool,
    pub data: Option<Value>,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct WsBridge {
    pub sender: Option<mpsc::UnboundedSender<String>>,
    pub pending: std::collections::HashMap<String, oneshot::Sender<WsRpcResponse>>,
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub busy: Arc<Mutex<BusyState>>,
    pub ws_bridge: Arc<AsyncMutex<WsBridge>>,
    pub stream_bridge: Arc<StreamBridge>,
    pub tab_debug: TabDebugLog,
}

#[derive(Debug, Clone)]
pub struct AccountRow {
    pub id: String,
    pub provider: Provider,
    pub user_index: Option<i64>,
    pub page_root: String,
    pub label: String,
    pub enabled: bool,
    pub default_model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct HistoryRow {
    pub id: String,
    pub account_id: String,
    pub model: String,
    pub role: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ModelRow {
    pub id: String,
    pub provider: Provider,
    pub label: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AppState {
    pub fn init(db_path: &str) -> anyhow::Result<Self> {
        if let Some(parent) = Path::new(db_path).parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create db dir for {}", db_path))?;
        }
        let conn = Connection::open(db_path).with_context(|| format!("open sqlite {}", db_path))?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                user_index INTEGER NOT NULL,
                page_root TEXT NOT NULL DEFAULT '',
                label TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                default_model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_messages (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                model TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY,
                provider TEXT NOT NULL,
                label TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;
        let _ = conn.execute(
            "ALTER TABLE accounts ADD COLUMN page_root TEXT NOT NULL DEFAULT ''",
            [],
        );
        Ok(Self {
            db: Arc::new(Mutex::new(conn)),
            busy: Arc::new(Mutex::new(BusyState::default())),
            ws_bridge: Arc::new(AsyncMutex::new(WsBridge::default())),
            stream_bridge: Arc::new(StreamBridge::default()),
            tab_debug: TabDebugLog::default(),
        })
    }

    pub fn push_tab_debug(&self, entry: TabDebugEntry) {
        self.tab_debug.push(entry);
    }

    pub fn list_tab_debug(&self, limit: usize) -> Vec<TabDebugEntry> {
        self.tab_debug.list(limit)
    }

    pub fn open_gemini_stream(&self, stream_id: String) -> mpsc::UnboundedReceiver<StreamEvent> {
        self.stream_bridge.open(stream_id)
    }

    pub fn push_gemini_stream(&self, stream_id: &str, event: StreamEvent) -> bool {
        self.stream_bridge.push(stream_id, event)
    }

    pub fn close_gemini_stream(&self, stream_id: &str) {
        self.stream_bridge.close(stream_id);
    }

    pub async fn set_ws_sender(&self, sender: mpsc::UnboundedSender<String>) {
        let mut bridge = self.ws_bridge.lock().await;
        bridge.sender = Some(sender);
    }

    pub async fn clear_ws_sender(&self) {
        let mut bridge = self.ws_bridge.lock().await;
        bridge.sender = None;
        bridge.pending.clear();
    }

    pub async fn resolve_ws_response(&self, id: &str, response: WsRpcResponse) -> bool {
        let mut bridge = self.ws_bridge.lock().await;
        if let Some(tx) = bridge.pending.remove(id) {
            let _ = tx.send(response);
            return true;
        }
        false
    }

    pub async fn call_ws_client(
        &self,
        req_type: &str,
        payload: Value,
        wait: Duration,
    ) -> anyhow::Result<Value> {
        let req_id = format!("rpc-{}", uuid_like());
        let (tx, rx) = oneshot::channel::<WsRpcResponse>();
        {
            let mut bridge = self.ws_bridge.lock().await;
            let sender = bridge
                .sender
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("ws controller is not connected"))?
                .clone();
            bridge.pending.insert(req_id.clone(), tx);
            let request = serde_json::json!({
                "id": req_id,
                "type": req_type,
                "payload": payload
            });
            sender
                .send(request.to_string())
                .map_err(|_| anyhow::anyhow!("ws controller send failed"))?;
        }
        let response = timeout(wait, rx)
            .await
            .map_err(|_| anyhow::anyhow!("ws controller timeout"))?
            .map_err(|_| anyhow::anyhow!("ws controller dropped response"))?;
        if response.ok {
            Ok(response.data.unwrap_or(Value::Null))
        } else {
            Err(anyhow::anyhow!(
                "{}",
                response
                    .error
                    .unwrap_or_else(|| "ws controller error".to_string())
            ))
        }
    }

    pub fn upsert_account(&self, row: &AccountRow) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO accounts (id, provider, user_index, page_root, label, enabled, default_model, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
              provider = excluded.provider,
              user_index = excluded.user_index,
              page_root = excluded.page_root,
              label = excluded.label,
              enabled = excluded.enabled,
              default_model = excluded.default_model,
              updated_at = excluded.updated_at
            "#,
            params![
                row.id,
                provider_to_str(&row.provider),
                row.user_index.unwrap_or(-1),
                row.page_root,
                row.label,
                row.enabled as i32,
                row.default_model,
                row.created_at.to_rfc3339(),
                row.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_accounts(&self) -> anyhow::Result<Vec<AccountRow>> {
        let conn = self.db.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, provider, user_index, page_root, label, enabled, default_model, created_at, updated_at
             FROM accounts ORDER BY provider, user_index",
        )?;
        let rows = stmt.query_map([], |row| {
            let created_at = parse_rfc3339_utc(row.get::<_, String>(7)?.as_str())?;
            let updated_at = parse_rfc3339_utc(row.get::<_, String>(8)?.as_str())?;
            let user_index_raw: i64 = row.get(2)?;
            Ok(AccountRow {
                id: row.get(0)?,
                provider: str_to_provider(row.get::<_, String>(1)?.as_str()),
                user_index: if user_index_raw < 0 {
                    None
                } else {
                    Some(user_index_raw)
                },
                page_root: row.get(3)?,
                label: row.get(4)?,
                enabled: row.get::<_, i32>(5)? != 0,
                default_model: row.get(6)?,
                created_at,
                updated_at,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn append_history(&self, row: &HistoryRow) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO history_messages (id, account_id, model, role, content, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                row.id,
                row.account_id,
                row.model,
                row.role,
                row.content,
                row.created_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn list_history(&self, limit: i64) -> anyhow::Result<Vec<HistoryRow>> {
        let conn = self.db.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, account_id, model, role, content, created_at
             FROM history_messages ORDER BY created_at DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            let created_at = parse_rfc3339_utc(row.get::<_, String>(5)?.as_str())?;
            Ok(HistoryRow {
                id: row.get(0)?,
                account_id: row.get(1)?,
                model: row.get(2)?,
                role: row.get(3)?,
                content: row.get(4)?,
                created_at,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn clear_history(&self) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM history_messages", [])?;
        Ok(())
    }

    pub fn history_count(&self) -> anyhow::Result<usize> {
        let conn = self.db.lock().expect("db mutex poisoned");
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM history_messages", [], |row| {
            row.get(0)
        })?;
        Ok(count as usize)
    }

    pub fn upsert_model(&self, row: &ModelRow) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute(
            r#"
            INSERT INTO models (id, provider, label, enabled, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
              provider = excluded.provider,
              label = excluded.label,
              enabled = excluded.enabled,
              updated_at = excluded.updated_at
            "#,
            params![
                row.id,
                provider_to_str(&row.provider),
                row.label,
                row.enabled as i32,
                row.created_at.to_rfc3339(),
                row.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    pub fn list_models(&self) -> anyhow::Result<Vec<ModelRow>> {
        let conn = self.db.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, provider, label, enabled, created_at, updated_at FROM models ORDER BY provider, id",
        )?;
        let rows = stmt.query_map([], |row| {
            let created_at = parse_rfc3339_utc(row.get::<_, String>(4)?.as_str())?;
            let updated_at = parse_rfc3339_utc(row.get::<_, String>(5)?.as_str())?;
            Ok(ModelRow {
                id: row.get(0)?,
                provider: str_to_provider(row.get::<_, String>(1)?.as_str()),
                label: row.get(2)?,
                enabled: row.get::<_, i32>(3)? != 0,
                created_at,
                updated_at,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn delete_model(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.db.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM models WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn provider_to_str(provider: &Provider) -> &'static str {
    match provider {
        Provider::Gemini => "gemini",
        Provider::Chatgpt => "chatgpt",
    }
}

fn str_to_provider(value: &str) -> Provider {
    match value {
        "chatgpt" => Provider::Chatgpt,
        _ => Provider::Gemini,
    }
}

fn parse_rfc3339_utc(value: &str) -> rusqlite::Result<DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|v| v.with_timezone(&Utc))
        .map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })
}

fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{ns:x}")
}
