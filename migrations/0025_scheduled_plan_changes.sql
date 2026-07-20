-- Plan changes used to take effect the moment PayFast confirmed a new
-- subscription. A member who moved to a cheaper plan mid-cycle therefore
-- forfeited the rest of the period they had already paid for and was charged
-- again on day one — the opposite of what someone counting every rand expects.
--
-- Downgrades (including cancelling to Free) are now scheduled: the member keeps
-- the plan they paid for until the period ends, and the scheduled worker
-- applies the change on its effective date. Upgrades stay immediate, because a
-- member paying more should get more straight away.

-- End of the paid period the member is currently inside. Recomputed on every
-- successful payment (initial and recurring) as paid-at plus one billing cycle,
-- and it is the date a queued downgrade lands on.
ALTER TABLE billing_subscriptions ADD COLUMN current_period_end TEXT;

-- The plan the member asked to move to and when it takes effect. NULL means
-- nothing is queued. A pending_plan_id of 'free' is a cancellation, which
-- cancels the PayFast subscription outright rather than adjusting its amount.
ALTER TABLE billing_subscriptions ADD COLUMN pending_plan_id TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN pending_billing_cycle TEXT;
ALTER TABLE billing_subscriptions ADD COLUMN pending_effective_at TEXT;

-- The worker sweeps for changes whose effective date has passed. Partial index
-- so the scan stays proportional to queued changes, not to every subscriber.
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_pending
  ON billing_subscriptions (pending_effective_at)
  WHERE pending_effective_at IS NOT NULL;
