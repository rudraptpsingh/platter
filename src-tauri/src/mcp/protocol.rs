use super::bus::{new_request_id, ReviewMode, ReviewRequest};
use super::context::McpContext;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::Emitter;

pub const PROTOCOL_VERSION: &str = "2024-11-05";
pub const SERVER_NAME: &str = "platter";
// Bumped at every release alongside Cargo.toml + tauri.conf.json + package.json.
pub const SERVER_VERSION: &str = "0.4.0";

#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    #[serde(default)]
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

#[derive(serde::Serialize, Debug)]
pub struct JsonRpcResponse {
    pub jsonrpc: &'static str,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(serde::Serialize, Debug)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

pub fn ok(id: Value, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    }
}

pub fn err(id: Value, code: i32, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.to_string(),
            data: None,
        }),
    }
}

// ─── Tool definitions ───────────────────────────────

fn present_mockups_tool() -> Value {
    json!({
        "name": "present_mockups",
        "description": "Open a set of mockups inside the Platter app for human review. BLOCKS until the user approves, rejects, ranks, or picks one — then returns the decision. Only call this when the user explicitly asks to review mockups (e.g. 'show me the mockups', 'I want to review the designs'). Do NOT call automatically after generating files.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Absolute file paths to present. Must exist on disk."
                },
                "prompt": {
                    "type": "string",
                    "description": "What you're asking the human to decide. Phrase as a question."
                },
                "mode": {
                    "type": "string",
                    "enum": ["approve_reject", "rank", "pick_one"],
                    "default": "approve_reject"
                },
                "timeout_seconds": {
                    "type": "number",
                    "default": 1800,
                    "description": "Max seconds to wait. Returns 'timeout' if exceeded. 0 = no timeout."
                },
                "context": {
                    "type": "object",
                    "description": "Free-form context for the UI: { task, repo, ... }"
                }
            },
            "required": ["paths"]
        }
    })
}

fn record_decision_tool() -> Value {
    json!({
        "name": "record_decision",
        "description": "Record a decision on a file WITHOUT asking the human. Use when you're confident the verdict is obvious (e.g., a generated file you're discarding). Does not block. Stored in the same decision history as user decisions.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": "Absolute file path." },
                "verdict": {
                    "type": "string",
                    "enum": ["approved", "rejected"],
                    "description": "The decision to record."
                },
                "note": {
                    "type": "string",
                    "description": "Optional explanation (why you decided this without the human)."
                }
            },
            "required": ["path", "verdict"]
        }
    })
}

fn get_decision_history_tool() -> Value {
    json!({
        "name": "get_decision_history",
        "description": "Look up past decisions on a list of paths. Use this BEFORE generating mockups to learn from prior approvals/rejections — e.g., 'the user already rejected this hero variant 3 times, try a different direction.'",
        "inputSchema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Absolute file paths to query."
                }
            },
            "required": ["paths"]
        }
    })
}

fn request_iteration_tool() -> Value {
    json!({
        "name": "request_iteration",
        "description": "Show a single asset to the human and ask for free-text feedback on what to change. BLOCKS until the user submits (or dismisses). Use this after a rejection — turns 'no' into structured 'change X, change Y'. The user's text is returned in the `note` field.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the asset that needs iteration."
                },
                "prompt": {
                    "type": "string",
                    "description": "What you're asking the user about. e.g. 'What should change about the headline?' or 'Why did you reject this hero variant?'"
                },
                "what_to_change": {
                    "type": "string",
                    "description": "Optional hint about which aspect of the asset you want feedback on. Surfaced in the UI as a sub-prompt."
                },
                "timeout_seconds": {
                    "type": "number",
                    "default": 1800
                },
                "context": {
                    "type": "object",
                    "description": "Free-form context: { task, repo, ... }"
                }
            },
            "required": ["path"]
        }
    })
}

fn open_folder_tool() -> Value {
    json!({
        "name": "open_folder",
        "description": "Navigate the Platter app window to a specific folder so the user can browse files there. Only call when the user explicitly asks to 'open in Platter' or 'show the folder in Platter'. Do NOT call automatically after generating files — the user decides when to look.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the folder to display."
                }
            },
            "required": ["path"]
        }
    })
}

fn create_share_tool() -> Value {
    json!({
        "name": "create_share",
        "description": "Generate a shareable public link for one or more files — no Platter app required. Only call when the user explicitly asks for a link or URL (e.g. 'give me a link', 'share this', 'provide a URL'). Multiple files → one collection link with slideshow. Always show the returned 'url' to the user as a clickable link. Supports HTML, PNG, JPG, SVG, PDF, GIF, WebP, MD.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Absolute paths to share. Single item → individual link. Multiple items → collection link (slideshow + per-item decisions). Prefer this over 'path' when sharing a set."
                },
                "path": {
                    "type": "string",
                    "description": "Shorthand for a single file. Ignored if 'paths' is provided."
                },
                "prompt": {
                    "type": "string",
                    "description": "Message shown to the reviewer, e.g. 'Which layout do you prefer?'"
                },
                "expires_seconds": {
                    "type": "number",
                    "description": "Optional TTL in seconds. Omit for no expiry."
                }
            }
        }
    })
}

fn list_recent_tool() -> Value {
    json!({
        "name": "list_recent",
        "description": "List the most recently modified mockups, screenshots, or PDFs across all watched folders. Use only when the user asks to see recent files or when you need to locate previously generated assets.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "number",
                    "default": 30,
                    "description": "Maximum number of items to return."
                },
                "kind": {
                    "type": "string",
                    "enum": ["html", "png", "jpg", "pdf", "svg", "md"],
                    "description": "Optional filter by file kind."
                },
                "since_seconds": {
                    "type": "number",
                    "description": "Only return files modified within this many seconds. Omit for any time."
                }
            }
        }
    })
}

// ─── Dispatch ───────────────────────────────────────

pub fn dispatch(req: JsonRpcRequest, ctx: &McpContext) -> Option<JsonRpcResponse> {
    let id = req.id.clone().unwrap_or(Value::Null);
    let is_notification = req.id.is_none();

    match req.method.as_str() {
        "initialize" => Some(ok(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION },
                "capabilities": { "tools": { "listChanged": false } }
            }),
        )),
        "notifications/initialized" | "initialized" => {
            if is_notification {
                None
            } else {
                Some(ok(id, json!({})))
            }
        }
        "tools/list" => Some(ok(
            id,
            json!({
                "tools": [
                    present_mockups_tool(),
                    request_iteration_tool(),
                    record_decision_tool(),
                    get_decision_history_tool(),
                    list_recent_tool(),
                    open_folder_tool(),
                    create_share_tool()
                ]
            }),
        )),
        "tools/call" => {
            let params = req.params.unwrap_or(Value::Null);
            let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(Value::Null);

            match tool_name {
                "present_mockups" => Some(handle_present_mockups(id, args, ctx)),
                "request_iteration" => Some(handle_request_iteration(id, args, ctx)),
                "record_decision" => Some(handle_record_decision(id, args, ctx)),
                "get_decision_history" => Some(handle_get_decision_history(id, args, ctx)),
                "list_recent" => Some(handle_list_recent(id, args, ctx)),
                "open_folder" => Some(handle_open_folder(id, args, ctx)),
                "create_share" => Some(handle_create_share(id, args, ctx)),
                _ => Some(err(id, -32601, &format!("unknown tool: {}", tool_name))),
            }
        }
        "ping" => Some(ok(id, json!({}))),
        _ => {
            if is_notification {
                None
            } else {
                Some(err(id, -32601, &format!("method not found: {}", req.method)))
            }
        }
    }
}

// ─── Tool handlers ──────────────────────────────────

fn tool_text_result(payload: &impl serde::Serialize) -> Value {
    let text = serde_json::to_string_pretty(payload).unwrap_or_else(|_| "{}".to_string());
    json!({
        "content": [{ "type": "text", "text": text }]
    })
}

fn handle_present_mockups(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let paths: Vec<String> = args
        .get("paths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if paths.is_empty() {
        return err(id, -32602, "paths must be a non-empty array");
    }

    let prompt = args
        .get("prompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mode = args
        .get("mode")
        .and_then(|v| v.as_str())
        .map(|s| match s {
            "rank" => ReviewMode::Rank,
            "pick_one" => ReviewMode::PickOne,
            _ => ReviewMode::ApproveReject,
        })
        .unwrap_or_default();

    let timeout_seconds = args
        .get("timeout_seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(1800);

    let context = args.get("context").cloned().unwrap_or(json!({}));

    let request = ReviewRequest {
        id: new_request_id(),
        paths,
        prompt,
        mode,
        timeout_seconds,
        context,
        created_at: chrono::Utc::now().timestamp(),
    };

    let request_id = request.id.clone();
    let rx = ctx.bus.submit(request);

    let timeout = if timeout_seconds == 0 {
        Duration::from_secs(60 * 60 * 24)
    } else {
        Duration::from_secs(timeout_seconds)
    };

    let decision = ctx.bus.wait_with_timeout(rx, timeout, &request_id);

    // Persist per-item verdicts so get_decision_history reflects the review.
    if let Some(items) = &decision.per_item {
        let top_note = decision.note.as_deref();
        for item in items {
            let verdict = match item.verdict.as_str() {
                "yes" => "approved",
                "no"  => "rejected",
                _     => continue, // iterate / unknown — no verdict to store
            };
            let note = item.note.as_deref().or(top_note);
            let _ = ctx.db.set_decision(&item.path, verdict, note);
        }
    }

    ok(id, tool_text_result(&decision))
}

fn handle_request_iteration(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => return err(id, -32602, "path is required"),
    };

    // Compose a prompt for the modal. If both `prompt` and `what_to_change`
    // are present, prefer `prompt`; the iteration UI shows `what_to_change`
    // as a focused sub-prompt under it.
    let prompt = args
        .get("prompt")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let what_to_change = args
        .get("what_to_change")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let timeout_seconds = args
        .get("timeout_seconds")
        .and_then(|v| v.as_u64())
        .unwrap_or(1800);

    // Stash `what_to_change` into the context payload so the frontend can render it.
    let mut context = args
        .get("context")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(s) = &what_to_change {
        if let Some(obj) = context.as_object_mut() {
            obj.insert("what_to_change".to_string(), Value::String(s.clone()));
        }
    }

    let request = ReviewRequest {
        id: new_request_id(),
        paths: vec![path],
        prompt,
        mode: ReviewMode::Iteration,
        timeout_seconds,
        context,
        created_at: chrono::Utc::now().timestamp(),
    };

    let request_id = request.id.clone();
    let rx = ctx.bus.submit(request);

    let timeout = if timeout_seconds == 0 {
        Duration::from_secs(60 * 60 * 24)
    } else {
        Duration::from_secs(timeout_seconds)
    };

    let decision = ctx.bus.wait_with_timeout(rx, timeout, &request_id);
    ok(id, tool_text_result(&decision))
}

fn handle_record_decision(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => return err(id, -32602, "path is required"),
    };
    let verdict = match args.get("verdict").and_then(|v| v.as_str()) {
        Some(v) if v == "approved" || v == "rejected" => v.to_string(),
        _ => return err(id, -32602, "verdict must be 'approved' or 'rejected'"),
    };
    let note = args.get("note").and_then(|v| v.as_str()).map(|s| s.to_string());

    if let Err(e) = ctx.db.set_decision(&path, &verdict, note.as_deref()) {
        return err(id, -32603, &format!("failed to record decision: {}", e));
    }

    ok(
        id,
        tool_text_result(&serde_json::json!({
            "path": path,
            "verdict": verdict,
            "note": note,
            "recorded_at": chrono::Utc::now().to_rfc3339()
        })),
    )
}

fn handle_get_decision_history(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let paths: Vec<String> = args
        .get("paths")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if paths.is_empty() {
        return err(id, -32602, "paths must be a non-empty array");
    }

    // Look up each path. Files that have never been seen will return null.
    let results: Vec<Value> = paths
        .iter()
        .map(|p| match ctx.db.get_file(p) {
            Ok(Some(f)) => json!({
                "path": p,
                "decision": f.decision,
                "decision_note": f.decision_note,
                "decided_at": f.decided_at.map(|ts| chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0).map(|d| d.to_rfc3339()).unwrap_or_default()),
                "size": f.size,
                "mtime": f.mtime,
                "kind": f.kind
            }),
            _ => json!({ "path": p, "decision": null }),
        })
        .collect();

    ok(id, tool_text_result(&serde_json::json!({ "items": results })))
}

fn handle_list_recent(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let limit = args
        .get("limit")
        .and_then(|v| v.as_i64())
        .unwrap_or(30)
        .clamp(1, 500);
    let kind = args.get("kind").and_then(|v| v.as_str()).map(String::from);
    let since_seconds = args.get("since_seconds").and_then(|v| v.as_i64());
    let min_mtime = since_seconds.map(|s| chrono::Utc::now().timestamp() - s);

    let rows = match ctx.db.list_recent(limit) {
        Ok(r) => r,
        Err(e) => return err(id, -32603, &format!("db error: {}", e)),
    };

    let filtered: Vec<Value> = rows
        .into_iter()
        .filter(|f| match (&kind, min_mtime) {
            (Some(k), Some(t)) => f.kind == *k && f.mtime >= t,
            (Some(k), None) => f.kind == *k,
            (None, Some(t)) => f.mtime >= t,
            (None, None) => true,
        })
        .map(|f| {
            json!({
                "path": f.path,
                "kind": f.kind,
                "size": f.size,
                "mtime": f.mtime,
                "decision": f.decision
            })
        })
        .collect();

    ok(
        id,
        tool_text_result(&serde_json::json!({
            "items": filtered,
            "count": filtered.len()
        })),
    )
}

fn handle_open_folder(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => return err(id, -32602, "path is required"),
    };
    if !std::path::Path::new(&path).exists() {
        return err(id, -32602, &format!("path does not exist: {path}"));
    }
    // Trigger a rescan so newly created files are indexed before the UI renders
    let db = ctx.db.clone();
    if let Ok(roots) = db.list_roots() {
        for root in roots.iter().filter(|r| r.enabled) {
            let _ = crate::scanner::scan_root(&db, root.id, &root.glob);
        }
    }
    let emit_result = ctx.app_handle.emit("platter:open-folder", &path);
    // Bring the window to the foreground so the user sees the navigation
    {
        use tauri::Manager;
        if let Some(win) = ctx.app_handle.get_webview_window("main") {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
    match emit_result {
        Ok(()) => ok(id, tool_text_result(&json!({ "opened": path }))),
        Err(e) => err(id, -32603, &format!("emit failed: {e}")),
    }
}

fn handle_create_share(id: Value, args: Value, ctx: &McpContext) -> JsonRpcResponse {
    use base64::Engine;

    // Resolve paths: prefer "paths" array, fall back to single "path"
    let paths: Vec<String> = if let Some(arr) = args.get("paths").and_then(|v| v.as_array()) {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
    } else if let Some(p) = args.get("path").and_then(|v| v.as_str()) {
        vec![p.to_string()]
    } else {
        return err(id, -32602, "provide 'paths' (array) or 'path' (string)");
    };

    if paths.is_empty() {
        return err(id, -32602, "paths must not be empty");
    }

    let prompt = args.get("prompt").and_then(|v| v.as_str()).map(String::from);
    let expires_seconds = args.get("expires_seconds").and_then(|v| v.as_u64());
    let device_id = get_or_create_device_id(&ctx.db);

    // Single file → individual share link (original endpoint)
    if paths.len() == 1 {
        let path = &paths[0];
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => return err(id, -32602, &format!("cannot read file: {e}")),
        };
        let content_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let filename = std::path::Path::new(path)
            .file_name().and_then(|n| n.to_str()).unwrap_or("asset");
        let kind = filename.rsplit('.').next().unwrap_or("").to_lowercase();

        let mut body = json!({
            "device_id": device_id,
            "filename": filename,
            "kind": kind,
            "content_b64": content_b64,
        });
        if let Some(p) = &prompt { body["prompt"] = json!(p); }
        if let Some(exp) = expires_seconds { body["expires_seconds"] = json!(exp); }

        return match ureq::post("https://platter.pages.dev/api/share/create")
            .set("Content-Type", "application/json")
            .send_json(&body)
        {
            Ok(resp) => match resp.into_json::<serde_json::Value>() {
                Ok(j) => {
                    // Notify the frontend so it can persist the share_id → local path
                    // mapping. Without this, remote decisions can't be synced back.
                    if let Some(share_id) = j.get("id").and_then(|v| v.as_str()) {
                        let _ = ctx.app_handle.emit(
                            "platter:share-created",
                            json!({ "share_id": share_id, "path": path }),
                        );
                    }
                    ok(id, tool_text_result(&j))
                }
                Err(e) => err(id, -32603, &format!("bad response JSON: {e}")),
            },
            Err(e) => err(id, -32603, &format!("share upload failed: {e}")),
        };
    }

    // Multiple files → collection link
    let mut items: Vec<serde_json::Value> = Vec::new();
    for path in &paths {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => return err(id, -32602, &format!("cannot read {path}: {e}")),
        };
        let content_b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let filename = std::path::Path::new(path)
            .file_name().and_then(|n| n.to_str()).unwrap_or("asset");
        let kind = filename.rsplit('.').next().unwrap_or("").to_lowercase();
        items.push(json!({ "filename": filename, "kind": kind, "content_b64": content_b64 }));
    }

    let mut body = json!({
        "device_id": device_id,
        "items": items,
    });
    if let Some(p) = &prompt { body["prompt"] = json!(p); }
    if let Some(exp) = expires_seconds { body["expires_seconds"] = json!(exp); }

    match ureq::post("https://platter.pages.dev/api/share/create-collection")
        .set("Content-Type", "application/json")
        .send_json(&body)
    {
        Ok(resp) => match resp.into_json::<serde_json::Value>() {
            Ok(j) => {
                // For collections, associate the collection share_id with the first
                // path so the SharedLinksView thumbnail and decision carry-back work.
                if let Some(share_id) = j.get("id").and_then(|v| v.as_str()) {
                    if let Some(first_path) = paths.first() {
                        let _ = ctx.app_handle.emit(
                            "platter:share-created",
                            json!({ "share_id": share_id, "path": first_path }),
                        );
                    }
                }
                ok(id, tool_text_result(&j))
            }
            Err(e) => err(id, -32603, &format!("bad response JSON: {e}")),
        },
        Err(e) => err(id, -32603, &format!("collection upload failed: {e}")),
    }
}

fn get_or_create_device_id(db: &crate::db::Db) -> String {
    if let Ok(Some(id)) = db.get_setting("device_id") {
        return id;
    }
    let id = uuid::Uuid::new_v4().to_string();
    let _ = db.set_setting("device_id", &id);
    id
}
