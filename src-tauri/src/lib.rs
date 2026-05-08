#![allow(unexpected_cfgs)]

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
    initial_folder: Option<String>,
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
    // Make folder labels readable in the sidebar. Heuristics:
    //
    //   ~/github/Penova/mockups
    //     → "Penova / mockups"
    //
    //   ~/github/Penova/.claude/worktrees/confident-ramani/mockups
    //     → "Penova · confident-ramani / mockups"
    //
    // The branch-name-only labels (`confident-ramani / mockups`) lose the
    // repo context, which makes the sidebar a soup of disembodied codenames.
    // Worktrees get a special collapsed form so the parent repo is visible.
    let comps: Vec<String> = p
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    let n = comps.len();

    // Detect `.../{repo}/.claude/worktrees/{branch}/{leaf}`
    if n >= 5 {
        let leaf = &comps[n - 1];
        let branch = &comps[n - 2];
        let worktrees_marker = &comps[n - 3];
        let dotclaude = &comps[n - 4];
        let repo = &comps[n - 5];
        if dotclaude == ".claude" && worktrees_marker == "worktrees" {
            return format!("{repo} · {branch} / {leaf}");
        }
    }

    // Default: last 3 components joined with " / "
    let mut parts: Vec<String> = comps.iter().rev().take(3).cloned().collect();
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
fn clear_decision(path: String, state: State<AppState>) -> Result<(), String> {
    state.db.clear_decision(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_decided(
    decision: Option<String>,
    since_seconds: Option<i64>,
    limit: Option<i64>,
    state: State<AppState>,
) -> Result<Vec<FileRow>, String> {
    let since_unix = since_seconds
        .map(|secs| chrono::Utc::now().timestamp() - secs);
    state
        .db
        .list_decided(decision.as_deref(), since_unix, limit.unwrap_or(500))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn count_decisions(state: State<AppState>) -> Result<(i64, i64), String> {
    state.db.count_decisions().map_err(|e| e.to_string())
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

/// Force-foreground the platter window across macOS Spaces.
/// Tauri's `setFocus()` calls `[NSApp activateIgnoringOtherApps:YES]` but
/// macOS only follows the user to the window's Space if certain prefs are
/// set. Setting NSWindowCollectionBehaviorMoveToActiveSpace makes the
/// window come to the *current* Space instead of pulling the user to the
/// window's old Space — which is what we want for an interrupting review.
#[tauri::command]
fn force_foreground(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        // Ask AppKit to bring this window to the current Space
        if let Ok(ns_window) = window.ns_window() {
            unsafe {
                use objc::{msg_send, sel, sel_impl};
                // NSWindowCollectionBehaviorMoveToActiveSpace = 1 << 1 = 2
                // NSWindowCollectionBehaviorManaged          = 1 << 2 = 4
                let behavior: u64 = 2 | 4;
                let _: () = msg_send![ns_window as *mut objc::runtime::Object, setCollectionBehavior: behavior];
                // Force activation regardless of caller policy
                let ns_app: *mut objc::runtime::Object = msg_send![objc::class!(NSApplication), sharedApplication];
                let _: () = msg_send![ns_app, activateIgnoringOtherApps: true];
                let _: () = msg_send![ns_window as *mut objc::runtime::Object, makeKeyAndOrderFront: ns_app];
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    Ok(())
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
    kind_counts: std::collections::HashMap<String, i64>,
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
            let kind_counts = state.db.kind_counts_for_root(r.id).unwrap_or_default();
            RootInfo {
                id: r.id,
                glob: r.glob,
                label: r.label,
                enabled: r.enabled,
                is_default,
                resolved_count,
                file_count,
                kind_counts,
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

#[tauri::command]
fn get_initial_folder(state: State<AppState>) -> Option<String> {
    state.initial_folder.clone()
}

#[tauri::command]
fn list_files_under(base: String, state: State<AppState>) -> Result<Vec<db::FileRow>, String> {
    state.db.list_files_under(&base).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_files_to(paths: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for path_str in &paths {
        let src = std::path::Path::new(path_str);
        let Some(name) = src.file_name() else { continue };
        let mut dest = std::path::PathBuf::from(&dest_dir).join(name);
        if dest.exists() {
            let stem = src.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
            let ts = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            dest = std::path::PathBuf::from(&dest_dir).join(format!("{stem}-{ts}{ext}"));
        }
        std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
        result.push(dest.to_string_lossy().into_owned());
    }
    Ok(result)
}

#[tauri::command]
fn remove_file(path: String, state: State<AppState>) -> Result<(), String> {
    state.db.delete_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_device_id(state: State<AppState>) -> String {
    if let Ok(Some(id)) = state.db.get_setting("device_id") {
        return id;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let _ = state.db.set_setting("device_id", &id);
    id
}

#[tauri::command]
fn get_github_token(state: State<AppState>) -> Result<Option<String>, String> {
    state.db.get_setting("github_token").map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_github_token(state: State<AppState>) -> Result<(), String> {
    state.db.delete_setting("github_token").map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_github_oauth(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);

    // percent-encode the redirect_uri manually (avoid extra dep)
    let encoded: String = redirect_uri
        .chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect();

    let auth_url = format!(
        "https://platter.pages.dev/auth/github?redirect_uri={}",
        encoded
    );

    // open browser — use tauri_plugin_opener
    tauri_plugin_opener::open_url(&auth_url, None::<String>)
        .map_err(|e| e.to_string())?;

    let db = state.db.clone();
    let app_handle2 = app_handle.clone();

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);

            // Extract token from "GET /callback?token=<tok> HTTP/1.1"
            let token = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .and_then(|path| {
                    path.split('?').nth(1).and_then(|qs| {
                        qs.split('&').find_map(|kv| {
                            let (k, v) = kv.split_once('=')?;
                            if k == "token" { Some(v.to_string()) } else { None }
                        })
                    })
                });

            if let Some(tok) = token {
                let _ = db.set_setting("github_token", &tok);
                let body = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n<!doctype html><html><head><meta charset=utf-8><title>platter</title></head><body style='font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#14110D;color:#E8DFCD'><p style='font-size:18px'>Signed in to platter. You can close this tab.</p></body></html>";
                let _ = stream.write_all(body);
                let _ = app_handle2.emit("platter:github-authed", tok);
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(open_folder: Option<String>) {
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            db: db.clone(),
            bus: bus.clone(),
            initial_folder: open_folder.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            list_tree,
            list_files,
            list_roots,
            list_recent,
            search_all,
            decide,
            clear_decision,
            list_decided,
            count_decisions,
            rescan,
            read_text_file,
            read_file_bytes,
            list_pending_reviews,
            resolve_review,
            force_foreground,
            list_root_info,
            add_root,
            remove_root,
            toggle_root,
            get_initial_folder,
            remove_file,
            get_device_id,
            get_github_token,
            clear_github_token,
            start_github_oauth,
            list_files_under,
            copy_files_to
        ])
        .setup(move |app| {
            // ── Application menu ────────────────────────────────────────
            {
                use tauri::menu::{MenuBuilder, MenuItem, SubmenuBuilder};
                let h = app.handle();

                let settings_i = MenuItem::with_id(h, "settings",      "Settings…",        true, Some("CmdOrCtrl+,"))?;
                let rescan_i   = MenuItem::with_id(h, "rescan",         "Rescan Files",     true, Some("CmdOrCtrl+R"))?;
                let github_i   = MenuItem::with_id(h, "github",         "GitHub Repository",true, None::<&str>)?;
                let issues_i   = MenuItem::with_id(h, "report_issue",   "Report an Issue…", true, None::<&str>)?;

                let app_sub = SubmenuBuilder::new(h, "platter")
                    .about(None)
                    .separator()
                    .item(&settings_i)
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;

                let file_sub = SubmenuBuilder::new(h, "File")
                    .close_window()
                    .build()?;

                let edit_sub = SubmenuBuilder::new(h, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

                let view_sub = SubmenuBuilder::new(h, "View")
                    .item(&rescan_i)
                    .separator()
                    .fullscreen()
                    .build()?;

                let window_sub = SubmenuBuilder::new(h, "Window")
                    .minimize()
                    .maximize()
                    .separator()
                    .bring_all_to_front()
                    .build()?;

                let help_sub = SubmenuBuilder::new(h, "Help")
                    .item(&github_i)
                    .item(&issues_i)
                    .build()?;

                let menu = MenuBuilder::new(h)
                    .item(&app_sub)
                    .item(&file_sub)
                    .item(&edit_sub)
                    .item(&view_sub)
                    .item(&window_sub)
                    .item(&help_sub)
                    .build()?;

                app.set_menu(menu)?;
                app.on_menu_event(|app_h, event| match event.id().as_ref() {
                    "settings" => {
                        let _ = app_h.emit("platter:menu:settings", ());
                    }
                    "rescan" => {
                        let _ = app_h.emit("platter:menu:rescan", ());
                    }
                    "github" => {
                        let _ = tauri_plugin_opener::open_url(
                            "https://github.com/rudraptpsingh/platter",
                            None::<String>,
                        );
                    }
                    "report_issue" => {
                        let _ = tauri_plugin_opener::open_url(
                            "https://github.com/rudraptpsingh/platter/issues/new",
                            None::<String>,
                        );
                    }
                    _ => {}
                });
            }

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
                eprintln!(
                    "[platter] review-pending: id={} mode={:?} paths={}",
                    req.id,
                    req.mode,
                    req.paths.len()
                );
                match app_handle3.emit("platter:review-pending", req.clone()) {
                    Ok(()) => eprintln!("[platter]   emit ok"),
                    Err(e) => eprintln!("[platter]   emit FAILED: {}", e),
                }
            });

            // …and whenever a review resolves (by user, timeout, or app shutdown)
            let app_handle4 = app.handle().clone();
            bus_for_setup.set_resolver(move |id, decision| {
                eprintln!(
                    "[platter] review-resolved: id={} decision={:?}",
                    id, decision.decision
                );
                let _ = app_handle4.emit(
                    "platter:review-resolved",
                    serde_json::json!({ "id": id, "decision": decision }),
                );
            });

            // MCP socket listener (for stdio children spawned by Claude Code)
            let mcp_ctx = McpContext {
                bus: bus_for_setup.clone(),
                db: db.clone(),
                app_handle: app.handle().clone(),
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
