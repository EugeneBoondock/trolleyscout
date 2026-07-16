-- Global, location-based store discovery and promotions cache.
-- Everything here expires: a passed expires_at means the row is stale and the
-- scheduled scout deletes it, so users never see an out-of-date special.

-- One row per ~5.5km tile: the supermarkets discovered near that location.
-- Shared across every user in the tile so we only hit Geoapify occasionally.
CREATE TABLE IF NOT EXISTS nearby_store_cache (
  tile_key TEXT PRIMARY KEY,
  stores_json TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nearby_store_cache_expires ON nearby_store_cache (expires_at);

-- Deals and catalogues found for a specific store, saved globally so the next
-- shopper near that store reuses them. valid_to drives expiry: once the
-- special's end date has passed the row is removed.
CREATE TABLE IF NOT EXISTS store_promotions (
  id TEXT PRIMARY KEY,
  place_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  retailer_id TEXT,
  kind TEXT NOT NULL DEFAULT 'deal', -- 'deal' | 'catalogue'
  title TEXT NOT NULL,
  price_text TEXT,
  previous_price_text TEXT,
  saving_text TEXT,
  source_url TEXT NOT NULL,
  product_url TEXT,
  image_url TEXT,
  valid_from TEXT,
  valid_to TEXT,
  captured_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_store_promotions_place ON store_promotions (place_id);
CREATE INDEX IF NOT EXISTS idx_store_promotions_expires ON store_promotions (expires_at);

-- Tracks when each store was last scouted so we do not re-scan a store's
-- website on every visitor — only after its promotions age out.
CREATE TABLE IF NOT EXISTS store_scout_log (
  place_id TEXT PRIMARY KEY,
  store_name TEXT NOT NULL,
  website TEXT,
  retailer_id TEXT,
  scouted_at TEXT NOT NULL,
  next_scout_at TEXT NOT NULL,
  promotion_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_store_scout_log_next ON store_scout_log (next_scout_at);
