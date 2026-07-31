-- What a member has actually used, counted for the admin console.
--
-- "Deals viewed" read off member_deal_activity, which is the personalisation
-- signal store: it only records for members who opted into deal learning, and
-- nothing in any client ever sent the deal_opened event it counted. So the
-- column was structurally zero for everyone.
--
-- These are counters and nothing else - no titles, no search terms, no product
-- ids. A member who wants no personalisation still gets counted here, because
-- "how many deals has this person opened" is an operational number, not a
-- profile of their shopping.
CREATE TABLE IF NOT EXISTS member_usage_counters (
  account_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN (
    'deal_view',
    'property_view',
    'voucher_view',
    'window_shopping_seconds'
  )),
  value INTEGER NOT NULL DEFAULT 0,
  first_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, metric),
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_usage_metric
  ON member_usage_counters (metric, value DESC);

-- Per-member ceilings an admin sets by hand, overriding whatever the plan
-- allows. NULL means "use the plan", so an untouched member is unaffected.
CREATE TABLE IF NOT EXISTS member_limit_overrides (
  account_id TEXT PRIMARY KEY,
  visible_deals INTEGER,
  visible_catalogues INTEGER,
  scout_messages_per_day INTEGER,
  -- Blocks the surface outright, whatever the plan says.
  scout_chat_blocked INTEGER NOT NULL DEFAULT 0,
  compare_blocked INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);
