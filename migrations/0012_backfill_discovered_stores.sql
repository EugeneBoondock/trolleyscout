INSERT INTO discovered_stores (
  place_id,
  store_name,
  address,
  website,
  lat,
  lon,
  retailer_id,
  first_seen_at,
  last_seen_at,
  last_source_tile,
  next_scout_at
)
SELECT
  json_extract(store.value, '$.placeId'),
  json_extract(store.value, '$.name'),
  json_extract(store.value, '$.address'),
  json_extract(store.value, '$.website'),
  CAST(json_extract(store.value, '$.lat') AS REAL),
  CAST(json_extract(store.value, '$.lon') AS REAL),
  json_extract(store.value, '$.retailerId'),
  cache.checked_at,
  cache.checked_at,
  cache.tile_key,
  cache.checked_at
FROM nearby_store_cache AS cache
JOIN json_each(
  CASE WHEN json_valid(cache.stores_json) THEN cache.stores_json ELSE '[]' END
) AS store
WHERE json_extract(store.value, '$.placeId') IS NOT NULL
  AND json_extract(store.value, '$.name') IS NOT NULL
  AND json_type(store.value, '$.lat') IN ('integer', 'real')
  AND json_type(store.value, '$.lon') IN ('integer', 'real')
ON CONFLICT (place_id) DO UPDATE SET
  store_name = excluded.store_name,
  address = COALESCE(excluded.address, discovered_stores.address),
  website = COALESCE(excluded.website, discovered_stores.website),
  lat = excluded.lat,
  lon = excluded.lon,
  retailer_id = COALESCE(excluded.retailer_id, discovered_stores.retailer_id),
  last_seen_at = CASE
    WHEN excluded.last_seen_at > discovered_stores.last_seen_at THEN excluded.last_seen_at
    ELSE discovered_stores.last_seen_at
  END,
  last_source_tile = CASE
    WHEN excluded.last_seen_at >= discovered_stores.last_seen_at THEN excluded.last_source_tile
    ELSE discovered_stores.last_source_tile
  END;
