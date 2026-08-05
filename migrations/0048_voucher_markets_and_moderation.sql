-- Keep voucher inventory local to the shopper's market. Existing rows came
-- from South African sources, so the backfill default is intentionally ZA.
ALTER TABLE vouchers ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE voucher_codes ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';

-- New member submissions are visible as unconfirmed until another shopper
-- reports that the code worked. Licensed affiliate rows may enter approved.
ALTER TABLE voucher_codes ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'unconfirmed'
  CHECK (moderation_status IN ('unconfirmed', 'approved'));

DROP INDEX IF EXISTS idx_voucher_codes_identity;
CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_codes_market_identity
  ON voucher_codes (country_code, retailer_id, code);

DROP INDEX IF EXISTS idx_voucher_codes_ranking;
CREATE INDEX IF NOT EXISTS idx_voucher_codes_market_ranking
  ON voucher_codes (
    country_code,
    status,
    moderation_status,
    retailer_id,
    worked_count DESC,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_vouchers_market_active
  ON vouchers (country_code, status, expires_at);
