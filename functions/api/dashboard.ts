// GET /api/dashboard?secret=<DASH_SECRET>&days=30
// Returns aggregate counts per event type + version + DAU estimate over the
// requested window. Read-only. Secret-gated to stop random scrapers.

interface Env {
  DB: D1Database;
  DASH_SECRET?: string;
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const secret = url.searchParams.get("secret");
  if (!ctx.env.DASH_SECRET || secret !== ctx.env.DASH_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "30", 10), 1), 365);
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;

  const [totals, byVersion, dau, latencies] = await Promise.all([
    ctx.env.DB.prepare(
      "SELECT event_type, COUNT(*) AS n FROM events WHERE ts >= ? GROUP BY event_type ORDER BY n DESC",
    )
      .bind(since)
      .all(),
    ctx.env.DB.prepare(
      "SELECT app_version, COUNT(DISTINCT device_id) AS devices FROM events WHERE ts >= ? GROUP BY app_version ORDER BY devices DESC",
    )
      .bind(since)
      .all(),
    ctx.env.DB.prepare(
      "SELECT date(ts, 'unixepoch') AS day, COUNT(DISTINCT device_id) AS active FROM events WHERE ts >= ? GROUP BY day ORDER BY day DESC",
    )
      .bind(since)
      .all(),
    ctx.env.DB.prepare(
      "SELECT json_extract(payload_json, '$.latency_ms') AS ms FROM events WHERE event_type = 'review_resolved' AND ts >= ? AND ms IS NOT NULL ORDER BY ms",
    )
      .bind(since)
      .all(),
  ]);

  const sortedLatencies = (latencies.results || [])
    .map((r) => Number((r as { ms: number }).ms))
    .filter((n) => Number.isFinite(n));
  const p = (q: number) => {
    if (sortedLatencies.length === 0) return null;
    const idx = Math.floor(q * (sortedLatencies.length - 1));
    return sortedLatencies[idx];
  };

  return new Response(
    JSON.stringify({
      window_days: days,
      since: new Date(since * 1000).toISOString(),
      totals: totals.results,
      by_version: byVersion.results,
      dau: dau.results,
      decision_latency_ms: {
        count: sortedLatencies.length,
        p50: p(0.5),
        p90: p(0.9),
        p99: p(0.99),
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
};
