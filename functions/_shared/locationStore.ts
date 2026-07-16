import type { NearbyStore } from '../../src/services/nearbyStores'
import type { TrolleyScoutEnv } from './env'

// How long a discovered store list stays fresh for a tile (Geoapify results
// change slowly), and how long store promotions live without an end date.
const STORE_LIST_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PROMOTION_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface StorePromotion {
  id: string
  placeId: string
  storeName: string
  retailerId?: string
  kind: 'deal' | 'catalogue'
  title: string
  priceText?: string
  previousPriceText?: string
  savingText?: string
  sourceUrl: string
  productUrl?: string
  imageUrl?: string
  validFrom?: string
  validTo?: string
}

function hasDb(env: TrolleyScoutEnv): env is TrolleyScoutEnv & { DB: D1Database } {
  return Boolean(env.DB)
}

// End of the promotion's last valid day, or a default TTL when no end date is
// printed. Used both to store expires_at and to filter out stale rows on read.
export function promotionExpiryIso(validTo: string | undefined, nowMs: number): string {
  if (validTo && /^\d{4}-\d{2}-\d{2}/.test(validTo)) {
    return new Date(`${validTo.slice(0, 10)}T23:59:59.000Z`).toISOString()
  }

  return new Date(nowMs + PROMOTION_DEFAULT_TTL_MS).toISOString()
}

export async function readCachedStores(
  env: TrolleyScoutEnv,
  tileKey: string,
  nowIso: string,
): Promise<NearbyStore[] | undefined> {
  if (!hasDb(env)) {
    return undefined
  }

  try {
    const row = await env.DB.prepare(
      'SELECT stores_json, expires_at FROM nearby_store_cache WHERE tile_key = ?',
    )
      .bind(tileKey)
      .first<{ stores_json: string; expires_at: string }>()

    if (!row || row.expires_at < nowIso) {
      return undefined
    }

    const stores = JSON.parse(row.stores_json) as NearbyStore[]
    return Array.isArray(stores) ? stores : undefined
  } catch {
    return undefined
  }
}

export async function writeCachedStores(
  env: TrolleyScoutEnv,
  tileKey: string,
  stores: NearbyStore[],
  nowMs: number,
): Promise<void> {
  if (!hasDb(env) || stores.length === 0) {
    return
  }

  try {
    await env.DB.prepare(
      `INSERT INTO nearby_store_cache (tile_key, stores_json, checked_at, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (tile_key) DO UPDATE SET
          stores_json = excluded.stores_json,
          checked_at = excluded.checked_at,
          expires_at = excluded.expires_at`,
    )
      .bind(
        tileKey,
        JSON.stringify(stores),
        new Date(nowMs).toISOString(),
        new Date(nowMs + STORE_LIST_TTL_MS).toISOString(),
      )
      .run()
  } catch {
    // Best-effort cache; discovery already succeeded.
  }
}

// Valid (unexpired) promotions for a set of stores, newest capture first.
export async function readStorePromotions(
  env: TrolleyScoutEnv,
  placeIds: string[],
  nowIso: string,
): Promise<Map<string, StorePromotion[]>> {
  const byPlace = new Map<string, StorePromotion[]>()

  if (!hasDb(env) || placeIds.length === 0) {
    return byPlace
  }

  try {
    const placeholders = placeIds.map(() => '?').join(',')
    const result = await env.DB.prepare(
      `SELECT id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to
        FROM store_promotions
        WHERE place_id IN (${placeholders}) AND expires_at >= ?
        ORDER BY captured_at DESC`,
    )
      .bind(...placeIds, nowIso)
      .all<StorePromotionRow>()

    for (const row of result.results) {
      const list = byPlace.get(row.place_id) ?? []
      list.push(rowToPromotion(row))
      byPlace.set(row.place_id, list)
    }
  } catch {
    // Missing table (migration not applied) degrades to no cached promotions.
  }

  return byPlace
}

export async function saveStorePromotions(
  env: TrolleyScoutEnv,
  promotions: StorePromotion[],
  nowMs: number,
): Promise<void> {
  if (!hasDb(env) || promotions.length === 0) {
    return
  }

  try {
    const statement = env.DB.prepare(
      `INSERT INTO store_promotions (
        id, place_id, store_name, retailer_id, kind, title, price_text,
        previous_price_text, saving_text, source_url, product_url, image_url,
        valid_from, valid_to, captured_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        price_text = excluded.price_text,
        previous_price_text = excluded.previous_price_text,
        saving_text = excluded.saving_text,
        valid_from = excluded.valid_from,
        valid_to = excluded.valid_to,
        captured_at = excluded.captured_at,
        expires_at = excluded.expires_at`,
    )
    const capturedAt = new Date(nowMs).toISOString()

    await env.DB.batch(
      promotions.map((promotion) =>
        statement.bind(
          promotion.id,
          promotion.placeId,
          promotion.storeName,
          promotion.retailerId ?? null,
          promotion.kind,
          promotion.title,
          promotion.priceText ?? null,
          promotion.previousPriceText ?? null,
          promotion.savingText ?? null,
          promotion.sourceUrl,
          promotion.productUrl ?? null,
          promotion.imageUrl ?? null,
          promotion.validFrom ?? null,
          promotion.validTo ?? null,
          capturedAt,
          promotionExpiryIso(promotion.validTo, nowMs),
        ),
      ),
    )
  } catch {
    // Best-effort write.
  }
}

// Removes every row whose expiry has passed. Returns how many were deleted so
// the scheduled scout can report it. This is the "expire after the date" rule.
export async function purgeExpired(env: TrolleyScoutEnv, nowIso: string): Promise<number> {
  if (!hasDb(env)) {
    return 0
  }

  let removed = 0

  for (const table of ['store_promotions', 'nearby_store_cache']) {
    try {
      const result = await env.DB.prepare(`DELETE FROM ${table} WHERE expires_at < ?`)
        .bind(nowIso)
        .run()
      removed += result.meta.changes ?? 0
    } catch {
      // Table may not exist yet; ignore.
    }
  }

  return removed
}

export async function shouldScoutStore(
  env: TrolleyScoutEnv,
  placeId: string,
  nowIso: string,
): Promise<boolean> {
  if (!hasDb(env)) {
    return false
  }

  try {
    const row = await env.DB.prepare('SELECT next_scout_at FROM store_scout_log WHERE place_id = ?')
      .bind(placeId)
      .first<{ next_scout_at: string }>()

    return !row || row.next_scout_at < nowIso
  } catch {
    return false
  }
}

export async function recordStoreScout(
  env: TrolleyScoutEnv,
  store: NearbyStore,
  promotionCount: number,
  nowMs: number,
): Promise<void> {
  if (!hasDb(env)) {
    return
  }

  // Re-scout a store's website at most once a day.
  const nextScoutAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString()

  try {
    await env.DB.prepare(
      `INSERT INTO store_scout_log (place_id, store_name, website, retailer_id, scouted_at, next_scout_at, promotion_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (place_id) DO UPDATE SET
          scouted_at = excluded.scouted_at,
          next_scout_at = excluded.next_scout_at,
          promotion_count = excluded.promotion_count`,
    )
      .bind(
        store.placeId,
        store.name,
        store.website ?? null,
        store.retailerId ?? null,
        new Date(nowMs).toISOString(),
        nextScoutAt,
        promotionCount,
      )
      .run()
  } catch {
    // Best-effort.
  }
}

interface StorePromotionRow {
  id: string
  place_id: string
  store_name: string
  retailer_id: string | null
  kind: string
  title: string
  price_text: string | null
  previous_price_text: string | null
  saving_text: string | null
  source_url: string
  product_url: string | null
  image_url: string | null
  valid_from: string | null
  valid_to: string | null
}

function rowToPromotion(row: StorePromotionRow): StorePromotion {
  return {
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    kind: row.kind === 'catalogue' ? 'catalogue' : 'deal',
    placeId: row.place_id,
    previousPriceText: row.previous_price_text ?? undefined,
    priceText: row.price_text ?? undefined,
    productUrl: row.product_url ?? undefined,
    retailerId: row.retailer_id ?? undefined,
    savingText: row.saving_text ?? undefined,
    sourceUrl: row.source_url,
    storeName: row.store_name,
    title: row.title,
    validFrom: row.valid_from ?? undefined,
    validTo: row.valid_to ?? undefined,
  }
}
