//! Tab / stream debug lines from the Chrome extension (WS `debug_push`).
//! Mỗi dòng được in ra stderr terminal backend (`[tab_debug] ...`).

use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const MAX_ENTRIES: usize = 500;

fn format_ts(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .unwrap_or_else(Utc::now)
        .format("%H:%M:%S%.3f")
        .to_string()
}

fn is_warn_event(event: &str) -> bool {
    event.contains("error")
        || event.contains("missing")
        || event.contains("failed")
        || event.contains("warn")
}

/// In thẳng ra console terminal nơi chạy `cargo run`.
fn print_entry_console(entry: &TabDebugEntry) {
    let level = if is_warn_event(&entry.event) {
        "WARN"
    } else {
        "INFO"
    };
    let tab = entry
        .tab_id
        .map(|id| id.to_string())
        .unwrap_or_else(|| "-".to_string());
    let account = entry.account_id.as_deref().unwrap_or("-");
    let url = entry.url.as_deref().unwrap_or("");
    let url_short = if url.len() > 96 {
        format!("{}…", &url[..96])
    } else {
        url.to_string()
    };
    let detail = entry
        .detail
        .as_ref()
        .and_then(|v| serde_json::to_string(v).ok())
        .unwrap_or_default();

    if url_short.is_empty() && detail.is_empty() {
        eprintln!(
            "[tab_debug] {} {level} tab={tab} account={account} layer={} event={}",
            format_ts(entry.ts),
            entry.layer,
            entry.event
        );
    } else if detail.is_empty() {
        eprintln!(
            "[tab_debug] {} {level} tab={tab} account={account} layer={} event={} url={url_short}",
            format_ts(entry.ts),
            entry.layer,
            entry.event
        );
    } else if url_short.is_empty() {
        eprintln!(
            "[tab_debug] {} {level} tab={tab} account={account} layer={} event={} detail={detail}",
            format_ts(entry.ts),
            entry.layer,
            entry.event
        );
    } else {
        eprintln!(
            "[tab_debug] {} {level} tab={tab} account={account} layer={} event={} url={url_short} detail={detail}",
            format_ts(entry.ts),
            entry.layer,
            entry.event
        );
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabDebugEntry {
    pub ts: i64,
    pub layer: String,
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
}

#[derive(Clone, Default)]
pub struct TabDebugLog {
    inner: Arc<Mutex<VecDeque<TabDebugEntry>>>,
}

impl TabDebugLog {
    pub fn push(&self, entry: TabDebugEntry) {
        print_entry_console(&entry);

        let mut guard = self.inner.lock().expect("tab_debug mutex");
        guard.push_back(entry);
        while guard.len() > MAX_ENTRIES {
            guard.pop_front();
        }
    }

    pub fn list(&self, limit: usize) -> Vec<TabDebugEntry> {
        let guard = self.inner.lock().expect("tab_debug mutex");
        let n = limit.min(guard.len());
        guard.iter().skip(guard.len().saturating_sub(n)).cloned().collect()
    }
}

pub fn entry_from_ws_value(value: &Value) -> Option<TabDebugEntry> {
    let layer = value.get("layer").and_then(|x| x.as_str())?.to_string();
    let event = value.get("event").and_then(|x| x.as_str())?.to_string();
    let ts = value
        .get("ts")
        .and_then(|x| x.as_i64())
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    Some(TabDebugEntry {
        ts,
        layer,
        event,
        tab_id: value.get("tab_id").and_then(|x| x.as_i64()),
        account_id: value
            .get("account_id")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        url: value.get("url").and_then(|x| x.as_str()).map(|s| s.to_string()),
        detail: value.get("detail").cloned(),
    })
}
