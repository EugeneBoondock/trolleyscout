-- Items shoppers searched for but no deal existed yet. The scouts match new
-- deals against these watches; a match becomes an alert the member sees on
-- their next visit (bell badge) until they dismiss it.
CREATE TABLE IF NOT EXISTS deal_watches (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  created_at TEXT NOT NULL,
  matched_at TEXT,
  matched_deals_json TEXT,
  seen_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_watches_account_query
  ON deal_watches (account_id, normalized_query);

CREATE INDEX IF NOT EXISTS deal_watches_pending
  ON deal_watches (matched_at) WHERE matched_at IS NULL;
