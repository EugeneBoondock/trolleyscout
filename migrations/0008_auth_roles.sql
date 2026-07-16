-- Real credentials and roles for member accounts.
-- Existing accounts predate passwords: password_hash stays NULL until the
-- owner sets one, and those accounts cannot log in until they do.
ALTER TABLE member_accounts ADD COLUMN password_hash TEXT;
ALTER TABLE member_accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

CREATE INDEX IF NOT EXISTS idx_member_accounts_role ON member_accounts (role);
