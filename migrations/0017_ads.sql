-- Advertising platform: any member (a store owner, a brand, or a shopper) can
-- submit an ad. An admin reviews it, and only after approval does the advertiser
-- pay via PayFast. A paid ad goes live as a clearly-labelled "Sponsored" card in
-- the deals feed or on Near me, for the reach (number of people) they chose and
-- an optional province target. Mirrors the member_* conventions: TEXT ids,
-- ISO-8601 TEXT timestamps, CHECK-guarded enums, FK cascade to member_accounts.
CREATE TABLE IF NOT EXISTS ad_submissions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  target_url TEXT NOT NULL,
  image_url TEXT,
  placement TEXT NOT NULL DEFAULT 'feed' CHECK (placement IN ('feed', 'near_me')),
  reach INTEGER NOT NULL CHECK (reach > 0),
  province TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'expired')),
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  onsite_uuid TEXT,
  payment_id TEXT,
  paid_at TEXT,
  expires_at TEXT,
  impressions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES member_accounts (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_submissions_account
  ON ad_submissions (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_submissions_status
  ON ad_submissions (status, created_at DESC);

-- The live feed reads active ads by placement, newest first.
CREATE INDEX IF NOT EXISTS idx_ad_submissions_live
  ON ad_submissions (status, placement, created_at DESC);

-- PayFast ITN idempotency ledger, mirroring billing_events: a completed
-- notification is claimed once by its unique provider event id, so duplicate
-- webhooks never double-activate an ad.
CREATE TABLE IF NOT EXISTS ad_payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'payfast',
  provider_event_id TEXT NOT NULL UNIQUE,
  ad_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_id) REFERENCES ad_submissions (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ad_payment_events_ad
  ON ad_payment_events (ad_id, created_at DESC);
