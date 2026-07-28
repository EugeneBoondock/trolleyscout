-- A zero promotion count cannot distinguish a quiet shop from a failed,
-- blocked, or not-yet-checked source. Persist the typed outcome already
-- returned by the store scout so clients can present the real state.
ALTER TABLE store_scout_log
  ADD COLUMN outcome_status TEXT NOT NULL DEFAULT 'unknown'
  CHECK (
    outcome_status IN (
      'checking',
      'empty',
      'permanent_unverified',
      'success',
      'transient_failure',
      'unknown'
    )
  );

CREATE INDEX IF NOT EXISTS idx_store_scout_log_outcome
  ON store_scout_log (outcome_status, next_scout_at);
