-- Window Shopping social + cross-device account data.

-- Per-account key/value state so a shopper's on-device data (near-me search
-- history, saved addresses, taste profile) survives logout, reinstall, and new
-- devices. One row per (account, key); the value is an opaque JSON blob owned
-- by the client feature that writes it.
CREATE TABLE IF NOT EXISTS member_state (
  account_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, state_key)
);

-- Window Shopping saves, in the database so the count is global ("X saves"),
-- the list syncs across devices, and a save is pruned when its deal leaves the
-- live feed. deal_json renders the saved deal without the live feed.
CREATE TABLE IF NOT EXISTS window_saves (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  source TEXT,
  deal_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_window_saves_deal ON window_saves (deal_id);
CREATE INDEX IF NOT EXISTS idx_window_saves_account ON window_saves (account_id, created_at);

-- Comments on Window Shopping deals. Tied to the deal id, so they are pruned
-- (with the deal) once it leaves the live feed.
CREATE TABLE IF NOT EXISTS deal_comments (
  id TEXT PRIMARY KEY,
  deal_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_deal_comments_deal ON deal_comments (deal_id, created_at);
