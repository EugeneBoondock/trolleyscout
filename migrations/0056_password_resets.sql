-- One-time codes for resetting a forgotten password.
--
-- Kept apart from member_identity_otps deliberately: that table proves someone
-- already signed in still controls an address, while this one hands out a new
-- password to someone who cannot sign in at all. Mixing them would let a
-- verification code reset a password.
--
-- Only a hash of the code is stored, so a copy of this table is not a set of
-- working reset codes.
CREATE TABLE IF NOT EXISTS member_password_resets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  -- The same keyed digest used for account lookup, never the address itself.
  email_lookup TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_password_resets_lookup
  ON member_password_resets (email_lookup, expires_at DESC);
