#!/bin/bash
# Exhaustive MCP smoke test for platter.
#
# Exercises every protocol path and every tool argument shape,
# verifies responses non-interactively where possible.
#
# Run with the platter app already running (`npm run tauri dev`).

set -e
cd "$(dirname "$0")/.."

BINARY="src-tauri/target/debug/platter"
MOCKUPS_DIR="$(pwd)/mockups/v1"

if [[ ! -x "$BINARY" ]]; then
  echo "✗ Build platter first: cd src-tauri && cargo build" >&2
  exit 1
fi

# ANSI colors
G='\033[0;32m'   # green
R='\033[0;31m'   # red
Y='\033[0;33m'   # yellow
D='\033[0;90m'   # dim
N='\033[0m'      # reset

PASS=0
FAIL=0

# Helper: run a sequence of MCP messages, capture stdout
mcp() {
  printf '%s' "$1" | "$BINARY" --mcp-stdio 2>/dev/null
}

# Helper: assert substring in output
expect() {
  local label="$1"
  local output="$2"
  local needle="$3"
  if echo "$output" | grep -qF "$needle"; then
    printf "  ${G}✓${N} %s\n" "$label"
    PASS=$((PASS+1))
  else
    printf "  ${R}✗${N} %s\n     ${D}expected substring:${N} %s\n     ${D}got:${N} %s\n" \
      "$label" "$needle" "$(echo "$output" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

printf "${Y}━━━ MCP smoke suite ━━━${N}\n\n"

# ──────────────────────────────────────────────────────
printf "${Y}1. initialize${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
')
expect "returns server info"     "$out" '"name":"platter"'
expect "advertises tools cap"    "$out" '"tools"'
expect "protocol version"        "$out" '"protocolVersion":"2024-11-05"'

# ──────────────────────────────────────────────────────
printf "\n${Y}2. tools/list${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
')
expect "lists present_mockups"  "$out" '"name":"present_mockups"'
expect "input schema has paths" "$out" '"paths"'
expect "modes enum"             "$out" '"approve_reject"'

# ──────────────────────────────────────────────────────
printf "\n${Y}3. notifications/initialized is silent${N}\n"
out=$(mcp '{"jsonrpc":"2.0","method":"notifications/initialized"}
')
if [[ -z "$out" ]]; then
  printf "  ${G}✓${N} notification produces no response\n"
  PASS=$((PASS+1))
else
  printf "  ${R}✗${N} notification should be silent, got: %s\n" "$out"
  FAIL=$((FAIL+1))
fi

# ──────────────────────────────────────────────────────
printf "\n${Y}4. tools/call — bad tool name${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"nonexistent","arguments":{}}}
')
expect "returns error"          "$out" '"error"'
expect "method-not-found code"  "$out" '"code":-32601'

# ──────────────────────────────────────────────────────
printf "\n${Y}5. tools/call — missing paths${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"present_mockups","arguments":{}}}
')
expect "rejects empty paths"    "$out" '"paths must be a non-empty array"'

# ──────────────────────────────────────────────────────
printf "\n${Y}6. tools/call — empty paths array${N}\n"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"present_mockups","arguments":{"paths":[]}}}
EOF
)")
expect "rejects []"             "$out" '"paths must be a non-empty array"'

# ──────────────────────────────────────────────────────
printf "\n${Y}7. unknown method${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":42,"method":"foo/bar","params":{}}
')
expect "method-not-found"       "$out" '"code":-32601'

# ──────────────────────────────────────────────────────
printf "\n${Y}8. malformed JSON${N}\n"
out=$(mcp 'this is not json
')
expect "parse error"            "$out" '"code":-32700'

# ──────────────────────────────────────────────────────
printf "\n${Y}9. blocking call — short timeout${N}\n"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"present_mockups","arguments":{"paths":["$MOCKUPS_DIR/01-empty-state.html"],"prompt":"timeout test","mode":"approve_reject","timeout_seconds":2,"context":{"task":"smoke"}}}}
EOF
)")
expect "decision: timeout"      "$out" 'timeout'
expect "note has elapsed"       "$out" 'timed out after'
expect "decided_at iso8601"     "$out" 'decided_at'
expect "request id present"     "$out" 'rev_'

# ──────────────────────────────────────────────────────
printf "\n${Y}10. ping${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":7,"method":"ping","params":{}}
')
expect "ping returns ok"        "$out" '"id":7'
expect "no error"               "$out" '"result":{}'

# ──────────────────────────────────────────────────────
printf "\n${Y}11. tools/list — all four tools${N}\n"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
)")
expect "present_mockups"        "$out" '"name":"present_mockups"'
expect "record_decision"        "$out" '"name":"record_decision"'
expect "get_decision_history"   "$out" '"name":"get_decision_history"'
expect "list_recent"            "$out" '"name":"list_recent"'

# ──────────────────────────────────────────────────────
printf "\n${Y}12. record_decision — happy path${N}\n"
TARGET="$MOCKUPS_DIR/01-empty-state.html"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"record_decision","arguments":{"path":"$TARGET","verdict":"approved","note":"smoke test"}}}
EOF
)")
expect "verdict echoed"         "$out" 'approved'
expect "smoke test note"        "$out" 'smoke test'
expect "recorded_at iso"        "$out" 'recorded_at'

# ──────────────────────────────────────────────────────
printf "\n${Y}13. record_decision — bad verdict${N}\n"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"record_decision","arguments":{"path":"$TARGET","verdict":"maybe"}}}
EOF
)")
expect "rejects bad verdict"    "$out" "must be 'approved' or 'rejected'"

# ──────────────────────────────────────────────────────
printf "\n${Y}14. get_decision_history — looks up paths${N}\n"
out=$(mcp "$(cat <<EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"get_decision_history","arguments":{"paths":["$TARGET","/nonexistent/path.html"]}}}
EOF
)")
expect "items array"            "$out" 'items'
expect "approved decision"      "$out" 'approved'
expect "null for unseen"        "$out" 'decision\": null'

# ──────────────────────────────────────────────────────
printf "\n${Y}15. get_decision_history — missing paths${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"get_decision_history","arguments":{}}}
')
expect "rejects empty"          "$out" 'paths must be a non-empty array'

# ──────────────────────────────────────────────────────
printf "\n${Y}16. list_recent — basic${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"list_recent","arguments":{"limit":5}}}
')
expect "items array"            "$out" 'items'
expect "count field"            "$out" 'count'

# ──────────────────────────────────────────────────────
printf "\n${Y}17. list_recent — kind filter${N}\n"
out=$(mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":99,"method":"tools/call","params":{"name":"list_recent","arguments":{"limit":50,"kind":"html"}}}
')
expect "html files only"        "$out" 'kind'
# Negative check: shouldn't contain ".png" or ".jpg" if filter works
if echo "$out" | grep -q '"kind": "png"'; then
  printf "  ${R}✗${N} kind filter leaked non-html\n"
  FAIL=$((FAIL+1))
else
  printf "  ${G}✓${N} kind filter excludes other kinds\n"
  PASS=$((PASS+1))
fi

# ──────────────────────────────────────────────────────
printf "\n${Y}━━━ summary ━━━${N}\n"
TOTAL=$((PASS+FAIL))
if [[ $FAIL -eq 0 ]]; then
  printf "${G}all %d/%d passed${N}\n" "$PASS" "$TOTAL"
  exit 0
else
  printf "${R}%d/%d failed${N}, %d passed\n" "$FAIL" "$TOTAL" "$PASS"
  exit 1
fi
