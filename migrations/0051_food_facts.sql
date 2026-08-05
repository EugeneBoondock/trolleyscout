-- Health facts for healthy marketplace foods, generated once by the AI when
-- the first shopper asks and shared with everyone after.
CREATE TABLE IF NOT EXISTS food_facts (
  fact_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  facts_json TEXT NOT NULL CHECK (json_valid(facts_json)),
  created_at TEXT NOT NULL
);
