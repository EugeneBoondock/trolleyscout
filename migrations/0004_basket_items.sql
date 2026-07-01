CREATE TABLE IF NOT EXISTS member_basket_items (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  saved_deal_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 99),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES member_accounts (id) ON DELETE CASCADE,
  FOREIGN KEY (saved_deal_id) REFERENCES member_saved_deals (id) ON DELETE CASCADE,
  UNIQUE (account_id, saved_deal_id)
);

CREATE INDEX IF NOT EXISTS idx_member_basket_items_account_id
  ON member_basket_items (account_id);
