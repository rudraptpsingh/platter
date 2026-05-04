use crate::db::Db;
use anyhow::Result;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use walkdir::WalkDir;

const VISUAL_EXTS: &[&str] = &[
    "html", "htm", "png", "jpg", "jpeg", "gif", "svg", "pdf", "webp", "md",
];

const DENYLIST: &[&str] = &[
    "node_modules",
    ".next",
    ".git",
    "dist",
    "build",
    "target",
    ".venv",
    ".cache",
    "coverage",
    ".turbo",
    ".vercel",
];

pub fn classify(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if VISUAL_EXTS.contains(&ext.as_str()) {
        Some(match ext.as_str() {
            "htm" => "html".to_string(),
            "jpeg" => "jpg".to_string(),
            other => other.to_string(),
        })
    } else {
        None
    }
}

pub fn is_denylisted(path: &Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        DENYLIST.contains(&s.as_ref()) || (s.starts_with('.') && s.len() > 1 && s != "." && s != ".." && !s.eq_ignore_ascii_case(".claude"))
    })
}

pub fn expand_glob(pattern: &str) -> Vec<PathBuf> {
    let expanded = shellexpand::tilde(pattern).to_string();
    glob::glob(&expanded)
        .map(|paths| paths.filter_map(|p| p.ok()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default()
}

pub fn scan_root(db: &Arc<Db>, root_id: i64, glob_pattern: &str) -> Result<()> {
    let dirs = expand_glob(glob_pattern);
    let started = chrono::Utc::now().timestamp();

    for dir in dirs {
        for entry in WalkDir::new(&dir)
            .max_depth(8)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !is_denylisted(e.path()))
        {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if let Some(kind) = classify(path) {
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                let size = meta.len() as i64;
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let path_str = path.to_string_lossy().to_string();
                let _ = db.upsert_file(&path_str, root_id, &kind, size, mtime);
            }
        }
    }

    // Drop entries that weren't seen this scan
    let _ = db.delete_missing(root_id, started);
    Ok(())
}

mod shellexpand {
    use std::borrow::Cow;
    pub fn tilde(input: &str) -> Cow<'_, str> {
        if let Some(rest) = input.strip_prefix("~/") {
            if let Some(home) = dirs::home_dir() {
                return Cow::Owned(format!("{}/{}", home.to_string_lossy(), rest));
            }
        }
        if input == "~" {
            if let Some(home) = dirs::home_dir() {
                return Cow::Owned(home.to_string_lossy().to_string());
            }
        }
        Cow::Borrowed(input)
    }
}
