-- Bought or granted fittings that survive the month, spent only once the
-- plan's monthly allowance is used up.
CREATE TABLE IF NOT EXISTS try_on_credits (
  account_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TEXT NOT NULL
);

-- Every movement, so an admin grant and a paid top-up are both accountable.
CREATE TABLE IF NOT EXISTS try_on_credit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_try_on_credit_events_account
  ON try_on_credit_events (account_id, created_at DESC);
