-- Shopper reports for deal accuracy. Reports stay tied to the source row that
-- was shown, so an admin can review the claim against the exact evidence.
CREATE TABLE IF NOT EXISTS deal_reports (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  retailer_id TEXT NOT NULL,
  retailer_name TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  product_url TEXT,
  reason TEXT NOT NULL CHECK (
    reason IN ('price_wrong', 'expired', 'unavailable', 'wrong_item', 'other')
  ),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'dismissed', 'resolved')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, deal_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_reports_moderation
  ON deal_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_reports_deal
  ON deal_reports (deal_id, created_at DESC);
