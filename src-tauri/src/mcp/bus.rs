use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewMode {
    #[default]
    ApproveReject,
    Rank,
    PickOne,
    /// Iteration mode: agent shows a single asset and asks the user for free-text
    /// feedback on what to change. Returns the typed string in `note`.
    Iteration,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReviewRequest {
    pub id: String,
    pub paths: Vec<String>,
    pub prompt: Option<String>,
    pub mode: ReviewMode,
    pub timeout_seconds: u64,
    pub context: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DecisionKind {
    Approved,
    Rejected,
    Timeout,
    Dismissed,
    Picked,
    Ranked,
    /// Iteration feedback delivered. Look at `note` for the user's text.
    Iterated,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ReviewDecision {
    pub id: String,
    pub decision: DecisionKind,
    #[serde(default)]
    pub picked: Option<String>,
    #[serde(default)]
    pub ranking: Option<Vec<String>>,
    #[serde(default)]
    pub per_item: Option<Vec<PerItem>>,
    #[serde(default)]
    pub note: Option<String>,
    pub decided_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PerItem {
    pub path: String,
    pub verdict: String,
    #[serde(default)]
    pub stars: Option<u8>,
    #[serde(default)]
    pub note: Option<String>,
}

type NotifierFn = Box<dyn Fn(&ReviewRequest) + Send + Sync>;
type ResolverFn = Box<dyn Fn(&str, &ReviewDecision) + Send + Sync>;

pub struct ReviewBus {
    pending: Mutex<HashMap<String, mpsc::Sender<ReviewDecision>>>,
    requests: Mutex<HashMap<String, ReviewRequest>>,
    notifier: Mutex<Option<NotifierFn>>,
    resolver: Mutex<Option<ResolverFn>>,
}

impl ReviewBus {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            requests: Mutex::new(HashMap::new()),
            notifier: Mutex::new(None),
            resolver: Mutex::new(None),
        }
    }

    pub fn set_notifier<F>(&self, f: F)
    where
        F: Fn(&ReviewRequest) + Send + Sync + 'static,
    {
        *self.notifier.lock() = Some(Box::new(f));
    }

    pub fn set_resolver<F>(&self, f: F)
    where
        F: Fn(&str, &ReviewDecision) + Send + Sync + 'static,
    {
        *self.resolver.lock() = Some(Box::new(f));
    }

    fn fire_resolved(&self, id: &str, decision: &ReviewDecision) {
        if let Some(resolver) = self.resolver.lock().as_ref() {
            resolver(id, decision);
        }
    }

    pub fn submit(&self, req: ReviewRequest) -> mpsc::Receiver<ReviewDecision> {
        let (tx, rx) = mpsc::channel();
        self.pending.lock().insert(req.id.clone(), tx);
        self.requests.lock().insert(req.id.clone(), req.clone());
        if let Some(notifier) = self.notifier.lock().as_ref() {
            notifier(&req);
        }
        rx
    }

    pub fn resolve(&self, decision: ReviewDecision) -> Result<(), String> {
        let tx = self.pending.lock().remove(&decision.id);
        self.requests.lock().remove(&decision.id);
        match tx {
            Some(sender) => {
                self.fire_resolved(&decision.id, &decision);
                sender
                    .send(decision)
                    .map_err(|_| "receiver dropped".to_string())
            }
            None => Err(format!("no pending review with id {}", decision.id)),
        }
    }

    pub fn list_pending(&self) -> Vec<ReviewRequest> {
        self.requests.lock().values().cloned().collect()
    }

    pub fn dismiss_all(&self) {
        let mut pending = self.pending.lock();
        let now = chrono::Utc::now().to_rfc3339();
        let ids: Vec<String> = pending.keys().cloned().collect();
        for id in ids {
            if let Some(tx) = pending.remove(&id) {
                let decision = ReviewDecision {
                    id: id.clone(),
                    decision: DecisionKind::Dismissed,
                    picked: None,
                    ranking: None,
                    per_item: None,
                    note: None,
                    decided_at: now.clone(),
                };
                self.fire_resolved(&id, &decision);
                let _ = tx.send(decision);
            }
        }
        self.requests.lock().clear();
    }

    pub fn wait_with_timeout(
        &self,
        rx: mpsc::Receiver<ReviewDecision>,
        timeout: Duration,
        id: &str,
    ) -> ReviewDecision {
        let started = Instant::now();
        match rx.recv_timeout(timeout) {
            Ok(d) => d,
            Err(_) => {
                self.pending.lock().remove(id);
                self.requests.lock().remove(id);
                let elapsed = started.elapsed().as_secs();
                let decision = ReviewDecision {
                    id: id.to_string(),
                    decision: DecisionKind::Timeout,
                    picked: None,
                    ranking: None,
                    per_item: None,
                    note: Some(format!("timed out after {}s", elapsed)),
                    decided_at: chrono::Utc::now().to_rfc3339(),
                };
                self.fire_resolved(id, &decision);
                decision
            }
        }
    }
}

pub fn new_request_id() -> String {
    use std::time::SystemTime;
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("rev_{:x}", nanos)
}

pub type SharedBus = Arc<ReviewBus>;
