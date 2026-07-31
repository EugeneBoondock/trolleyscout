-- Voucher sources the scout found for itself.
--
-- Voucher pages were a hand-written list of four URLs. Two of them had rotted
-- silently — the Woolworths one served a store-card article and Yuppiechef had
-- moved /specials.htm to /promotions.htm — and nothing noticed, so the wall sat
-- on Amazon alone. Deals already discover their own sources; vouchers now do
-- the same, and a source that stops yielding is retired rather than retried
-- forever.
CREATE TABLE IF NOT EXISTS voucher_discovered_sources (
  source_key TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  url TEXT NOT NULL,
  -- 'amazon' | 'promotion-sweep' | 'public-code'
  parser TEXT NOT NULL,
  -- How many voucher candidates the probe read off the page.
  candidate_count INTEGER NOT NULL DEFAULT 0,
  -- Consecutive probes that found nothing. A source is retired at the limit
  -- rather than dropped on one bad day, since shops go down.
  empty_streak INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired')),
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_checked_at TEXT,
  last_yield_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_voucher_discovered_active
  ON voucher_discovered_sources (status, last_checked_at);

CREATE INDEX IF NOT EXISTS idx_voucher_discovered_retailer
  ON voucher_discovered_sources (retailer_id, status);

-- Paths already probed for a retailer, so a sweep does not spend its request
-- budget re-checking the same dead URL every run.
CREATE TABLE IF NOT EXISTS voucher_source_probes (
  probe_key TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  url TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'empty', 'unreachable')),
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voucher_source_probes_checked
  ON voucher_source_probes (checked_at);
