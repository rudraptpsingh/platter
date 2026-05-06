use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Db {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileRow {
    pub id: i64,
    pub path: String,
    pub root_id: i64,
    pub kind: String,
    pub size: i64,
    pub mtime: i64,
    pub created_at: i64,
    pub last_seen: i64,
    pub decision: Option<String>,
    pub decision_note: Option<String>,
    pub decided_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RootRow {
    pub id: i64,
    pub glob: String,
    pub label: String,
    pub enabled: bool,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS roots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                glob TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                added_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                size INTEGER NOT NULL,
                mtime INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen INTEGER NOT NULL,
                decision TEXT,
                decision_note TEXT,
                decided_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_files_root ON files(root_id);
            CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime DESC);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn add_root(&self, glob: &str, label: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "INSERT OR IGNORE INTO roots (glob, label, enabled, added_at) VALUES (?, ?, 1, ?)",
            params![glob, label, now],
        )?;
        let id: i64 = conn.query_row(
            "SELECT id FROM roots WHERE glob = ?",
            params![glob],
            |r| r.get(0),
        )?;
        Ok(id)
    }

    pub fn remove_root(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM roots WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn set_root_enabled(&self, id: i64, enabled: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE roots SET enabled = ? WHERE id = ?",
            params![if enabled { 1 } else { 0 }, id],
        )?;
        Ok(())
    }

    pub fn list_roots(&self) -> Result<Vec<RootRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, glob, label, enabled FROM roots ORDER BY added_at ASC",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(RootRow {
                    id: r.get(0)?,
                    glob: r.get(1)?,
                    label: r.get(2)?,
                    enabled: r.get::<_, i64>(3)? != 0,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn upsert_file(
        &self,
        path: &str,
        root_id: i64,
        kind: &str,
        size: i64,
        mtime: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            r#"
            INSERT INTO files (path, root_id, kind, size, mtime, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                kind = excluded.kind,
                size = excluded.size,
                mtime = excluded.mtime,
                last_seen = excluded.last_seen
            "#,
            params![path, root_id, kind, size, mtime, now, now],
        )?;
        Ok(())
    }

    pub fn delete_missing(&self, root_id: i64, since: i64) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "DELETE FROM files WHERE root_id = ? AND last_seen < ?",
            params![root_id, since],
        )?;
        Ok(n)
    }

    pub fn delete_file(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM files WHERE path = ?", params![path])?;
        Ok(())
    }

    pub fn get_file(&self, path: &str) -> Result<Option<FileRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, path, root_id, kind, size, mtime, created_at, last_seen,
                   decision, decision_note, decided_at
            FROM files
            WHERE path = ?
            "#,
        )?;
        let row = stmt
            .query_row(params![path], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    root_id: r.get(2)?,
                    kind: r.get(3)?,
                    size: r.get(4)?,
                    mtime: r.get(5)?,
                    created_at: r.get(6)?,
                    last_seen: r.get(7)?,
                    decision: r.get(8)?,
                    decision_note: r.get(9)?,
                    decided_at: r.get(10)?,
                })
            })
            .ok();
        Ok(row)
    }

    pub fn list_files_in_dir(&self, dir: &str) -> Result<Vec<FileRow>> {
        let pattern = format!("{}/%", dir.trim_end_matches('/'));
        // Only direct children — no nested files
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, path, root_id, kind, size, mtime, created_at, last_seen,
                   decision, decision_note, decided_at
            FROM files
            WHERE path LIKE ?
              AND substr(path, length(?) + 2) NOT LIKE '%/%'
            ORDER BY mtime DESC
            "#,
        )?;
        let rows = stmt
            .query_map(params![pattern, dir.trim_end_matches('/')], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    root_id: r.get(2)?,
                    kind: r.get(3)?,
                    size: r.get(4)?,
                    mtime: r.get(5)?,
                    created_at: r.get(6)?,
                    last_seen: r.get(7)?,
                    decision: r.get(8)?,
                    decision_note: r.get(9)?,
                    decided_at: r.get(10)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn list_subdirs(&self, dir: &str) -> Result<Vec<(String, i64)>> {
        // Find unique direct subdirs of `dir` based on file paths
        let pattern = format!("{}/%/%", dir.trim_end_matches('/'));
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT
                substr(path, 1, length(?) + 1 + instr(substr(path, length(?) + 2), '/') - 1) AS subdir,
                COUNT(*) AS cnt
            FROM files
            WHERE path LIKE ?
            GROUP BY subdir
            ORDER BY subdir ASC
            "#,
        )?;
        let dir_clean = dir.trim_end_matches('/');
        let rows = stmt
            .query_map(params![dir_clean, dir_clean, pattern], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn count_files_under(&self, dir: &str) -> Result<i64> {
        let pattern = format!("{}/%", dir.trim_end_matches('/'));
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE path LIKE ?",
            params![pattern],
            |r| r.get(0),
        )?;
        Ok(n)
    }

    pub fn max_mtime_under(&self, dir: &str) -> Result<i64> {
        let pattern = format!("{}/%", dir.trim_end_matches('/'));
        let conn = self.conn.lock().unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(mtime), 0) FROM files WHERE path LIKE ?",
                params![pattern],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(n)
    }

    pub fn list_recent(&self, limit: i64) -> Result<Vec<FileRow>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, path, root_id, kind, size, mtime, created_at, last_seen,
                   decision, decision_note, decided_at
            FROM files
            ORDER BY mtime DESC
            LIMIT ?
            "#,
        )?;
        let rows = stmt
            .query_map(params![limit], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    root_id: r.get(2)?,
                    kind: r.get(3)?,
                    size: r.get(4)?,
                    mtime: r.get(5)?,
                    created_at: r.get(6)?,
                    last_seen: r.get(7)?,
                    decision: r.get(8)?,
                    decision_note: r.get(9)?,
                    decided_at: r.get(10)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn search_all(&self, query: &str, limit: i64) -> Result<Vec<FileRow>> {
        let q = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, path, root_id, kind, size, mtime, created_at, last_seen,
                   decision, decision_note, decided_at
            FROM files
            WHERE path LIKE ? ESCAPE '\'
            ORDER BY mtime DESC
            LIMIT ?
            "#,
        )?;
        let rows = stmt
            .query_map(params![q, limit], |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    root_id: r.get(2)?,
                    kind: r.get(3)?,
                    size: r.get(4)?,
                    mtime: r.get(5)?,
                    created_at: r.get(6)?,
                    last_seen: r.get(7)?,
                    decision: r.get(8)?,
                    decision_note: r.get(9)?,
                    decided_at: r.get(10)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    pub fn set_decision(
        &self,
        path: &str,
        decision: &str,
        note: Option<&str>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp();
        conn.execute(
            "UPDATE files SET decision = ?, decision_note = ?, decided_at = ? WHERE path = ?",
            params![decision, note, now, path],
        )?;
        Ok(())
    }

    pub fn clear_decision(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE files SET decision = NULL, decision_note = NULL, decided_at = NULL WHERE path = ?",
            params![path],
        )?;
        Ok(())
    }

    /// Files with a decision, sorted by most-recently-decided.
    /// `decision_filter`: None = both, Some("approved")/Some("rejected") = filter
    /// `since_unix`: None = all time, Some(ts) = only decisions made at or after ts
    pub fn list_decided(
        &self,
        decision_filter: Option<&str>,
        since_unix: Option<i64>,
        limit: i64,
    ) -> Result<Vec<FileRow>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = String::from(
            r#"
            SELECT id, path, root_id, kind, size, mtime, created_at, last_seen,
                   decision, decision_note, decided_at
            FROM files
            WHERE decision IS NOT NULL
            "#,
        );
        let mut p: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(d) = decision_filter {
            sql.push_str(" AND decision = ?");
            p.push(Box::new(d.to_string()));
        }
        if let Some(s) = since_unix {
            sql.push_str(" AND decided_at >= ?");
            p.push(Box::new(s));
        }
        sql.push_str(" ORDER BY decided_at DESC LIMIT ?");
        p.push(Box::new(limit));

        let params_borrow: Vec<&dyn rusqlite::ToSql> =
            p.iter().map(|b| b.as_ref()).collect();
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params_borrow.as_slice(), |r| {
                Ok(FileRow {
                    id: r.get(0)?,
                    path: r.get(1)?,
                    root_id: r.get(2)?,
                    kind: r.get(3)?,
                    size: r.get(4)?,
                    mtime: r.get(5)?,
                    created_at: r.get(6)?,
                    last_seen: r.get(7)?,
                    decision: r.get(8)?,
                    decision_note: r.get(9)?,
                    decided_at: r.get(10)?,
                })
            })?
            .filter_map(|r| r.ok())
            .collect();
        Ok(rows)
    }

    /// Returns (approved_count, rejected_count) — used for sidebar badges.
    pub fn count_decisions(&self) -> Result<(i64, i64)> {
        let conn = self.conn.lock().unwrap();
        let approved: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE decision = 'approved'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let rejected: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM files WHERE decision = 'rejected'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok((approved, rejected))
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?")?;
        let mut rows = stmt.query(params![key])?;
        Ok(rows.next()?.map(|r| r.get(0)).transpose()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        self.conn.lock().unwrap().execute(
            "DELETE FROM settings WHERE key = ?1",
            params![key],
        )?;
        Ok(())
    }

    pub fn kind_counts_for_root(&self, root_id: i64) -> Result<std::collections::HashMap<String, i64>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT kind, COUNT(*) as n FROM files WHERE root_id = ?1 GROUP BY kind"
        )?;
        let rows = stmt.query_map(params![root_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut map = std::collections::HashMap::new();
        for row in rows {
            let (k, n) = row?;
            map.insert(k, n);
        }
        Ok(map)
    }
}

pub fn db_path() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("platter").join("platter.db")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> Db {
        Db::open(Path::new(":memory:")).expect("open in-memory db")
    }

    // ── device_id / get_or_create logic ──────────────────────────────────────

    #[test]
    fn device_id_is_created_and_persisted() {
        let db = temp_db();
        // First call: nothing in DB → creates a UUID
        assert!(db.get_setting("device_id").unwrap().is_none());
        let id = {
            match db.get_setting("device_id").unwrap() {
                Some(id) => id,
                None => {
                    let new_id = uuid::Uuid::new_v4().to_string();
                    db.set_setting("device_id", &new_id).unwrap();
                    new_id
                }
            }
        };
        assert!(!id.is_empty());
        // Second call: same value returned
        let again = db.get_setting("device_id").unwrap().unwrap();
        assert_eq!(id, again, "device_id must be stable across calls");
    }

    #[test]
    fn device_id_matches_between_mcp_and_command() {
        // Simulates the invariant our fix enforces: get_or_create_device_id()
        // (used by the MCP create_share handler) and get_device_id command
        // (used by the frontend) must return identical values because they
        // both read from the same DB row.
        let db = temp_db();

        // MCP path: create on first call
        let mcp_id = {
            match db.get_setting("device_id").unwrap() {
                Some(id) => id,
                None => {
                    let new_id = uuid::Uuid::new_v4().to_string();
                    db.set_setting("device_id", &new_id).unwrap();
                    new_id
                }
            }
        };

        // Tauri command path: read the same row
        let cmd_id = db.get_setting("device_id").unwrap().unwrap();

        assert_eq!(
            mcp_id, cmd_id,
            "MCP handler and Tauri command must return the same device_id"
        );
    }

    // ── settings round-trip ───────────────────────────────────────────────────

    #[test]
    fn settings_round_trip() {
        let db = temp_db();
        assert!(db.get_setting("missing").unwrap().is_none());
        db.set_setting("key", "value").unwrap();
        assert_eq!(db.get_setting("key").unwrap().as_deref(), Some("value"));
        db.set_setting("key", "updated").unwrap(); // upsert
        assert_eq!(db.get_setting("key").unwrap().as_deref(), Some("updated"));
        db.delete_setting("key").unwrap();
        assert!(db.get_setting("key").unwrap().is_none());
    }

    // ── file decisions ────────────────────────────────────────────────────────

    #[test]
    fn decision_stored_and_queryable() {
        let db = temp_db();
        db.add_root("~/test/*", "test").unwrap();
        // Upsert a file row so set_decision has something to update
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO files (path, root_id, kind, size, mtime, created_at, last_seen) VALUES (?1, 1, 'html', 0, 0, 0, 0)",
            params!["/tmp/test.html"],
        ).unwrap();
        drop(conn);

        db.set_decision("/tmp/test.html", "approved", Some("looks good")).unwrap();
        let row = db.get_file("/tmp/test.html").unwrap().unwrap();
        assert_eq!(row.decision.as_deref(), Some("approved"));
        assert_eq!(row.decision_note.as_deref(), Some("looks good"));
    }
}
