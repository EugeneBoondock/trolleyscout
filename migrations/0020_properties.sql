-- Properties Scout — a Household-tier tool that searches the SA property portals
-- (Property24, Private Property) for homes to buy or rent.

-- Per-search result cache plus the Property24 location catalogue. One row per
-- (portal, listing type, location id, page); the catalogue lives under the
-- reserved key '__p24_locations__'. Payloads are normalized PropertyListing[]
-- (or the raw catalogue) as JSON. Stale rows are refetched on the next search.
CREATE TABLE IF NOT EXISTS property_cache (
  cache_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-member entitlement for Properties Scout. The Household plan and admins
-- always have access; this flag lets an admin grant it to any single member.
ALTER TABLE member_accounts ADD COLUMN properties_access INTEGER NOT NULL DEFAULT 0;
