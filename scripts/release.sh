#!/bin/bash
# Build a release DMG of platter.
#
# Two modes:
#   ./scripts/release.sh              — unsigned local build (for testing)
#   ./scripts/release.sh --signed     — sign + notarize for distribution
#
# For --signed mode, requires the following environment variables:
#   APPLE_SIGNING_IDENTITY   — e.g. "Developer ID Application: Your Name (TEAMID)"
#   APPLE_ID                 — your Apple ID (email)
#   APPLE_PASSWORD           — app-specific password from appleid.apple.com
#   APPLE_TEAM_ID            — 10-char Team ID from developer.apple.com
#
# Set them in ~/.platter-release.env (gitignored) for convenience.

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[0;90m'
RESET='\033[0m'

SIGNED=false
if [[ "${1:-}" == "--signed" ]]; then
  SIGNED=true
fi

# Load env file if present
if [[ -f "$HOME/.platter-release.env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.platter-release.env"
fi

step() { printf "${YELLOW}━━━ %s${RESET}\n" "$1"; }
ok()   { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}⚠${RESET}  %s\n" "$1"; }
fail() { printf "${RED}✗${RESET} %s\n" "$1"; exit 1; }

step "1. Sanity checks"
command -v cargo >/dev/null  || fail "cargo not found"
command -v npm >/dev/null    || fail "npm not found"
[[ -f src-tauri/icons/icon.icns ]] || fail "icon.icns missing — run: npm run tauri icon -- src-tauri/icons/icon-source.png"
ok "tools + icon present"

if $SIGNED; then
  step "2. Signing config"
  : "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required for --signed}"
  : "${APPLE_ID:?APPLE_ID is required}"
  : "${APPLE_PASSWORD:?APPLE_PASSWORD is required}"
  : "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"

  # Verify the identity is actually in the keychain
  if ! security find-identity -v -p codesigning | grep -q "$APPLE_SIGNING_IDENTITY"; then
    fail "Signing identity '$APPLE_SIGNING_IDENTITY' not in keychain"
  fi
  ok "signing identity available"
fi

step "3. Frontend build"
npm run build > /tmp/platter-frontend-build.log 2>&1 || {
  cat /tmp/platter-frontend-build.log
  fail "frontend build failed"
}
ok "vite + tsc clean"

step "4. Tauri release build"
if $SIGNED; then
  export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-}"
  export TAURI_APPLE_SIGNING_IDENTITY="$APPLE_SIGNING_IDENTITY"
  export APPLE_ID
  export APPLE_PASSWORD
  export APPLE_TEAM_ID
  npm run tauri build 2>&1 | tail -30
else
  warn "building unsigned (will not pass Gatekeeper on other machines)"
  npm run tauri build 2>&1 | tail -30
fi

ARTIFACT_DIR="src-tauri/target/release/bundle"
DMG=$(ls "$ARTIFACT_DIR"/dmg/*.dmg 2>/dev/null | head -1)
APP=$(ls -d "$ARTIFACT_DIR"/macos/*.app 2>/dev/null | head -1)

if [[ -z "$DMG" ]]; then
  fail "DMG not found in $ARTIFACT_DIR/dmg/"
fi
ok "built $DMG"
ok "built $APP"

if $SIGNED; then
  step "5. Notarize"
  printf "${DIM}submitting %s to Apple…%s\n" "$DMG" "$RESET"
  xcrun notarytool submit "$DMG" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait \
    || fail "notarization failed — check the log above"
  ok "notarized"

  step "6. Staple"
  xcrun stapler staple "$DMG"  || fail "stapler failed on dmg"
  xcrun stapler staple "$APP"  || fail "stapler failed on app"
  ok "stapled"

  step "7. Verify"
  spctl --assess --type execute --verbose "$APP" 2>&1 || warn "spctl not satisfied"
fi

step "Done"
printf "${GREEN}DMG ready: %s${RESET}\n" "$DMG"
printf "${GREEN}App: %s${RESET}\n" "$APP"
echo
if $SIGNED; then
  printf "Distribute the DMG. Users can drag platter.app to /Applications.\n"
else
  printf "${DIM}This is unsigned — users on other Macs will see a Gatekeeper warning.\n"
  printf "Run with --signed once you have a Developer ID cert.${RESET}\n"
fi
