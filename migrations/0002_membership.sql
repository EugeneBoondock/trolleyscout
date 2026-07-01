CREATE TABLE IF NOT EXISTS member_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  plan_id TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS member_sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_saved_sources (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  retailer_id TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  UNIQUE (account_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_member_sessions_account_id
  ON member_sessions (account_id);

CREATE INDEX IF NOT EXISTS idx_member_sessions_expires_at
  ON member_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_member_saved_sources_account_id
  ON member_saved_sources (account_id);
