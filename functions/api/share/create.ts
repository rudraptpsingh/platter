// POST /api/share/create — mint a public review link for a single asset.
//
// Body:
//   {
//     device_id: string,           // anon UUID of the platter app
//     filename: string,
//     kind: "html" | "png" | …,
//     content_b64: string,          // base64 of the asset bytes
//     prompt?: string,
//     expires_seconds?: number      // override the 7-day default; 0 = never
//   }
//
// Returns: { id, url, expires_at }

import {
  ALLOWED_KINDS,
  DEFAULT_EXPIRY_SECONDS,
  MAX_ASSET_BYTES,
  MAX_LINKS_PER_DEVICE_PER_DAY,
  ShareEnv,
  contentTypeFor,
  corsHeaders,
  isValidDeviceId,
  jsonError,
  jsonResponse,
  newShareId,
  nowUnix,
} from "../../_share-lib";

interface Body {
  device_id: string;
  filename: string;
  kind: string;
  content_b64: string;
  prompt?: string;
  expires_seconds?: number;
}

export const onRequest: PagesFunction<ShareEnv> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (ctx.request.method !== "POST") {
    return jsonError(405, "method not allowed");
  }

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return jsonError(400, "invalid json");
  }

  if (!isValidDeviceId(body.device_id)) {
    return jsonError(400, "invalid device_id");
  }
  if (typeof body.filename !== "string" || body.filename.length === 0 || body.filename.length > 256) {
    return jsonError(400, "invalid filename");
  }
  if (typeof body.kind !== "string" || !ALLOWED_KINDS.has(body.kind)) {
    return jsonError(400, "unsupported kind");
  }
  if (typeof body.content_b64 !== "string") {
    return jsonError(400, "missing content_b64");
  }
  if (body.prompt !== undefined && (typeof body.prompt !== "string" || body.prompt.length > 1024)) {
    return jsonError(400, "prompt too long");
  }

  // Decode base64 → Uint8Array
  let bytes: Uint8Array;
  try {
    const raw = atob(body.content_b64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  } catch {
    return jsonError(400, "invalid content_b64");
  }
  if (bytes.byteLength === 0) return jsonError(400, "empty content");
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    return jsonError(413, `asset exceeds ${Math.round(MAX_ASSET_BYTES / 1024 / 1024)}MB cap`);
  }

  // Per-device daily rate limit
  const since = nowUnix() - 86400;
  const recent = await ctx.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM share_links WHERE device_id = ? AND created_at >= ?",
  )
    .bind(body.device_id, since)
    .first<{ n: number }>();
  if (recent && recent.n >= MAX_LINKS_PER_DEVICE_PER_DAY) {
    return jsonError(429, `daily share limit reached (${MAX_LINKS_PER_DEVICE_PER_DAY})`);
  }

  const id = newShareId();
  const expirySecs = body.expires_seconds ?? DEFAULT_EXPIRY_SECONDS;
  const expires_at = expirySecs <= 0 ? null : nowUnix() + expirySecs;
  const created_at = nowUnix();

  // Stash the asset in R2, keyed by id
  await ctx.env.SHARES.put(id, bytes, {
    httpMetadata: { contentType: contentTypeFor(body.kind) },
    customMetadata: { filename: body.filename, kind: body.kind, device_id: body.device_id },
  });

  // Insert the link row
  await ctx.env.DB.prepare(
    `INSERT INTO share_links
       (id, device_id, filename, kind, prompt, size_bytes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.device_id,
      body.filename,
      body.kind,
      body.prompt ?? null,
      bytes.byteLength,
      expires_at,
      created_at,
    )
    .run();

  const origin = new URL(ctx.request.url).origin;
  return jsonResponse({
    id,
    url: `${origin}/r/${id}`,
    expires_at,
    created_at,
  });
};
