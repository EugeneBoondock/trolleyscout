-- Migration number: 0031 	 2026-07-25T17:10:00.000Z
-- Records whether a member's country was actually established, or merely
-- defaulted.
--
-- Migration 0026 added country_code as NOT NULL DEFAULT 'ZA', so every account
-- that existed before it was stamped South Africa. The login path tries to
-- backfill with COALESCE(country_code, ?), which only ever fills a NULL — and
-- no row can be NULL — so that backfill has never once fired. A member in the
-- Netherlands has been reading South African prices with no way to say
-- otherwise, because a defaulted country is indistinguishable from a chosen one.
--
-- This column draws that distinction. NULL means "nobody has established this",
-- and login is free to set it from where the member actually is. Once stamped,
-- it is left alone, so a traveller or VPN user is not flipped on every sign-in.
ALTER TABLE member_accounts ADD COLUMN country_confirmed_at TEXT;

-- A country that is not the default could only have come from real detection,
-- so it is trusted as it stands. The remaining accounts hold 'ZA', which is
-- exactly what the default produced, and nothing in the row distinguishes a
-- genuine South African from an account that was never asked. Those are left
-- unconfirmed and settle themselves on the member's next sign-in.
UPDATE member_accounts
  SET country_confirmed_at = updated_at
  WHERE country_code IS NOT NULL AND country_code <> 'ZA';
