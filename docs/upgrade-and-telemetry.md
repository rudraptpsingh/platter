# Auto-update + telemetry — adopting Slipstream/Penova patterns

Platter currently ships only an unsigned local DMG, has no in-app upgrade path, and emits zero telemetry. This doc captures the plan to bring it level with the other indie Mac apps in the portfolio (Penova, Slipstream, ShotSelect).

## What the other apps do

| | Penova (SwiftUI) | Slipstream (Tauri 2) | ShotSelect (Electron) |
|---|---|---|---|
| **Updater** | Sparkle (EdDSA, XML appcast) | `tauri-plugin-updater` (JSON manifest) | Custom + electron-builder |
| **Manifest hosted at** | `docs/appcast.xml` → Cloudflare Pages | `slipstreamapp.pages.dev/latest.json` | GitHub releases |
| **Signing** | EdDSA keypair in keychain + GH secret | Same — `TAURI_SIGNING_PRIVATE_KEY` | electron-builder native |
| **CI** | `release.yml` on tag → Apple sign + notarize + Sparkle sign + Pages deploy + GH release | `release.yml` on tag → Apple sign + notarize + manifest assemble + GH release | Self-hosted ARM64 runner |
| **Telemetry** | None | None | None |
| **Crash reports** | None | None | None |

Slipstream's stack matches platter's exactly (Tauri 2 + React + Cloudflare Pages), so platter copies its setup wholesale and adapts.

## Plan — phase 3a: auto-update

### Decisions

- **Plugin**: `tauri-plugin-updater` (matches Slipstream).
- **Manifest URL**: `https://platter.pages.dev/latest.json` (lives next to the landing page, served from the Cloudflare Pages CDN).
- **Signing key**: generate `~/.tauri/platter-updater.key` once, embed the public key in `tauri.conf.json`, store the private key + password as GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- **Apple notarization in CI**: Slipstream's exact pattern — base64-encoded `.p12` + app-specific password as secrets, `tauri-apps/tauri-action@v0` does the work. **The five Apple secrets are reused from Slipstream/Penova/ShotSelect** (same Developer ID cert, same app-specific password, same Team ID).
- **Trigger**: push a `v*` tag → CI builds universal Mac binary → signs + notarizes → assembles `latest.json` → attaches DMG + tarball + sig + manifest to a GitHub release → also deploys `latest.json` to Cloudflare Pages so the updater endpoint is fresh.
- **Update UX**: silent check on launch + 6h interval; when an update exists, show an in-app banner ("v0.4 available — restart to upgrade"). User dismisses or restarts.

### Artifacts

| File | Purpose |
|---|---|
| `src-tauri/Cargo.toml` | + `tauri-plugin-updater = "2"` |
| `src-tauri/tauri.conf.json` | + `plugins.updater` block with endpoint + pubkey |
| `src-tauri/src/lib.rs` | + `.plugin(tauri_plugin_updater::Builder::new().build())` |
| `src-tauri/capabilities/default.json` | + `updater:default` |
| `src/components/UpdateBanner.tsx` | + UI for "update available" |
| `.github/workflows/release.yml` | full CI pipeline (Apple sign + notarize + manifest + GH release + Pages deploy) |
| `docs/RELEASE.md` | one-time-setup guide (replacing `NOTARIZATION.md` content) |
| `~/.tauri/platter-updater.{key,key.pub,password}` | local keypair, never committed — backed up to a password manager |

### Trade-offs

- **Universal vs. aarch64-only**: Slipstream targets `universal-apple-darwin`. Platter today is aarch64-only. Universal doubles build time but reaches Intel Macs (still a meaningful portion of indie-dev Macs for ~2 more years). Going universal.
- **Pages deploy on every release**: a single `wrangler pages deploy` step in CI. Adds 10s but means the updater endpoint is always fresh.
- **Endpoint at `platter.pages.dev/latest.json` vs. `releases/latest/download/latest.json`**: Pages is faster (CDN-edge) and decouples the update mechanism from GitHub. Pages it is.

## Plan — phase 3b: telemetry

The other apps don't have telemetry (emphasizes the trust-the-user ethos). Platter is different — we want to learn what features actually get used so the roadmap stays grounded. The model has to be **privacy-respecting**, **opt-in**, and **transparent**.

### Decisions

- **Backend**: Cloudflare Worker (TypeScript) writing to D1, mirroring `thenextideaguy`'s pattern. No third-party tracker. No PII.
- **Identity**: anonymous UUID v4 generated once and stored in `~/Library/Application Support/platter/device.id`. Never sent with PII.
- **Opt-in or opt-out**: opt-in by default — first launch shows a one-time consent dialog. "Help shape platter — share anonymous usage stats? Yes / No / Later." User can flip in Settings → Privacy.
- **Worker URL**: `https://platter.pages.dev/api/ingest` (Pages Functions endpoint) — same domain as the landing page so no CORS dance.
- **Events** (small, well-defined set):
  - `app_launched` — version, os_version, opt-in source
  - `review_started` — mode, asset_count
  - `review_resolved` — decision, latency_ms, mode
  - `feature_used` — feature_name (settings_opened, search, jump_to_folder, …)
  - `mcp_tool_invoked` — tool_name (present_mockups, record_decision, …)
  - `update_checked` — found_new, current_version, latest_version
  - `error` — class, code (no message body)
- **Schema (D1)**: `events(id, device_id, event_type, payload_json, ts, app_version)` with indexes on `(event_type, ts)` and `(device_id, ts)`.
- **Dashboard**: a simple read-only Worker route `/api/dashboard` that returns aggregate counts + percentiles for the last N days, behind a shared-secret query param. Reuse `thenextideaguy`'s pattern.

### Artifacts

| File | Purpose |
|---|---|
| `landing/functions/api/ingest.ts` | Cloudflare Pages Function — accepts POST, writes to D1 |
| `landing/functions/api/dashboard.ts` | aggregate dashboard, secret-gated |
| `wrangler.toml` | + D1 binding `[[d1_databases]]` |
| `src/lib/telemetry.ts` | client: queue events locally, batch-flush every 30s |
| `src/components/PrivacyConsent.tsx` | first-run consent dialog |
| `src/components/Settings.tsx` | + "Privacy" pane with toggle |
| `docs/PRIVACY.md` | full transparency: every event, every field, retention, deletion request flow |

### Trade-offs

- **Opt-in by default vs. opt-out**: opt-in is the right call for an indie tool — losing 60–80% of telemetry volume is fine when the goal is qualitative learning, not metric optimization. Trust > volume.
- **Cloudflare Worker vs. third-party**: Worker is cheaper at any scale (free tier covers ~10M events/day), keeps data in our own D1, and matches existing infra. PostHog/Plausible would be one less moving part but add a brand we don't control.
- **D1 vs. Analytics Engine**: D1 for now (queryable from a SQL CLI, easy to delete a user's row on request). Analytics Engine is built for high-volume but harder to delete from. D1 wins on transparency.

## Phase 3 implementation order

1. **(Day 1)** Auto-updater plugin + keys + config + minimal banner UI
2. **(Day 1)** Slipstream-style release.yml + docs/RELEASE.md
3. **(Day 1)** First signed release `v0.4.0` shipped via the new pipeline
4. **(Day 2)** Telemetry Worker + D1 schema
5. **(Day 2)** Frontend telemetry client + first-run consent
6. **(Day 2)** Privacy doc + Settings pane

Phase 3a (auto-update) ships first because it unblocks the loop: every subsequent push reaches users without them re-downloading. Phase 3b (telemetry) can land on top of the now-self-updating fleet.
