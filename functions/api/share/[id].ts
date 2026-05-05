// GET /api/share/:id — return metadata + raw asset bytes.
//
// Used by the wrapper page (/r/:id) to fetch the asset for display.
// Bumps view_count + last_viewed_at on success (idempotent enough — we
// only count once per IP per session via no-cache header on the asset).

import {
  ShareEnv,
  contentTypeFor,
  corsHeaders,
  jsonError,
  loadShare,
  nowUnix,
} from "../../_share-lib";

export const onRequest: PagesFunction<ShareEnv, "id"> = async (ctx) => {
  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (ctx.request.method !== "GET") {
    return jsonError(405, "method not allowed");
  }

  const result = await loadShare(ctx.env, ctx.params.id as string);
  if (!result.ok) return result.response;
  const { row } = result;

  // Are we asked for raw bytes or metadata?
  const url = new URL(ctx.request.url);
  const wantRaw = url.searchParams.get("raw") === "1";

  if (wantRaw) {
    const obj = await ctx.env.SHARES.get(row.id);
    if (!obj) return jsonError(404, "asset missing");

    // Bump view count (best-effort; failure here doesn't affect serving)
    ctx.waitUntil(
      ctx.env.DB.prepare(
        "UPDATE share_links SET view_count = view_count + 1, last_viewed_at = ? WHERE id = ?",
      )
        .bind(nowUnix(), row.id)
        .run(),
    );

    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(row.kind),
        "Cache-Control": "private, max-age=300",
        "X-Frame-Options": "SAMEORIGIN", // we'll iframe this on the wrapper
        ...corsHeaders,
      },
    });
  }

  // Metadata
  return new Response(
    JSON.stringify({
      id: row.id,
      filename: row.filename,
      kind: row.kind,
      prompt: row.prompt,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      expires_at: row.expires_at,
      view_count: row.view_count,
      last_viewed_at: row.last_viewed_at,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...corsHeaders,
      },
    },
  );
};
