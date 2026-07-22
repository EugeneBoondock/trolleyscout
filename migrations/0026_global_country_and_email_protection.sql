-- Migration number: 0026 	 2026-07-21T18:36:07.832Z
-- Global country context and application-level email protection.
-- Email values stay in the existing columns, but new values are AES-GCM
-- ciphertext. The keyed lookup columns preserve case-insensitive login and
-- support-message throttling without storing a reversible search key.
ALTER TABLE member_accounts ADD COLUMN email_lookup TEXT;
ALTER TABLE member_accounts ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE member_accounts ADD COLUMN country_name TEXT NOT NULL DEFAULT 'South Africa';
ALTER TABLE member_accounts ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'ZAR';

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_accounts_email_lookup
  ON member_accounts (email_lookup)
  WHERE email_lookup IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_member_accounts_country
  ON member_accounts (country_code, created_at DESC);

ALTER TABLE support_messages ADD COLUMN email_lookup TEXT;

CREATE INDEX IF NOT EXISTS idx_support_messages_email_lookup
  ON support_messages (email_lookup, created_at DESC);

-- Country tags keep worldwide store, promotion, and property caches separate.
ALTER TABLE nearby_store_cache ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE discovered_stores ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE store_promotions ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE property_cache ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';

CREATE INDEX IF NOT EXISTS idx_nearby_store_cache_country
  ON nearby_store_cache (country_code, expires_at);

CREATE INDEX IF NOT EXISTS idx_discovered_stores_country
  ON discovered_stores (country_code, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_promotions_country
  ON store_promotions (country_code, expires_at);

CREATE INDEX IF NOT EXISTS idx_property_cache_country
  ON property_cache (country_code, fetched_at DESC);

-- Live country retailer directories are found through the existing web-search
-- scout and refreshed weekly. South Africa continues to use its verified list.
CREATE TABLE IF NOT EXISTS country_retailer_cache (
  country_code TEXT PRIMARY KEY,
  retailers_json TEXT NOT NULL CHECK (json_valid(retailers_json)),
  checked_at TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0
);

-- Display-only exchange rates. PayFast still receives the authoritative rand
-- amount, and the UI labels converted prices as estimates.
CREATE TABLE IF NOT EXISTS country_exchange_rates (
  currency_code TEXT PRIMARY KEY,
  rate_from_zar REAL NOT NULL CHECK (rate_from_zar > 0),
  rate_date TEXT,
  fetched_at TEXT NOT NULL
);
