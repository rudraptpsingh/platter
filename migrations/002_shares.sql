-- Public review links — for sharing a single asset with a teammate or
-- client who doesn't have platter installed. They click the link, see
-- a vermilion-stamp wrapper page, and can approve/reject/iterate. The
-- decision lands here; the platter app polls and surfaces it.

CREATE TABLE IF NOT EXISTS share_links (
  id              TEXT PRIMARY KEY,                   -- short random id, used in the URL slug
  device_id       TEXT NOT NULL,                      -- anon UUID of the platter that minted this link
  filename        TEXT NOT NULL,                      -- original filename (e.g. hero-variant-A.html)
  kind            TEXT NOT NULL,                      -- html | htm | png | jpg | jpeg | gif | svg | webp | pdf | md
  prompt          TEXT,                               -- optional question to show the reviewer
  size_bytes      INTEGER NOT NULL,                   -- asset payload size, for budget caps
  expires_at      INTEGER,                            -- unix ts; null = never (rare; default 7d)
  created_at      INTEGER NOT NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  last_viewed_at  INTEGER,
  revoked_at      INTEGER                              -- creator can kill a link (404 thereafter)
);

CREATE INDEX IF NOT EXISTS idx_share_links_device ON share_links(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_links_expiry ON share_links(expires_at);

CREATE TABLE IF NOT EXISTS share_decisions (
  id              TEXT PRIMARY KEY,
  share_id        TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  decision        TEXT NOT NULL,                      -- approved | rejected | iterated
  note            TEXT,                               -- optional reviewer feedback (capped 4KB server-side)
  reviewer_name   TEXT,                               -- self-reported, optional
  ip_hash         TEXT,                               -- sha256(ip + share_id), for spam dedup; never raw IP
  decided_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_decisions_share ON share_decisions(share_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_decisions_dedup ON share_decisions(share_id, ip_hash);
