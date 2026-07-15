CREATE TABLE IF NOT EXISTS billing_attempts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'payfast',
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'created',
  onsite_uuid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'payfast',
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_token TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'payfast',
  provider_event_id TEXT NOT NULL UNIQUE,
  payment_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (attempt_id) REFERENCES billing_attempts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_billing_attempts_account_id
  ON billing_attempts (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_attempts_status
  ON billing_attempts (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_billing_events_attempt_id
  ON billing_events (attempt_id, created_at DESC);
