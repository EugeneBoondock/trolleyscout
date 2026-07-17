CREATE TABLE IF NOT EXISTS catalogue_scan_leases (
  source_key TEXT PRIMARY KEY,
  owner_token TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogue_scan_leases_expiry
  ON catalogue_scan_leases (expires_at);
