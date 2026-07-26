-- A shop whose feed dies does not report an error. It reports nothing, which
-- looks exactly like a shop having a quiet week, and the app goes on serving an
-- empty aisle until somebody screenshots it. Checkers sat at zero for days
-- while holding 88 live catalogue deals, and nothing anywhere said so.
--
-- One row per retailer per sweep. That history is the whole point: "Shoprite
-- has 0 deals" is not actionable on its own, but "Shoprite had 615 yesterday
-- and has 0 now" is an alarm, and it can only be told from the two together.
CREATE TABLE IF NOT EXISTS source_health_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retailer_id TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'ZA',
  active_deal_count INTEGER NOT NULL CHECK (active_deal_count >= 0),
  captured_at TEXT NOT NULL
);

-- Every read asks the same question — what has this retailer looked like
-- lately — so the index carries the retailer and the clock together.
CREATE INDEX IF NOT EXISTS idx_source_health_retailer_time
  ON source_health_snapshots (retailer_id, captured_at DESC);

-- Pruning walks by age alone.
CREATE INDEX IF NOT EXISTS idx_source_health_captured_at
  ON source_health_snapshots (captured_at);
