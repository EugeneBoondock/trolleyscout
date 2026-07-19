-- One row represents the new deals found by one completed refresh. Devices
-- keep their own cursor, so reading a batch never consumes it for another
-- signed-in phone.
CREATE TABLE IF NOT EXISTS deal_alert_batches (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_fingerprint TEXT NOT NULL UNIQUE CHECK (length(batch_fingerprint) = 64),
  deal_count INTEGER NOT NULL CHECK (deal_count BETWEEN 1 AND 5000),
  deal_keys_json TEXT NOT NULL CHECK (
    json_valid(deal_keys_json)
    AND json_type(deal_keys_json) = 'array'
    AND json_array_length(deal_keys_json) = deal_count
  ),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deal_alert_batches_created
  ON deal_alert_batches (created_at DESC);
