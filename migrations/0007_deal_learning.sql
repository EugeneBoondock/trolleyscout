CREATE TABLE IF NOT EXISTS member_preferences (
  account_id TEXT PRIMARY KEY,
  deal_learning_enabled INTEGER NOT NULL DEFAULT 1 CHECK (deal_learning_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_deal_activity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  normalized_term TEXT,
  title TEXT,
  retailer_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_interest_weights (
  account_id TEXT NOT NULL,
  interest_type TEXT NOT NULL,
  interest_key TEXT NOT NULL,
  weight REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, interest_type, interest_key),
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_deal_activity_account_created
  ON member_deal_activity (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_deal_activity_created
  ON member_deal_activity (created_at);

CREATE INDEX IF NOT EXISTS idx_member_interest_weights_account_weight
  ON member_interest_weights (account_id, weight DESC);
