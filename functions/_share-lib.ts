// Shared helpers for the share-link endpoints.

export interface ShareEnv {
  DB: D1Database;
  SHARES: R2Bucket;
}

export const MAX_ASSET_BYTES = 4 * 1024 * 1024; // 4MB cap per shared asset
export const MAX_NOTE_BYTES = 4 * 1024;
export const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
export const MAX_LINKS_PER_DEVICE_PER_DAY = 50;

export const ALLOWED_KINDS = new Set([
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "pdf",
  "md",
]);

const KIND_TO_CONTENT_TYPE: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
};

export function contentTypeFor(kind: string): string {
  return KIND_TO_CONTENT_TYPE[kind] ?? "application/octet-stream";
}

/** A short, URL-safe id (~16 chars). Not a UUID — easier to type/share. */
export function newShareId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  // base64url
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function isValidDeviceId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 64 && /^[a-zA-Z0-9-]+$/.test(s);
}

export function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function jsonError(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

/** sha256 hex of a UTF-8 string. */
export async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Look up + bounce-check a share. Returns null + a Response if invalid. */
export async function loadShare(
  env: ShareEnv,
  id: string,
): Promise<
  | {
      ok: true;
      row: ShareRow;
    }
  | { ok: false; response: Response }
> {
  if (!id || id.length > 32 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { ok: false, response: jsonError(400, "invalid share id") };
  }
  const row = (await env.DB.prepare(
    `SELECT id, device_id, filename, kind, prompt, size_bytes, expires_at, created_at,
            view_count, last_viewed_at, revoked_at
       FROM share_links WHERE id = ?`,
  )
    .bind(id)
    .first()) as ShareRow | null;

  if (!row) return { ok: false, response: jsonError(404, "not found") };
  if (row.revoked_at) return { ok: false, response: jsonError(410, "revoked") };
  if (row.expires_at && row.expires_at < nowUnix()) {
    return { ok: false, response: jsonError(410, "expired") };
  }
  return { ok: true, row };
}

export interface ShareRow {
  id: string;
  device_id: string;
  filename: string;
  kind: string;
  prompt: string | null;
  size_bytes: number;
  expires_at: number | null;
  created_at: number;
  view_count: number;
  last_viewed_at: number | null;
  revoked_at: number | null;
}
