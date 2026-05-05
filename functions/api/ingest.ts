// POST /api/ingest — receive batched telemetry events, persist to D1.
//
// Request body shape (gzip-acceptable):
//   {
//     "device_id": "uuid",
//     "app_version": "0.4.0",
//     "events": [
//       { "type": "review_started", "ts": 1714902800, "payload": { "mode": "approve_reject", "asset_count": 3 } },
//       ...
//     ]
//   }
//
// Privacy: device_id is anon UUIDv4 generated on first launch and stored
// locally. No IP, no user agent string, no PII. See docs/PRIVACY.md.

interface Env {
  DB: D1Database;
}

const ALLOWED_EVENTS = new Set([
  "app_launched",
  "review_started",
  "review_resolved",
  "feature_used",
  "mcp_tool_invoked",
  "update_checked",
  "error",
]);

const MAX_BATCH = 50;
const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB ceiling per request

interface IncomingEvent {
  type: string;
  ts: number;
  payload?: Record<string, unknown>;
}

interface Payload {
  device_id: string;
  app_version: string;
  events: IncomingEvent[];
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (ctx.request.method !== "POST") {
    return jsonError(405, "method not allowed");
  }

  let raw: string;
  try {
    raw = await ctx.request.text();
  } catch {
    return jsonError(400, "could not read body");
  }

  if (raw.length > MAX_PAYLOAD_BYTES) {
    return jsonError(413, "payload too large");
  }

  let body: Payload;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "invalid json");
  }

  // Validate top-level shape
  if (
    !body ||
    typeof body.device_id !== "string" ||
    typeof body.app_version !== "string" ||
    !Array.isArray(body.events)
  ) {
    return jsonError(400, "invalid shape");
  }

  // Defensive bounds
  if (body.device_id.length > 64 || body.app_version.length > 24) {
    return jsonError(400, "field too long");
  }
  if (body.events.length === 0) {
    return jsonResponse({ accepted: 0 });
  }
  if (body.events.length > MAX_BATCH) {
    return jsonError(413, `max ${MAX_BATCH} events per batch`);
  }

  // Filter + sanitize events
  const now = Math.floor(Date.now() / 1000);
  const cleaned: Array<[string, string, string, number, string]> = [];
  for (const e of body.events) {
    if (
      !e ||
      typeof e.type !== "string" ||
      typeof e.ts !== "number" ||
      !ALLOWED_EVENTS.has(e.type)
    ) {
      continue;
    }
    const tsClamped = Math.min(Math.max(e.ts, now - 86400 * 30), now + 60);
    const payloadJson = e.payload ? JSON.stringify(e.payload).slice(0, 4096) : "{}";
    cleaned.push([
      crypto.randomUUID(),
      body.device_id,
      e.type,
      tsClamped,
      payloadJson,
    ]);
  }

  if (cleaned.length === 0) {
    return jsonResponse({ accepted: 0 });
  }

  // Batch insert via D1
  try {
    const stmts = cleaned.map(([id, did, type, ts, payload]) =>
      ctx.env.DB.prepare(
        "INSERT INTO events (id, device_id, event_type, ts, payload_json, app_version) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(id, did, type, ts, payload, body.app_version),
    );
    await ctx.env.DB.batch(stmts);
  } catch (err) {
    return jsonError(500, "db error: " + (err instanceof Error ? err.message : String(err)));
  }

  return jsonResponse({ accepted: cleaned.length });
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonError(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}
