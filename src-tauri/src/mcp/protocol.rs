use super::bus::{new_request_id, ReviewMode, ReviewRequest, SharedBus};
use serde_json::{json, Value};
use std::time::Duration;

pub const PROTOCOL_VERSION: &str = "2024-11-05";
pub const SERVER_NAME: &str = "platter";
pub const SERVER_VERSION: &str = "0.1.0";

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

/// Tool definition shown to MCP clients
fn present_mockups_tool() -> Value {
    json!({
        "name": "present_mockups",
        "description": "Present a set of mockups (HTML/PNG/PDF/SVG) to the human for review. Blocks until the user approves, rejects, ranks, or picks one. Returns the decision so you can act on it.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Absolute file paths to present. They must already exist on disk."
                },
                "prompt": {
                    "type": "string",
                    "description": "What you're asking the human to decide. Phrase as a question, e.g. 'Should we ship this hero variant?'"
                },
                "mode": {
                    "type": "string",
                    "enum": ["approve_reject", "rank", "pick_one"],
                    "default": "approve_reject",
                    "description": "approve_reject: yes/no per item. rank: drag-to-reorder, partial allowed. pick_one: choose a single winner."
                },
                "timeout_seconds": {
                    "type": "number",
                    "default": 1800,
                    "description": "Max seconds to wait for the human. Returns 'timeout' if exceeded. 0 = no timeout."
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

pub fn dispatch(req: JsonRpcRequest, bus: &SharedBus) -> Option<JsonRpcResponse> {
    let id = req.id.clone().unwrap_or(Value::Null);
    let is_notification = req.id.is_none();

    match req.method.as_str() {
        "initialize" => Some(ok(
            id,
            json!({
                "protocolVersion": PROTOCOL_VERSION,
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": SERVER_VERSION
                },
                "capabilities": {
                    "tools": { "listChanged": false }
                }
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
                "tools": [present_mockups_tool()]
            }),
        )),
        "tools/call" => {
            let params = req.params.unwrap_or(Value::Null);
            let tool_name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(Value::Null);

            match tool_name {
                "present_mockups" => Some(handle_present_mockups(id, args, bus)),
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

fn handle_present_mockups(id: Value, args: Value, bus: &SharedBus) -> JsonRpcResponse {
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
    let rx = bus.submit(request);

    let timeout = if timeout_seconds == 0 {
        Duration::from_secs(60 * 60 * 24)
    } else {
        Duration::from_secs(timeout_seconds)
    };

    let decision = bus.wait_with_timeout(rx, timeout, &request_id);

    let payload = serde_json::to_string_pretty(&decision)
        .unwrap_or_else(|_| "{}".to_string());

    ok(
        id,
        json!({
            "content": [{
                "type": "text",
                "text": payload
            }]
        }),
    )
}
