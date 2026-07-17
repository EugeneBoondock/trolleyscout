CREATE TABLE IF NOT EXISTS discovered_stores (
  place_id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  address TEXT,
  website TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  retailer_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_source_tile TEXT,
  last_scout_at TEXT,
  next_scout_at TEXT NOT NULL,
  promotion_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS discovered_stores_last_seen_idx
  ON discovered_stores (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS discovered_stores_retailer_idx
  ON discovered_stores (retailer_id);

CREATE INDEX IF NOT EXISTS discovered_stores_next_scout_idx
  ON discovered_stores (next_scout_at, last_seen_at DESC);
