-- Opt-in rewarded ads.
--
-- Trolley Scout shows no ad banners. A shopper who cannot spare a subscription
-- may choose to watch a rewarded ad instead, and these two tables are the whole
-- record of that bargain: every view that was counted, and every reward it
-- bought.

-- One row per completed ad. view_id is the ad network's own id for the view,
-- so a replayed or retried report cannot be paid for twice.
CREATE TABLE IF NOT EXISTS ad_reward_views (
  view_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  reward_kind TEXT NOT NULL,
  -- UTC day, so the daily cap can be counted without scanning timestamps.
  day_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- Set when this view was spent on a reward. Unpaid views are the progress
  -- bar toward the next one.
  paid_at TEXT
);

-- The daily cap reads this every time an ad completes.
CREATE INDEX IF NOT EXISTS idx_ad_reward_views_day
  ON ad_reward_views (account_id, day_key);

-- The progress count reads the unpaid views for one reward kind.
CREATE INDEX IF NOT EXISTS idx_ad_reward_views_unpaid
  ON ad_reward_views (account_id, reward_kind, paid_at, created_at);

-- One row per reward actually handed over.
CREATE TABLE IF NOT EXISTS ad_reward_grants (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  reward_kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_reward_grants_account
  ON ad_reward_grants (account_id, reward_kind);
