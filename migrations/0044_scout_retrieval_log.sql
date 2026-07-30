-- Every Mr Scout retrieval, so relevance can be tuned against what shoppers
-- actually asked for rather than against guesses. Retrieval used to be
-- invisible: when a shopper reported "it says it cannot find 50 inch
-- televisions", there was no record of what was searched or what came back.
CREATE TABLE IF NOT EXISTS scout_retrieval_log (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  query_text TEXT NOT NULL,
  -- The understood query: head terms, category, spec, budget.
  parsed_query TEXT NOT NULL,
  -- Per-retailer status, latency and yield.
  stage_timings TEXT NOT NULL,
  -- Top candidates with their scores and the reasons behind them.
  candidates TEXT NOT NULL,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  shown_count INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0,
  -- 'up' | 'down', written later by the thumbs control on the answer.
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scout_retrieval_log_created
  ON scout_retrieval_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_retrieval_log_account
  ON scout_retrieval_log (account_id, created_at DESC);

-- Finds the queries that came back empty — the tuning backlog.
CREATE INDEX IF NOT EXISTS idx_scout_retrieval_log_empty
  ON scout_retrieval_log (candidate_count, created_at DESC);
