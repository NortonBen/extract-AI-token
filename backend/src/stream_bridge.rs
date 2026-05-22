use std::collections::HashMap;
use std::sync::Mutex;

use tokio::sync::mpsc;

#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// `full` is cumulative assistant text from the extension (preferred for assembly).
    Delta { delta: String, full: Option<String> },
    Done { text: String },
    Error(String),
}

#[derive(Default)]
pub struct StreamBridge {
    sessions: Mutex<HashMap<String, mpsc::UnboundedSender<StreamEvent>>>,
}

impl StreamBridge {
    pub fn open(&self, stream_id: String) -> mpsc::UnboundedReceiver<StreamEvent> {
        let (tx, rx) = mpsc::unbounded_channel();
        let mut guard = self.sessions.lock().expect("stream bridge mutex poisoned");
        guard.insert(stream_id, tx);
        rx
    }

    pub fn push(&self, stream_id: &str, event: StreamEvent) -> bool {
        let guard = self.sessions.lock().expect("stream bridge mutex poisoned");
        if let Some(tx) = guard.get(stream_id) {
            tx.send(event).is_ok()
        } else {
            false
        }
    }

    pub fn close(&self, stream_id: &str) {
        let mut guard = self.sessions.lock().expect("stream bridge mutex poisoned");
        guard.remove(stream_id);
    }
}
