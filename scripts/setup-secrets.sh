#!/bin/bash
# Print the values you should paste into the GitHub repo Secrets UI.
#
# Usage: ./scripts/setup-secrets.sh
#
# After running this, go to:
#   https://github.com/rudraptpsingh/platter/settings/secrets/actions
#
# Paste each value below into a New Repository Secret with the matching name.
# (`gh secret set` is interactive; copy-paste is faster.)
#
# Sources:
#   - Updater key + password: ~/.tauri/platter-updater.{key,password}
#   - Apple Developer ID: ~/.platter-release.env (or Slipstream's existing values)
#   - Cloudflare API token: existing token from greenfield's .env
#   - DASH_SECRET: ~/.platter-dash-secret (already set on Pages)

set -euo pipefail
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[0;90m'
RESET='\033[0m'

print_secret() {
  local name="$1"
  local value="$2"
  printf "${YELLOW}━━━ %s${RESET}\n" "$name"
  if [[ -z "$value" ]]; then
    printf "${DIM}(missing — see comments above)${RESET}\n"
  else
    echo "$value"
  fi
  echo
}

echo "Paste each into https://github.com/rudraptpsingh/platter/settings/secrets/actions"
echo

# ─── Tauri updater (REQUIRED) ────────────────────────────────────────────
if [[ -f "$HOME/.tauri/platter-updater.key" ]]; then
  print_secret "TAURI_SIGNING_PRIVATE_KEY" "$(cat "$HOME/.tauri/platter-updater.key")"
else
  print_secret "TAURI_SIGNING_PRIVATE_KEY" ""
fi

if [[ -f "$HOME/.tauri/platter-updater.password" ]]; then
  print_secret "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" "$(cat "$HOME/.tauri/platter-updater.password")"
else
  print_secret "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" ""
fi

# ─── Apple Developer ID (reuse from Slipstream/Penova) ───────────────────
echo
printf "${DIM}# Apple Developer ID secrets — reuse the same values from Slipstream\n"
printf "# (or look in your password manager). Required for signed/notarized DMG.${RESET}\n\n"

print_secret "MAC_CERT_P12_BASE64" "${MAC_CERT_P12_BASE64:-}"
print_secret "MAC_CERT_P12_PASSWORD" "${MAC_CERT_P12_PASSWORD:-}"
print_secret "APPLE_ID" "${APPLE_ID:-}"
print_secret "APPLE_APP_SPECIFIC_PASSWORD" "${APPLE_APP_SPECIFIC_PASSWORD:-}"
print_secret "APPLE_TEAM_ID" "${APPLE_TEAM_ID:-}"

# ─── Cloudflare (for latest.json deploy on every release) ────────────────
echo
printf "${DIM}# Cloudflare API token must have Pages:Edit scope. The same token used\n"
printf "# for greenfield's deploy works (read it from greenfield/.env).${RESET}\n\n"

if [[ -f "$HOME/github/thenextideaguy/.env" ]]; then
  GF_TOKEN=$(grep '^CF_API_TOKEN=' "$HOME/github/thenextideaguy/.env" | cut -d= -f2- | head -1)
  GF_ACCOUNT=$(grep '^CF_ACCOUNT_ID=' "$HOME/github/thenextideaguy/.env" | cut -d= -f2- | head -1)
else
  GF_TOKEN=""; GF_ACCOUNT=""
fi
print_secret "CLOUDFLARE_API_TOKEN" "${CLOUDFLARE_API_TOKEN:-$GF_TOKEN}"
print_secret "CLOUDFLARE_ACCOUNT_ID" "${CLOUDFLARE_ACCOUNT_ID:-$GF_ACCOUNT}"

printf "${GREEN}Done.${RESET} Once secrets are set, cut a release with:\n"
printf "  ${DIM}git tag v0.4.0 && git push origin v0.4.0${RESET}\n"
