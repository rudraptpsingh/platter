use super::bus::SharedBus;
use crate::db::Db;
use std::sync::Arc;

/// Bundled state passed to every MCP request handler. Holds the review bus
/// (for blocking present_mockups calls) and the file index db (for the
/// read-only tools like list_recent and get_decision_history).
#[derive(Clone)]
pub struct McpContext {
    pub bus: SharedBus,
    pub db: Arc<Db>,
}
