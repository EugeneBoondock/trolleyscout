CREATE TABLE IF NOT EXISTS deal_site_refresh_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at INTEGER,
  lease_token TEXT,
  lease_until INTEGER
);

INSERT OR IGNORE INTO deal_site_refresh_state (
  id,
  last_attempt_at,
  lease_token,
  lease_until
) VALUES (1, NULL, NULL, NULL);
