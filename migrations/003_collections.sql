-- Share collections — a named, ordered set of share_links presented
-- together as a single review URL (grid/slideshow). One link, all the
-- mockups, per-item decisions.

CREATE TABLE IF NOT EXISTS share_collections (
  id          TEXT PRIMARY KEY,
  device_id   TEXT NOT NULL,
  prompt      TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_share_collections_device
  ON share_collections(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS share_collection_items (
  collection_id  TEXT NOT NULL REFERENCES share_collections(id) ON DELETE CASCADE,
  idx            INTEGER NOT NULL,
  share_id       TEXT NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  PRIMARY KEY (collection_id, idx)
);
