use super::bus::SharedBus;
use crate::db::Db;
use std::sync::Arc;

#[derive(Clone)]
pub struct McpContext {
    pub bus: SharedBus,
    pub db: Arc<Db>,
    pub app_handle: tauri::AppHandle,
}
