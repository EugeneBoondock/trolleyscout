-- Deals used to be South African by assumption: there was nowhere to record
-- which country a deal belonged to, so every row in this table was one, and
-- every price rendered as rands. That held only while every source was a South
-- African shop. The moment a US chain writes here, a shopper in Cape Town is
-- offered a Walmart price labelled R7.00 when it means $7.00.
--
-- Country is what a deal is filtered by; currency is what it is read in. They
-- are kept apart because they disagree: Zimbabwe's shops price in US dollars,
-- so deriving one from the other would quote a Harare shopper in a currency no
-- till there accepts.
--
-- Existing rows are all South African, so the defaults backfill them correctly
-- and no data migration is needed.
ALTER TABLE deal_items ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZA';
ALTER TABLE deal_items ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'ZAR';

-- Every shopper-facing read filters by country before anything else, so this
-- carries the same leading column as the query.
CREATE INDEX IF NOT EXISTS idx_deal_items_country_active
  ON deal_items (country_code, status, expires_at);
