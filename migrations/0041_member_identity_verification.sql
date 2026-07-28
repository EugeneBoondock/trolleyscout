-- Encrypted contact values remain in the application layer. These columns hold
-- opaque ciphertext, keyed lookup digests, and verification state only.
ALTER TABLE member_accounts ADD COLUMN phone TEXT;
ALTER TABLE member_accounts ADD COLUMN phone_lookup TEXT;
ALTER TABLE member_accounts ADD COLUMN email_verified_at TEXT;
ALTER TABLE member_accounts ADD COLUMN phone_verified_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_accounts_phone_lookup
  ON member_accounts (phone_lookup)
  WHERE phone_lookup IS NOT NULL;

CREATE TABLE IF NOT EXISTS member_identity_otps (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  destination_lookup TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_member_identity_otps_destination
  ON member_identity_otps (destination_lookup, channel, expires_at DESC);

CREATE TABLE IF NOT EXISTS member_message_campaigns (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  country_code TEXT NOT NULL,
  plan_id TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
