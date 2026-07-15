CREATE TABLE IF NOT EXISTS deal_snapshots (
  source_key TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  deals_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
