-- A source that returns no priced deals is not necessarily broken. Boxer
-- publishes ten provincial leaflets, Roots one national one, and Food Lovers
-- mostly leaflets too — all of them do their job by producing a catalogue and
-- never a single deal candidate.
--
-- The health alarm reads a run of empty successes as a dead feed, which is
-- right for Mr Price and wrong for all twelve of those. Without this column it
-- cannot tell the two apart, and an alarm that cries wolf about a third of the
-- registry is one nobody will keep listening to.
ALTER TABLE deal_source_runs ADD COLUMN catalogue_count INTEGER NOT NULL DEFAULT 0;
