mod db;
mod mcp;
mod scanner;
mod watcher;

use db::{Db, FileRow, RootRow};
use mcp::{McpContext, ReviewBus, ReviewDecision};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, State};

pub use mcp::stdio::run as run_mcp_stdio;

const DEFAULT_ROOTS: &[(&str, &str)] = &[
    ("~/github/*/mockups/*", "github · mockups"),
    ("~/github/*/.claude/worktrees/*/mockups/*", "github · worktree mockups"),
    ("~/github/*/screenshots", "github · screenshots"),
    ("~/github/*/artifacts", "github · artifacts"),
];

struct AppState {
    db: Arc<Db>,
    bus: Arc<ReviewBus>,
}

#[derive(serde::Serialize)]
struct TreeNode {
    label: String,
    path: String,
    count: i64,
    mtime: i64,
    children: Vec<TreeNode>,
}

#[tauri::command]
fn list_tree(state: State<AppState>) -> Result<Vec<TreeNode>, String> {
    let roots = state.db.list_roots().map_err(|e| e.to_string())?;
    let mut tops: Vec<TreeNode> = Vec::new();

    for root in roots.iter().filter(|r| r.enabled) {
        let leaves = scanner::expand_glob(&root.glob);
        let mut glob_count = 0i64;
        let mut glob_mtime = 0i64;
        let mut children: Vec<TreeNode> = Vec::new();
        for dir in leaves {
            let dir_str = dir.to_string_lossy().to_string();
            let cnt = state.db.count_files_under(&dir_str).unwrap_or(0);
            if cnt == 0 {
                continue;
            }
            glob_count += cnt;
            let leaf_mtime = state.db.max_mtime_under(&dir_str).unwrap_or(0);
            if leaf_mtime > glob_mtime {
                glob_mtime = leaf_mtime;
            }
            let label = nice_label(&dir);

            let subs = state.db.list_subdirs(&dir_str).unwrap_or_default();
            let mut sub_children: Vec<TreeNode> = subs
                .into_iter()
                .map(|(p, c)| {
                    let mt = state.db.max_mtime_under(&p).unwrap_or(0);
                    TreeNode {
                        label: PathBuf::from(&p)
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or(p.clone()),
                        path: p,
                        count: c,
                        mtime: mt,
                        children: vec![],
                    }
                })
                .collect();
            sub_children.sort_by(|a, b| b.mtime.cmp(&a.mtime));

            children.push(TreeNode {
                label,
                path: dir_str,
                count: cnt,
                mtime: leaf_mtime,
                children: sub_children,
            });
        }
        children.sort_by(|a, b| b.mtime.cmp(&a.mtime));
        if !children.is_empty() {
            tops.push(TreeNode {
                label: root.label.clone(),
                path: root.glob.clone(),
                count: glob_count,
                mtime: glob_mtime,
                children,
            });
        }
    }
    tops.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(tops)
}

#[tauri::command]
fn list_recent(limit: Option<i64>, state: State<AppState>) -> Result<Vec<db::FileRow>, String> {
    state
        .db
        .list_recent(limit.unwrap_or(60))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_all(
    query: String,
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<db::FileRow>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    state
        .db
        .search_all(&query, limit.unwrap_or(120))
        .map_err(|e| e.to_string())
}

fn nice_label(p: &std::path::Path) -> String {
    // E.g. /Users/rp/github/Penova/mockups → "Penova / mockups"
    let mut parts: Vec<String> = p
        .components()
        .rev()
        .take(3)
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    parts.reverse();
    parts.join(" / ")
}

#[tauri::command]
fn list_files(dir: String, state: State<AppState>) -> Result<Vec<FileRow>, String> {
    state.db.list_files_in_dir(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_roots(state: State<AppState>) -> Result<Vec<RootRow>, String> {
    state.db.list_roots().map_err(|e| e.to_string())
}

#[tauri::command]
fn decide(
    path: String,
    decision: String,
    note: Option<String>,
    state: State<AppState>,
) -> Result<(), String> {
    state
        .db
        .set_decision(&path, &decision, note.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rescan(state: State<AppState>) -> Result<(), String> {
    let db = state.db.clone();
    std::thread::spawn(move || {
        if let Ok(roots) = db.list_roots() {
            for root in roots.iter().filter(|r| r.enabled) {
                let _ = scanner::scan_root(&db, root.id, &root.glob);
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_pending_reviews(state: State<AppState>) -> Vec<mcp::ReviewRequest> {
    state.bus.list_pending()
}

#[derive(serde::Serialize)]
struct RootInfo {
    id: i64,
    glob: String,
    label: String,
    enabled: bool,
    is_default: bool,
    resolved_count: i64,
    file_count: i64,
}

#[tauri::command]
fn list_root_info(state: State<AppState>) -> Result<Vec<RootInfo>, String> {
    let roots = state.db.list_roots().map_err(|e| e.to_string())?;
    let default_globs: std::collections::HashSet<&str> =
        DEFAULT_ROOTS.iter().map(|(g, _)| *g).collect();

    let info = roots
        .into_iter()
        .map(|r| {
            let leaves = scanner::expand_glob(&r.glob);
            let resolved_count = leaves.len() as i64;
            let file_count: i64 = leaves
                .iter()
                .map(|d| {
                    state
                        .db
                        .count_files_under(&d.to_string_lossy())
                        .unwrap_or(0)
                })
                .sum();
            let is_default = default_globs.contains(r.glob.as_str());
            RootInfo {
                id: r.id,
                glob: r.glob,
                label: r.label,
                enabled: r.enabled,
                is_default,
                resolved_count,
                file_count,
            }
        })
        .collect();
    Ok(info)
}

#[tauri::command]
fn add_root(glob: String, label: Option<String>, state: State<AppState>) -> Result<i64, String> {
    let label = label.unwrap_or_else(|| {
        // Auto-derive a friendly label from the glob
        glob.replace("~/", "")
            .replace("**", "*")
            .trim_end_matches('/')
            .to_string()
    });
    state.db.add_root(&glob, &label).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_root(id: i64, state: State<AppState>) -> Result<(), String> {
    state.db.remove_root(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_root(id: i64, enabled: bool, state: State<AppState>) -> Result<(), String> {
    state
        .db
        .set_root_enabled(id, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_review(decision: ReviewDecision, state: State<AppState>) -> Result<(), String> {
    state.bus.resolve(decision)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Arc::new(Db::open(&db::db_path()).expect("open db"));
    let bus: Arc<ReviewBus> = Arc::new(ReviewBus::new());

    // Seed default roots on first launch
    let existing = db.list_roots().unwrap_or_default();
    if existing.is_empty() {
        for (glob, label) in DEFAULT_ROOTS {
            let _ = db.add_root(glob, label);
        }
    }

    let initial_db = db.clone();
    let bus_for_setup = bus.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            db: db.clone(),
            bus: bus.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            list_tree,
            list_files,
            list_roots,
            list_recent,
            search_all,
            decide,
            rescan,
            read_text_file,
            read_file_bytes,
            list_pending_reviews,
            resolve_review,
            list_root_info,
            add_root,
            remove_root,
            toggle_root
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let db_for_scan = initial_db.clone();
            std::thread::spawn(move || {
                if let Ok(roots) = db_for_scan.list_roots() {
                    for root in roots.iter().filter(|r| r.enabled) {
                        let _ = scanner::scan_root(&db_for_scan, root.id, &root.glob);
                    }
                }
                let _ = app_handle.emit("platter:scan-complete", ());
            });

            // Live watcher
            let app_handle2 = app.handle().clone();
            let _ = watcher::start_watcher(db.clone(), app_handle2);

            // MCP review bus → emit Tauri event whenever a new review lands
            let app_handle3 = app.handle().clone();
            bus_for_setup.set_notifier(move |req| {
                let _ = app_handle3.emit("platter:review-pending", req.clone());
            });

            // …and whenever a review resolves (by user, timeout, or app shutdown)
            let app_handle4 = app.handle().clone();
            bus_for_setup.set_resolver(move |id, decision| {
                let _ = app_handle4.emit(
                    "platter:review-resolved",
                    serde_json::json!({ "id": id, "decision": decision }),
                );
            });

            // MCP socket listener (for stdio children spawned by Claude Code)
            let mcp_ctx = McpContext {
                bus: bus_for_setup.clone(),
                db: db.clone(),
            };
            if let Err(e) = mcp::socket::spawn_listener(mcp_ctx) {
                eprintln!("[platter] failed to start MCP socket: {e}");
            }
            Ok(())
        })
        .on_window_event(move |_window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                bus.dismiss_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
