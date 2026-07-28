CREATE TABLE IF NOT EXISTS developer_api_keys (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_account
  ON developer_api_keys (account_id, revoked_at, created_at DESC);

CREATE TABLE IF NOT EXISTS developer_oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL
    CHECK (token_endpoint_auth_method IN ('none', 'client_secret_post')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS developer_oauth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_developer_oauth_codes_expiry
  ON developer_oauth_codes (expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS developer_oauth_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_developer_oauth_access_expiry
  ON developer_oauth_access_tokens (expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS developer_oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  replaced_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_id) REFERENCES developer_oauth_refresh_tokens (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_developer_oauth_refresh_expiry
  ON developer_oauth_refresh_tokens (expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS developer_usage_monthly (
  account_id TEXT NOT NULL,
  usage_month TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, usage_month),
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS developer_rate_windows (
  account_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  PRIMARY KEY (account_id, window_start),
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS developer_call_audit (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  account_id TEXT,
  credential_type TEXT NOT NULL
    CHECK (credential_type IN ('api_key', 'oauth', 'session', 'unknown')),
  credential_id TEXT,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_developer_call_audit_account
  ON developer_call_audit (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_publication_destinations (
  publication_id TEXT NOT NULL,
  destination TEXT NOT NULL
    CHECK (destination IN ('marketplace', 'window', 'stories')),
  PRIMARY KEY (publication_id, destination),
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO organization_publication_destinations (publication_id, destination)
SELECT id, 'marketplace'
FROM organization_publications
WHERE placement IN ('marketplace', 'both');

INSERT OR IGNORE INTO organization_publication_destinations (publication_id, destination)
SELECT id, 'window'
FROM organization_publications
WHERE placement IN ('window', 'both');

CREATE TABLE IF NOT EXISTS organization_publication_metrics_daily (
  publication_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  destination TEXT NOT NULL
    CHECK (destination IN ('marketplace', 'window', 'stories')),
  impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  image_views INTEGER NOT NULL DEFAULT 0 CHECK (image_views >= 0),
  saves INTEGER NOT NULL DEFAULT 0 CHECK (saves >= 0),
  link_clicks INTEGER NOT NULL DEFAULT 0 CHECK (link_clicks >= 0),
  PRIMARY KEY (publication_id, event_date, destination),
  FOREIGN KEY (publication_id) REFERENCES organization_publications (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_publication_metrics_date
  ON organization_publication_metrics_daily (event_date, destination);

INSERT OR IGNORE INTO organization_publication_metrics_daily (
  publication_id,
  event_date,
  destination,
  impressions,
  image_views,
  saves,
  link_clicks
)
SELECT
  publication_id,
  event_date,
  'marketplace',
  impressions,
  opens,
  saves,
  outbound_visits
FROM organization_publication_events_daily;
