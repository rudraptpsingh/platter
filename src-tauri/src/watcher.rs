use crate::db::Db;
use crate::scanner::{classify, expand_glob, is_denylisted};
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn start_watcher(
    db: Arc<Db>,
    app: AppHandle,
) -> notify::Result<()> {
    // Spawn a thread that owns the debouncer (needs Send across iteration)
    std::thread::spawn(move || {
        let db_for_handler = db.clone();
        let app_for_handler = app.clone();

        let mut debouncer = match new_debouncer(
            Duration::from_millis(400),
            None,
            move |result: DebounceEventResult| {
                let db = db_for_handler.clone();
                let app = app_for_handler.clone();
                handle_events(db, app, result);
            },
        ) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("watcher init failed: {e}");
                return;
            }
        };

        // Register watchers on every resolved leaf folder
        if let Ok(roots) = db.list_roots() {
            for root in roots.iter().filter(|r| r.enabled) {
                for dir in expand_glob(&root.glob) {
                    if let Err(e) = debouncer
                        .watcher()
                        .watch(&dir, RecursiveMode::Recursive)
                    {
                        eprintln!("watch {} failed: {e}", dir.display());
                    }
                }
            }
        }

        // Park forever — debouncer drops if dropped
        loop {
            std::thread::park();
        }
    });
    Ok(())
}

fn handle_events(db: Arc<Db>, app: AppHandle, result: DebounceEventResult) {
    let events = match result {
        Ok(v) => v,
        Err(_) => return,
    };

    let mut changed = false;
    let roots = db.list_roots().unwrap_or_default();

    for evt in events {
        for path in evt.event.paths.iter() {
            if is_denylisted(path) {
                continue;
            }
            if let Some(parent_root) = match_root(path, &roots) {
                if path.exists() && path.is_file() {
                    if let Some(kind) = classify(path) {
                        if let Ok(meta) = std::fs::metadata(path) {
                            let mtime = meta
                                .modified()
                                .ok()
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64)
                                .unwrap_or(0);
                            let _ = db.upsert_file(
                                &path.to_string_lossy(),
                                parent_root,
                                &kind,
                                meta.len() as i64,
                                mtime,
                            );
                            changed = true;
                        }
                    }
                } else if !path.exists() {
                    let _ = db.delete_file(&path.to_string_lossy());
                    changed = true;
                }
            }
        }
    }

    if changed {
        let _ = app.emit("platter:files-changed", ());
    }
}

fn match_root(path: &Path, roots: &[crate::db::RootRow]) -> Option<i64> {
    let path_str = path.to_string_lossy().to_string();
    let mut best: Option<(i64, usize)> = None;
    for root in roots.iter() {
        for dir in expand_glob(&root.glob) {
            let dir_str = dir.to_string_lossy().to_string();
            if path_str.starts_with(&dir_str) {
                let len = dir_str.len();
                if best.is_none_or(|(_, l)| len > l) {
                    best = Some((root.id, len));
                }
            }
        }
    }
    best.map(|(id, _)| id)
}
