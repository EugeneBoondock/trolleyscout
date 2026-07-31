-- Checkout codes: the thing a shopper pastes into a promo-code box.
--
-- Voucher Scout collected loyalty prices (Xtra Savings, Smart Shopper) and
-- Amazon clip coupons. Neither is a code you can type at checkout, which is
-- what a voucher means to a shopper.
--
-- Codes were not scrapeable from anywhere honest. Retailers do not publish
-- them on their own promotion pages, and the coupon aggregators deliberately
-- hide the value behind a "reveal" click that only resolves on their outbound
-- redirect - Picodi ships no code in its markup at all. What is left is what
-- Honey itself is built on: codes people submit, ranked by whether they
-- actually worked, plus licensed affiliate feeds.
CREATE TABLE IF NOT EXISTS voucher_codes (
  id TEXT PRIMARY KEY,
  retailer_id TEXT NOT NULL,
  -- Stored uppercase and trimmed. The unique index below is what stops the
  -- same code being submitted twice for one shop.
  code TEXT NOT NULL,
  benefit_text TEXT NOT NULL,
  terms_text TEXT,
  minimum_spend_text TEXT,
  valid_to TEXT,
  -- 'member' for a shopper submission, 'affiliate:<network>' for a licensed
  -- feed. Shown to the shopper, because where a code came from is the honest
  -- substitute for the checkout testing we cannot do.
  source TEXT NOT NULL DEFAULT 'member',
  source_url TEXT,
  submitted_by TEXT,
  worked_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  -- 'active' | 'retired'. A code that keeps failing is retired rather than
  -- left to waste the next shopper's time at checkout.
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_worked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_codes_identity
  ON voucher_codes (retailer_id, code);

CREATE INDEX IF NOT EXISTS idx_voucher_codes_ranking
  ON voucher_codes (status, retailer_id, worked_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_voucher_codes_expiry
  ON voucher_codes (status, valid_to);

-- One verdict per shopper per code. Changing your mind updates the row rather
-- than stacking another vote, so nobody can bury a code by tapping twice.
CREATE TABLE IF NOT EXISTS voucher_code_votes (
  voucher_code_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  worked INTEGER NOT NULL CHECK (worked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (voucher_code_id, account_id),
  FOREIGN KEY (voucher_code_id) REFERENCES voucher_codes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_voucher_code_votes_account
  ON voucher_code_votes (account_id, updated_at DESC);
