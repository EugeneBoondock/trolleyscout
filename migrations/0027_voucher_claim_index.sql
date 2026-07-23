-- listActiveVouchers left-joins member_voucher_claims on (voucher_id,
-- account_id) for every signed-in read of the voucher list. The existing
-- claims index is account-first (idx_member_voucher_claims_account), which
-- does not serve that join order; add the matching voucher-first index.
CREATE INDEX IF NOT EXISTS idx_member_voucher_claims_voucher
  ON member_voucher_claims (voucher_id, account_id);
