#!/bin/bash
# Smoke test the MCP server. Pipes a sequence of MCP requests through
# `platter --mcp-stdio` (which proxies to the running GUI) and prints
# the responses.

set -e

cd "$(dirname "$0")/.."

BINARY="src-tauri/target/debug/platter"
if [[ ! -x "$BINARY" ]]; then
  echo "Build first: cd src-tauri && cargo build" >&2
  exit 1
fi

# A test mockups folder we know exists
MOCKUPS_DIR="$(pwd)/mockups/v1"

cat <<EOF | "$BINARY" --mcp-stdio
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"present_mockups","arguments":{"paths":["$MOCKUPS_DIR/01-empty-state.html","$MOCKUPS_DIR/02-populated-main.html","$MOCKUPS_DIR/03-review-set-hero.html"],"prompt":"Smoke test — pick the one you like best.","mode":"pick_one","timeout_seconds":120,"context":{"task":"smoke-test","repo":"platter"}}}}
EOF
