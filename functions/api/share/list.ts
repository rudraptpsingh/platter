// GET /api/share/list?device_id=X
//
// Returns this device's most recent share-links + each link's decision history.
// Used by the Settings → Shared links pane to show "what people said about
// what you sent."

import { ShareEnv, isValidDeviceId, jsonError, jsonResponse } from "../../_share-lib";

export const onRequest: PagesFunction<ShareEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return jsonError(405, "method not allowed");

  const url = new URL(ctx.request.url);
  const device_id = url.searchParams.get("device_id");
  if (!isValidDeviceId(device_id)) return jsonError(400, "invalid device_id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10), 1), 200);

  const links = await ctx.env.DB.prepare(
    `SELECT id, filename, kind, prompt, size_bytes, expires_at, created_at,
            view_count, last_viewed_at, revoked_at
       FROM share_links
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT ?`,
  )
    .bind(device_id, limit)
    .all<{
      id: string;
      filename: string;
      kind: string;
      prompt: string | null;
      size_bytes: number;
      expires_at: number | null;
      created_at: number;
      view_count: number;
      last_viewed_at: number | null;
      revoked_at: number | null;
    }>();

  const linkRows = links.results ?? [];
  if (linkRows.length === 0) {
    return jsonResponse({ links: [] });
  }

  const ids = linkRows.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");
  const decisions = await ctx.env.DB.prepare(
    `SELECT id, share_id, decision, note, reviewer_name, decided_at
       FROM share_decisions
      WHERE share_id IN (${placeholders})
      ORDER BY decided_at DESC`,
  )
    .bind(...ids)
    .all<{
      id: string;
      share_id: string;
      decision: string;
      note: string | null;
      reviewer_name: string | null;
      decided_at: number;
    }>();

  const byShare = new Map<string, typeof decisions.results>();
  for (const d of decisions.results ?? []) {
    const arr = byShare.get(d.share_id) ?? [];
    arr.push(d);
    byShare.set(d.share_id, arr);
  }

  return jsonResponse({
    links: linkRows.map((l) => ({
      ...l,
      decisions: byShare.get(l.id) ?? [],
    })),
  });
};
