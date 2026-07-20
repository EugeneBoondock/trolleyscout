-- Support messages raised from the public support page. Members and signed-out
-- visitors both write here; the admin console is the only reader.
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_messages_status
  ON support_messages (status, created_at DESC);

-- A member who changes plan or billing cycle authorises a new PayFast
-- subscription, so the one it replaces must be cancelled or they are billed
-- twice. Cancellation happens right after the replacement is confirmed; when
-- that call fails the token is parked here so it stays visible and retryable
-- rather than quietly costing a member money.
CREATE TABLE IF NOT EXISTS billing_cancellations (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'payfast',
  provider_token TEXT NOT NULL,
  status TEXT NOT NULL,
  issue TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_cancellations_token
  ON billing_cancellations (provider, provider_token);

CREATE INDEX IF NOT EXISTS idx_billing_cancellations_status
  ON billing_cancellations (status, created_at DESC);
