// POST /api/share/create-collection
//
// Upload multiple assets in one round-trip and mint a single collection
// URL that shows them all in a slideshow/grid with per-item decisions.
//
// Body:
//   {
//     device_id: string,
//     items: Array<{ filename, kind, content_b64, prompt? }>,
//     prompt?: string,          // shown above the whole set
//     expires_seconds?: number
//   }
//
// Returns: { id, url, item_ids: string[], expires_at, created_at }

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

interface ItemInput {
  filename: string;
  kind: string;
  content_b64: string;
  prompt?: string;
}

interface Body {
  device_id: string;
  items: ItemInput[];
  prompt?: string;
  expires_seconds?: number;
}

export const onRequest: PagesFunction<ShareEnv> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (ctx.request.method !== "POST") return jsonError(405, "method not allowed");

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return jsonError(400, "invalid json");
  }

  if (!isValidDeviceId(body.device_id)) return jsonError(400, "invalid device_id");
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return jsonError(400, "items must be a non-empty array");
  }
  if (body.items.length > 20) return jsonError(400, "max 20 items per collection");
  if (body.prompt !== undefined && body.prompt.length > 1024) {
    return jsonError(400, "prompt too long");
  }

  // Per-device daily rate limit (each item counts as one link)
  const since = nowUnix() - 86400;
  const recent = await ctx.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM share_links WHERE device_id = ? AND created_at >= ?",
  ).bind(body.device_id, since).first<{ n: number }>();
  if (recent && recent.n + body.items.length > MAX_LINKS_PER_DEVICE_PER_DAY) {
    return jsonError(429, `daily share limit would be exceeded (${MAX_LINKS_PER_DEVICE_PER_DAY}/day)`);
  }

  const expirySecs = body.expires_seconds ?? DEFAULT_EXPIRY_SECONDS;
  const expires_at = expirySecs <= 0 ? null : nowUnix() + expirySecs;
  const created_at = nowUnix();

  // Validate + decode all items first so we fail fast before writing anything
  const decoded: Array<{ id: string; item: ItemInput; bytes: Uint8Array }> = [];
  for (const item of body.items) {
    if (typeof item.filename !== "string" || !item.filename || item.filename.length > 256) {
      return jsonError(400, `invalid filename: ${item.filename}`);
    }
    if (!ALLOWED_KINDS.has(item.kind)) {
      return jsonError(400, `unsupported kind: ${item.kind}`);
    }
    if (typeof item.content_b64 !== "string") {
      return jsonError(400, `missing content_b64 for ${item.filename}`);
    }
    let bytes: Uint8Array;
    try {
      const raw = atob(item.content_b64);
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } catch {
      return jsonError(400, `invalid content_b64 for ${item.filename}`);
    }
    if (bytes.byteLength === 0) return jsonError(400, `empty content for ${item.filename}`);
    if (bytes.byteLength > MAX_ASSET_BYTES) {
      return jsonError(413, `${item.filename} exceeds ${MAX_ASSET_BYTES / 1024 / 1024}MB cap`);
    }
    decoded.push({ id: newShareId(), item, bytes });
  }

  const collectionId = newShareId();

  // Write all assets to R2 + DB
  for (const { id, item, bytes } of decoded) {
    await ctx.env.SHARES.put(id, bytes, {
      httpMetadata: { contentType: contentTypeFor(item.kind) },
      customMetadata: { filename: item.filename, kind: item.kind, device_id: body.device_id },
    });
    await ctx.env.DB.prepare(
      `INSERT INTO share_links (id, device_id, filename, kind, prompt, size_bytes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, body.device_id, item.filename, item.kind, item.prompt ?? body.prompt ?? null,
           bytes.byteLength, expires_at, created_at).run();
  }

  // Create collection row
  await ctx.env.DB.prepare(
    `INSERT INTO share_collections (id, device_id, prompt, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(collectionId, body.device_id, body.prompt ?? null, created_at, expires_at).run();

  // Link items (in order)
  for (let i = 0; i < decoded.length; i++) {
    await ctx.env.DB.prepare(
      `INSERT INTO share_collection_items (collection_id, idx, share_id) VALUES (?, ?, ?)`,
    ).bind(collectionId, i, decoded[i].id).run();
  }

  const origin = new URL(ctx.request.url).origin;
  return jsonResponse({
    id: collectionId,
    url: `${origin}/r/c/${collectionId}`,
    item_ids: decoded.map((d) => d.id),
    expires_at,
    created_at,
  });
};
