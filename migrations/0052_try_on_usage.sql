-- One row per member per calendar month, counting completed try-on renders.
-- Quotas are per month and reset by the month key rather than by a job.
CREATE TABLE IF NOT EXISTS try_on_usage (
  account_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, month_key)
);
