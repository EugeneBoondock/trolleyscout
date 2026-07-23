ALTER TABLE member_saved_deals ADD COLUMN image_url TEXT;

-- Best-effort backfill for deals saved before image_url was stored directly.
UPDATE member_saved_deals AS saved
SET image_url = COALESCE(
  (
    SELECT json_extract(entry.value, '$.imageUrl')
    FROM deal_snapshots AS snapshot,
      json_each(snapshot.deals_json) AS entry
    WHERE json_type(snapshot.deals_json) = 'array'
      AND json_extract(entry.value, '$.productUrl') = saved.product_url
      AND trim(COALESCE(json_extract(entry.value, '$.imageUrl'), '')) <> ''
    ORDER BY snapshot.checked_at DESC
    LIMIT 1
  ),
  (
    SELECT json_extract(entry.value, '$.imageUrl')
    FROM deal_site_cache AS cache,
      json_each(cache.payload_json) AS entry
    WHERE json_extract(entry.value, '$.productUrl') = saved.product_url
      AND trim(COALESCE(json_extract(entry.value, '$.imageUrl'), '')) <> ''
    ORDER BY cache.fetched_at DESC
    LIMIT 1
  )
)
WHERE image_url IS NULL OR trim(image_url) = '';
