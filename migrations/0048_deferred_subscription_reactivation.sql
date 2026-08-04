-- A member who cancelled future billing can authorise the same plan again
-- before their paid period ends without paying twice. PayFast takes R0 for the
-- new authorisation, then starts recurring charges on billing_starts_at.
ALTER TABLE billing_attempts ADD COLUMN initial_amount_cents INTEGER;
ALTER TABLE billing_attempts ADD COLUMN billing_starts_at TEXT;
ALTER TABLE billing_attempts ADD COLUMN initial_payment_id TEXT;

