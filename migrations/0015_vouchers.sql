CREATE TABLE IF NOT EXISTS voucher_source_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  retailer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  written_count INTEGER NOT NULL DEFAULT 0 CHECK (written_count >= 0),
  error_text TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE CHECK (length(identity_key) = 64),
  last_run_id TEXT NOT NULL REFERENCES voucher_source_runs(id),
  retailer_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  external_voucher_id TEXT NOT NULL,
  product_id TEXT,
  product_title TEXT,
  title TEXT NOT NULL,
  benefit_text TEXT NOT NULL,
  terms_text TEXT,
  evidence_text TEXT NOT NULL,
  voucher_kind TEXT NOT NULL CHECK (
    voucher_kind IN ('loyalty_offer', 'product_coupon', 'public_code')
  ),
  redemption_mode TEXT NOT NULL CHECK (
    redemption_mode IN ('automatic', 'clip', 'code', 'loyalty')
  ),
  redemption_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  image_url TEXT,
  public_reusable INTEGER NOT NULL DEFAULT 0 CHECK (public_reusable IN (0, 1)),
  public_code TEXT,
  code_hash TEXT CHECK (code_hash IS NULL OR length(code_hash) = 64),
  account_required INTEGER NOT NULL DEFAULT 0 CHECK (account_required IN (0, 1)),
  captured_at TEXT NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  expires_at TEXT NOT NULL,
  content_fingerprint TEXT NOT NULL CHECK (length(content_fingerprint) = 64),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  CHECK (
    (public_reusable = 0 AND public_code IS NULL AND code_hash IS NULL)
    OR (public_reusable = 1 AND public_code IS NOT NULL AND code_hash IS NOT NULL)
  ),
  CHECK (voucher_kind <> 'public_code' OR public_reusable = 1)
);

CREATE TRIGGER IF NOT EXISTS trg_vouchers_count_written_insert
AFTER INSERT ON vouchers
BEGIN
  UPDATE voucher_source_runs
  SET written_count = written_count + 1
  WHERE id = NEW.last_run_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vouchers_count_written_update
AFTER UPDATE OF last_run_id ON vouchers
WHEN OLD.last_run_id <> NEW.last_run_id
BEGIN
  UPDATE voucher_source_runs
  SET written_count = written_count + 1
  WHERE id = NEW.last_run_id;
END;

CREATE INDEX IF NOT EXISTS idx_vouchers_active_expiry
  ON vouchers (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_retailer_active
  ON vouchers (retailer_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_product_active
  ON vouchers (retailer_id, product_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vouchers_source_active
  ON vouchers (source_key, status, expires_at);

CREATE TABLE IF NOT EXISTS member_voucher_claims (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES member_accounts(id) ON DELETE CASCADE,
  voucher_id TEXT NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL,
  UNIQUE (account_id, voucher_id)
);

CREATE INDEX IF NOT EXISTS idx_member_voucher_claims_account
  ON member_voucher_claims (account_id, claimed_at DESC);

CREATE TABLE IF NOT EXISTS voucher_source_cursors (
  source_key TEXT PRIMARY KEY,
  cursor_kind TEXT NOT NULL CHECK (cursor_kind IN ('offset', 'page', 'token')),
  cursor_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
