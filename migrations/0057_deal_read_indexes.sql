-- Indexes for the three queries that were 88.7% of all D1 rows read on this
-- account.
--
-- The health check re-scanned deal_source_runs once per row (18.5 million
-- rows a call), and the deal lists paged with LIMIT/OFFSET, which walks every
-- row before the window and gets worse the deeper a shopper scrolls. The
-- queries are fixed in code; these are the indexes that make the fixed
-- versions cheap rather than merely correct.

-- Both halves of the health check filter on created_at and group by
-- source_key, so this serves the window and the barren-run count.
CREATE INDEX IF NOT EXISTS idx_deal_source_runs_key_created
  ON deal_source_runs (source_key, created_at DESC);

-- The barren-run pass filters on status before counting.
CREATE INDEX IF NOT EXISTS idx_deal_source_runs_status_created
  ON deal_source_runs (status, created_at DESC);

-- Active deals are read in expiry order, filtered by status. This is the
-- covering order for both the browse list and the keyset page that replaces
-- OFFSET: (status, expires_at, id) lets the database seek straight to the
-- page instead of counting up to it.
CREATE INDEX IF NOT EXISTS idx_deal_items_active_page
  ON deal_items (status, expires_at, id);

-- The same list, narrowed to one retailer.
CREATE INDEX IF NOT EXISTS idx_deal_items_retailer_page
  ON deal_items (status, retailer_id, expires_at, id);
