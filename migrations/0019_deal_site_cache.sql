-- Cache of the external deal-site feeds (OneDayOnly, Hyperli, Daddy's Deals,
-- MyRunway). One row per site so a single site failing to respond never blanks
-- the others; the /api/deal-sites endpoint reads all rows and refreshes stale
-- ones in the background. Payloads are normalized DealSiteItem JSON arrays.
CREATE TABLE IF NOT EXISTS deal_site_cache (
  source_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
