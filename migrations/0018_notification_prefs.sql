-- Per-member notification opt-ins. Today the only channel is "new deals": a
-- member who opts in wants to hear when fresh deals land. The flag is stored
-- server-side so the choice follows them across devices and gives us the
-- subscriber list for whichever delivery channel runs (the app raises a local
-- notification when it next checks; a future push/email worker can read this).
CREATE TABLE IF NOT EXISTS notification_preferences (
  account_id TEXT PRIMARY KEY,
  new_deals INTEGER NOT NULL DEFAULT 0 CHECK (new_deals IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);
