CREATE TABLE IF NOT EXISTS scout_chat_usage (
  account_id TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, window_started_at),
  FOREIGN KEY (account_id) REFERENCES member_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scout_chat_usage_updated
  ON scout_chat_usage(updated_at);
