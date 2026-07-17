-- Normalized, source-backed specials. A deal identity is the retailer's
-- product and promotion inside one explicit price scope. Date-only campaign
-- ends are converted by the Worker to Johannesburg end-of-day before insert.
CREATE TABLE IF NOT EXISTS deal_items (
  id TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  last_run_id TEXT NOT NULL REFERENCES deal_source_runs(id),
  source_product_id TEXT NOT NULL,
  promotion_id TEXT NOT NULL,
  title TEXT NOT NULL,
  current_price_cents INTEGER NOT NULL CHECK (current_price_cents >= 0),
  previous_price_cents INTEGER CHECK (
    previous_price_cents IS NULL OR previous_price_cents >= 0
  ),
  image_url TEXT,
  saving_text TEXT,
  terms_text TEXT,
  unit_text TEXT,
  evidence_text TEXT NOT NULL,
  product_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('structured', 'catalogue')),
  captured_at TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  expires_at TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (
    scope_type IN ('national', 'online', 'province', 'store')
  ),
  scope_store_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scope_store_ids)),
  scope_region_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scope_region_ids)),
  excluded_store_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(excluded_store_ids)),
  scope_key TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL CHECK (length(content_fingerprint) = 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive', 'expired')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  CHECK (
    (scope_type IN ('national', 'online')
      AND json_array_length(scope_store_ids) = 0
      AND json_array_length(scope_region_ids) = 0)
    OR (scope_type = 'province'
      AND json_array_length(scope_store_ids) = 0
      AND json_array_length(scope_region_ids) > 0)
    OR (scope_type = 'store'
      AND json_array_length(scope_store_ids) > 0
      AND json_array_length(scope_region_ids) = 0)
  ),
  UNIQUE (retailer_id, source_product_id, promotion_id, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_deal_items_active_expiry
  ON deal_items (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_deal_items_retailer_active
  ON deal_items (retailer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_deal_items_scope_active
  ON deal_items (scope_type, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_deal_items_source_active
  ON deal_items (source_key, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_deal_items_last_run
  ON deal_items (last_run_id);
CREATE INDEX IF NOT EXISTS idx_deal_items_product
  ON deal_items (retailer_id, source_product_id, promotion_id);

-- One audit row per adapter attempt. Failed attempts are recorded without
-- deleting or deactivating previously valid deal rows.
CREATE TABLE IF NOT EXISTS deal_source_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  retailer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  written_count INTEGER NOT NULL DEFAULT 0 CHECK (written_count >= 0),
  error_text TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_source_runs_source_finished
  ON deal_source_runs (source_key, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_source_runs_status_finished
  ON deal_source_runs (status, finished_at DESC);

-- Cursor shape is stored explicitly so offset, page, and opaque token cursors
-- round-trip without converting one variant into another.
CREATE TABLE IF NOT EXISTS deal_source_cursors (
  source_key TEXT PRIMARY KEY,
  cursor_kind TEXT NOT NULL CHECK (cursor_kind IN ('offset', 'page', 'token')),
  cursor_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_source_cursors_updated
  ON deal_source_cursors (updated_at);

-- These triggers keep the audit count inside the same transaction as each
-- accepted insert or update. A stale conflict does not mutate the deal row, so
-- it fires neither trigger and contributes no write to the source run.
CREATE TRIGGER IF NOT EXISTS trg_deal_items_count_run_insert
AFTER INSERT ON deal_items
BEGIN
  UPDATE deal_source_runs
  SET written_count = written_count + 1
  WHERE id = NEW.last_run_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_deal_items_count_run_update
AFTER UPDATE OF last_run_id ON deal_items
WHEN NEW.last_run_id <> OLD.last_run_id
BEGIN
  UPDATE deal_source_runs
  SET written_count = written_count + 1
  WHERE id = NEW.last_run_id;
END;
