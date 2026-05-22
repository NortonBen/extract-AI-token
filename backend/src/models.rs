use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gemini,
    Chatgpt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryMessage {
    pub id: String,
    pub account_id: String,
    pub model: String,
    pub role: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BusyState {
    pub global_busy: bool,
    pub accounts: std::collections::HashMap<String, bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardSummary {
    pub account_count: usize,
    pub enabled_account_count: usize,
    pub busy_count: usize,
    pub history_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub provider: Provider,
    pub label: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertAccountRequest {
    pub id: String,
    pub provider: Provider,
    pub user_index: Option<i64>,
    pub page_root: String,
    pub label: String,
    pub enabled: bool,
    pub default_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetBusyRequest {
    pub account_id: String,
    pub busy: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppendHistoryRequest {
    pub id: String,
    pub account_id: String,
    pub model: String,
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpsertModelRequest {
    pub id: String,
    pub provider: Provider,
    pub label: String,
    pub enabled: bool,
}
