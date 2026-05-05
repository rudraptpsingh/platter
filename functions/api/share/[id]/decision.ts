// POST /api/share/:id/decision — reviewer submits approve/reject/iterate.
//
// Body: { decision, note?, reviewer_name? }
//
// Dedups by (share_id, ip_hash) — if you click Approve then Reject, the
// later one wins (delete + insert). IPs are sha256-hashed before storage
// so we never log the raw value.

import {
  MAX_NOTE_BYTES,
  ShareEnv,
  corsHeaders,
  jsonError,
  jsonResponse,
  loadShare,
  nowUnix,
  sha256Hex,
} from "../../../_share-lib";

interface Body {
  decision: string;
  note?: string;
  reviewer_name?: string;
}

const DECISIONS = new Set(["approved", "rejected", "iterated"]);

export const onRequest: PagesFunction<ShareEnv, "id"> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (ctx.request.method !== "POST") {
    return jsonError(405, "method not allowed");
  }

  const result = await loadShare(ctx.env, ctx.params.id as string);
  if (!result.ok) return result.response;
  const { row } = result;

  let body: Body;
  try {
    body = (await ctx.request.json()) as Body;
  } catch {
    return jsonError(400, "invalid json");
  }

  if (!DECISIONS.has(body.decision)) {
    return jsonError(400, "decision must be approved | rejected | iterated");
  }
  const note = typeof body.note === "string" ? body.note.slice(0, MAX_NOTE_BYTES) : null;
  const reviewerName =
    typeof body.reviewer_name === "string" ? body.reviewer_name.slice(0, 80) : null;

  // sha256(ip + share_id) — share-scoped salt prevents cross-link tracking
  const ip = ctx.request.headers.get("CF-Connecting-IP") ?? "unknown";
  const ip_hash = (await sha256Hex(`${row.id}:${ip}`)).slice(0, 32);

  // Replace any prior decision from this IP on this share
  await ctx.env.DB.prepare(
    "DELETE FROM share_decisions WHERE share_id = ? AND ip_hash = ?",
  )
    .bind(row.id, ip_hash)
    .run();

  const id = crypto.randomUUID();
  await ctx.env.DB.prepare(
    `INSERT INTO share_decisions (id, share_id, decision, note, reviewer_name, ip_hash, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, row.id, body.decision, note, reviewerName, ip_hash, nowUnix())
    .run();

  return jsonResponse({
    ok: true,
    decision: body.decision,
    decided_at: nowUnix(),
  });
};
