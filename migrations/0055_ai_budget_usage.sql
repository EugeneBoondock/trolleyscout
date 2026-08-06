-- What we have spent of each Cloudflare AI allowance, per window.
--
-- The Workers Paid plan includes a fixed amount of each AI resource and bills
-- for anything past it. This table is the meter that keeps the app inside the
-- included amount: every inference, browser render and vector query adds to a
-- row here first, and is refused when the window is already spent.
CREATE TABLE IF NOT EXISTS ai_budget_usage (
  -- "<resource>:<window>", e.g. "neurons:2026-08-07" or "browserSeconds:2026-08".
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  window_key TEXT NOT NULL,
  -- Fractional because a neuron estimate is not a whole number.
  used REAL NOT NULL DEFAULT 0 CHECK (used >= 0),
  -- How many calls made up that spend, for reading the meter later.
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_budget_usage_resource_idx
  ON ai_budget_usage (resource, window_key);
