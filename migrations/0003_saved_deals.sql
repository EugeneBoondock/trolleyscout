CREATE TABLE IF NOT EXISTS member_saved_deals (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  retailer_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  product_url TEXT NOT NULL,
  title TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  price_text TEXT,
  previous_price_text TEXT,
  saving_text TEXT,
  evidence_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  UNIQUE (account_id, product_url)
);

CREATE INDEX IF NOT EXISTS idx_member_saved_deals_account_id
  ON member_saved_deals (account_id);
