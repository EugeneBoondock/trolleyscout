-- Garments the clothing scout reads from fashion storefronts. Unlike
-- deal_items these are not markdowns: the fitting room needs a shop's whole
-- rail, priced and pictured, whether or not anything is on sale today.
CREATE TABLE IF NOT EXISTS clothing_items (
  id TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  retailer_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  previous_price_cents INTEGER CHECK (
    previous_price_cents IS NULL OR previous_price_cents > 0
  ),
  image_url TEXT NOT NULL,
  product_url TEXT NOT NULL,
  in_stock INTEGER NOT NULL DEFAULT 1,
  audience TEXT NOT NULL DEFAULT 'any',
  garment_type TEXT NOT NULL DEFAULT 'any',
  country_code TEXT NOT NULL DEFAULT 'ZA',
  currency_code TEXT NOT NULL DEFAULT 'ZAR',
  captured_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (retailer_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_clothing_items_browse
  ON clothing_items (country_code, in_stock, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_clothing_items_facets
  ON clothing_items (country_code, audience, garment_type);
CREATE INDEX IF NOT EXISTS idx_clothing_items_retailer
  ON clothing_items (retailer_id, last_seen_at DESC);

-- One row per store sweep, so a shop that quietly stops answering is visible
-- rather than merely absent.
CREATE TABLE IF NOT EXISTS clothing_source_runs (
  id TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'empty', 'failed')),
  product_count INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  finished_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clothing_source_runs_retailer
  ON clothing_source_runs (retailer_id, finished_at DESC);
