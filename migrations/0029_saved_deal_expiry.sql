-- A saved deal had no end date, so an offer that had already closed stayed in
-- a shopper's saved list looking current. Record the offer's last valid day so
-- the list can drop what has expired and warn about what is about to.
ALTER TABLE member_saved_deals ADD COLUMN valid_to TEXT;

-- Best-effort backfill from the live deal feed for deals saved before this
-- column existed, matched on the product the shopper actually saved.
UPDATE member_saved_deals AS saved
SET valid_to = (
  SELECT deal_items.valid_to
  FROM deal_items
  WHERE deal_items.product_url = saved.product_url
    AND deal_items.valid_to IS NOT NULL
    AND trim(deal_items.valid_to) <> ''
  ORDER BY deal_items.captured_at DESC
  LIMIT 1
)
WHERE valid_to IS NULL OR trim(valid_to) = '';

-- The expiry sweep and the "expiring soon" alert both read by account and end
-- date, so index that pair.
CREATE INDEX IF NOT EXISTS idx_member_saved_deals_valid_to
  ON member_saved_deals (account_id, valid_to);
