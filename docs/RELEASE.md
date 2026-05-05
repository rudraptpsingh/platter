# Release process — signed + notarized + auto-updating builds

This is the one-time setup to ship a Gatekeeper-blessed, auto-updating macOS build of platter. The pipeline is automated by `.github/workflows/release.yml`; everything below is **secrets you set up once**, then `git tag v0.x.y && git push --tags` from then on.

## What ships per release

When you push a `v*` tag, the workflow produces, signs, notarizes, and publishes:

1. `platter_<version>_universal.dmg` — drag-to-Applications installer (Apple Silicon + Intel)
2. `platter.app.tar.gz` + `.app.tar.gz.sig` — the auto-updater payload
3. `latest.json` — the manifest the in-app updater polls (URL + signature per platform)

The DMG goes to GitHub Releases. The manifest goes both to GitHub Releases **and** to Cloudflare Pages so the in-app updater hits a CDN-edge URL (`https://platter.pages.dev/latest.json`).

## Prerequisites

- An active Apple Developer Program membership ($99 / year)
- A Cloudflare account with the `platter` Pages project (already created — see `wrangler.toml`)

## Required GitHub secrets

Configure under repo Settings → Secrets and variables → Actions.

### Tauri updater (mandatory)

Without these, every release ships a DMG but no `latest.json` — users must re-download manually.

| Secret | Source |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/platter-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set when generating the key |

**These have already been generated locally**. The matching public key is committed in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`. To copy the secret values into the GitHub secrets UI:

```bash
cat ~/.tauri/platter-updater.key             # → TAURI_SIGNING_PRIVATE_KEY
cat ~/.tauri/platter-updater.password        # → TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

> ⚠ **Lose the private key and every existing user is stranded** — they can still install fresh DMGs but their in-app updater will refuse all future manifests because the signature check fails. Back up `~/.tauri/platter-updater.{key,key.pub,password}` to your password manager.

### Apple Developer ID (optional but strongly recommended)

Same shape as Slipstream / ShotSelect / Penova. **Reuse those secrets** — the cert is the same:

| Secret | What it is |
|---|---|
| `MAC_CERT_P12_BASE64` | Developer ID Application `.p12` → base64 |
| `MAC_CERT_P12_PASSWORD` | Password protecting the `.p12` |
| `APPLE_ID` | Apple ID email used for the Developer Program |
| `APPLE_APP_SPECIFIC_PASSWORD` | From [appleid.apple.com](https://appleid.apple.com) → Sign-In & Security → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-char Team ID from [developer.apple.com/account](https://developer.apple.com/account) |

Without these the workflow still builds, but emits an unsigned bundle that trips Gatekeeper on end-user machines. The CI prints a warning so you can't miss it.

### Cloudflare Pages (mandatory for auto-update reach)

Without these the manifest only lives on GitHub Releases, which is fine but slower to fetch and adds an outage axis (GitHub-down ⇒ no updates).

| Secret | Source |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [dash.cloudflare.com](https://dash.cloudflare.com) → My Profile → API Tokens → Create — use the "Edit Cloudflare Workers" template + add Account.Cloudflare Pages: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Right sidebar of any zone in dash.cloudflare.com (32-char hex) |

If you've already configured these for Slipstream / Penova, just paste the same values — the API token covers all your Pages projects.

## One-time: create the Apple Developer ID Application certificate

If you haven't already done this for Slipstream / Penova:

1. **Generate a CSR**: Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority. Use your Apple ID email; save to disk.
2. **Issue at developer.apple.com**: Certificates → + → **Developer ID Application** (NOT Apple Distribution — that's App Store only). Upload the CSR, download the `.cer`.
3. **Install in Keychain Access** by double-clicking the `.cer`.
4. **Verify**: `security find-identity -v -p codesigning` lists `Developer ID Application: <your name> (TEAMID)`.

## Export the cert for CI

```bash
# In Keychain Access:
#   Select BOTH the cert and its private key (cmd-click each).
#   Right-click → "Export 2 items…" → File Format: .p12, set a strong password.
# Then base64 it:
base64 -i developer-id.p12 -o developer-id.p12.base64
pbcopy < developer-id.p12.base64    # paste this as MAC_CERT_P12_BASE64
```

Paste the password as `MAC_CERT_P12_PASSWORD`.

## Cutting a release

```bash
# 1. Bump the version in three places (must match):
#    - src-tauri/tauri.conf.json   ("version")
#    - src-tauri/Cargo.toml        (next to package.name)
#    - package.json                ("version")

# 2. Commit + tag + push:
git commit -am "v0.4.0"
git tag v0.4.0
git push origin main
git push origin v0.4.0
```

The release workflow runs automatically on the tag. Track progress at <https://github.com/rudraptpsingh/platter/actions>. ~12–18 min for a clean run.

When it succeeds:

- DMG attached to the GitHub release at `https://github.com/rudraptpsingh/platter/releases/tag/v0.4.0`
- `latest.json` deployed to `https://platter.pages.dev/latest.json`
- Existing platter installs check that URL on next launch (and every 6h after) — see an "Install" banner — restart — they're on v0.4.0.

## Local one-shot release (for testing before tagging)

```bash
./scripts/release.sh           # unsigned local DMG
./scripts/release.sh --signed  # full signed + notarized run
```

Same flow as CI, but driven by `~/.platter-release.env`. See the script for env-var details.

## Troubleshooting

### `notarytool` says "The signature of the binary is invalid"
Some part of the bundle didn't get signed. Re-run; tauri-action signs every nested framework correctly when the env vars are set.

### Updater banner says "Update check failed" with a 403
The Cloudflare API token doesn't have Pages:Edit. Regenerate with the right scope.

### "platter is damaged and can't be opened"
The DMG was modified after stapling. Re-run the release; don't manually edit the artifact between notarization and distribution.

### `latest.json` is stale
Pages deploy step needs both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The workflow logs a warning if either is missing.

### Universal vs aarch64-only
The workflow builds `--target universal-apple-darwin` (both architectures in one binary). To switch back to aarch64-only, change the `args:` in the build steps to `--target aarch64-apple-darwin`. ~40% smaller DMG but Intel Macs (still ~15% of the indie-dev base) won't be able to install.
