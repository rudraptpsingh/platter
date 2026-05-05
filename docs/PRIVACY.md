# Privacy

Platter is local software. The app itself never reads or transmits the contents of files in your watched folders. It only inspects file metadata (path, size, mtime, kind) to render the gallery.

The one network feature is **anonymous usage telemetry**. It is **opt-in**: off by default, requires a one-time consent click on first launch, and can be turned off at any moment in Settings → Privacy.

## What gets sent

When telemetry is on, the app POSTs small batched events to `https://platter.pages.dev/api/ingest` every 30 seconds (or sooner if the queue fills). Each batch looks like:

```json
{
  "device_id": "8d0d0dba-7a40-4db7-b283-179bc9edc24b",
  "app_version": "0.4.0",
  "events": [
    { "type": "review_started", "ts": 1714902800, "payload": { "mode": "approve_reject", "asset_count": 3 } },
    { "type": "review_resolved", "ts": 1714902813, "payload": { "decision": "approved" } }
  ]
}
```

### The full event vocabulary

| Event | Payload fields |
|---|---|
| `app_launched` | `source` (e.g. `startup`, `consent_granted`) |
| `review_started` | `mode` (`approve_reject` / `rank` / `pick_one`), `asset_count` |
| `review_resolved` | `decision`, `latency_ms` |
| `feature_used` | `feature` (e.g. `settings_opened`, `search`, `jump_to_folder`) |
| `mcp_tool_invoked` | `tool_name` (e.g. `present_mockups`, `record_decision`) |
| `update_checked` | `found_new`, `current_version`, `latest_version` |
| `error` | `class`, `code` (no message body) |

### What is **never** sent

- File paths, file names, or file contents
- The contents of mockups, screenshots, PDFs, markdown plans
- Decision notes or freeform text you typed
- Your IP address, hostname, OS user name, Apple ID, or anything correlatable to you outside of platter
- Any tracker IDs (no Google Analytics, PostHog, Mixpanel, Sentry, etc.)
- Anything Claude said to you or anything you said to Claude

The server-side code is a single Cloudflare Pages Function in this repo at [`landing/functions/api/ingest.ts`](../landing/functions/api/ingest.ts) — read it. It rejects events not in the whitelist, clamps timestamps to a 30-day window, and caps payloads at 4 KB.

## Where the data lives

A Cloudflare D1 database named `platter-telemetry` in the personal Cloudflare account of the maintainer (rudra.ptp.singh@gmail.com). Schema: see [`migrations/001_init.sql`](../migrations/001_init.sql).

D1 is a SQLite-compatible managed database; no third party (other than Cloudflare itself, who hosts the database file) has access.

## Identity

A random UUID v4 is generated on first launch and stored in the app's local storage. It is not derived from any system property, not your hostname, not your device serial — just `crypto.randomUUID()`. It does not leave the device unless telemetry is on.

You can rotate it any time from Settings → Privacy → "Reset device ID". That cuts the link between this device's future events and any past events on the server.

## Retention

Events older than 180 days are dropped automatically from D1. The D1 schema has no created-by-IP, no headers, no anything that would let me identify you from the database alone.

## Deletion request

Want past events tied to your device ID purged immediately? Open Settings → Privacy and copy your device ID, then email it to `rudra.ptp.singh@gmail.com`. I'll run a SQL `DELETE` against `events WHERE device_id = ?` and reply when done.

## Why opt-in (not opt-out)

Indie tools earn trust by default. Most useful telemetry signal comes from active users who choose to share — coercing it from people who didn't choose dilutes the signal *and* erodes trust. The other Mac apps in this family (Penova, Slipstream, ShotSelect) ship zero telemetry; platter is the first to add any, and only behind explicit consent.

## Auditing the wire

If you want to verify the claims above, run platter under a network proxy (e.g. `mitmproxy`) and watch the actual outbound POST bodies. They'll match the schema in this doc exactly. The Pages Function source is also pinned in this repo at the path above and you can diff it against any deployed version via `wrangler pages deployment list --project-name=platter`.
