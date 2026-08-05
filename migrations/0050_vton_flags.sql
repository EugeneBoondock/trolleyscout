-- Feature kill switches for the virtual try-on fitting room. The global flag
-- row is absent until an admin first flips it, which reads as enabled; a
-- per-member override always wins over the global flag.
CREATE TABLE IF NOT EXISTS feature_flags (
  flag TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS member_feature_overrides (
  account_id TEXT NOT NULL,
  flag TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, flag)
);
