CREATE TABLE IF NOT EXISTS verified_offers (
  id TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_to TEXT NOT NULL,
  price_text TEXT NOT NULL,
  saving_text TEXT,
  terms_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verified_offers_retailer_id
  ON verified_offers (retailer_id);

CREATE INDEX IF NOT EXISTS idx_verified_offers_valid_to
  ON verified_offers (valid_to);
