-- Member moderation and presence.
--
-- status/banned_at/ban_reason let an admin close an account without deleting
-- it: the row, its saved deals and its support history all survive, but every
-- session stops resolving so the person is signed out everywhere at once.
--
-- last_seen_at answers "when were they last online". It is stamped from the
-- session lookup at most once every few minutes, so the hot path stays a read
-- for all but the first request of a visit.
ALTER TABLE member_accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE member_accounts ADD COLUMN banned_at TEXT;
ALTER TABLE member_accounts ADD COLUMN ban_reason TEXT;
ALTER TABLE member_accounts ADD COLUMN last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS idx_member_accounts_status
  ON member_accounts (status);

CREATE INDEX IF NOT EXISTS idx_member_accounts_last_seen
  ON member_accounts (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_accounts_created
  ON member_accounts (created_at);
