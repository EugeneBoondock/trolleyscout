-- Product image for verified offers, extracted from the offer's source page
-- (og:image) when the scanner does not provide one explicitly.
ALTER TABLE verified_offers ADD COLUMN image_url TEXT;
