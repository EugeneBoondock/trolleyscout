// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  discoveredStoreFromRow,
  promotionExpiryIso,
  readAllStoreCatalogues,
  reconcileSuccessfulStorePromotions,
  recordStoreScout,
  writeCachedStores,
  writeDiscoveredStores,
  type StorePromotion,
  type DiscoveredStoreRow,
} from './locationStore'

describe('promotionExpiryIso', () => {
  it.each([
    ['2026-01-15', '2026-01-15T21:59:59.999Z'],
    ['2026-07-16T00:00:00.000Z', '2026-07-16T21:59:59.999Z'],
  ])('expires %s at the end of its South African local day', (validTo, expected) => {
    expect(promotionExpiryIso(validTo, Date.parse('2026-07-01T00:00:00.000Z'))).toBe(expected)
  })
})

describe('discoveredStoreFromRow', () => {
  it('maps permanent store metadata without losing first and last seen times', () => {
    const row: DiscoveredStoreRow = {
      address: '10 Main Road, Johannesburg',
      first_seen_at: '2026-07-01T08:00:00.000Z',
      last_seen_at: '2026-07-16T08:00:00.000Z',
      last_source_tile: '-522:561',
      lat: -26.1,
      lon: 28.05,
      next_scout_at: '2026-07-17T08:00:00.000Z',
      place_id: 'place-1',
      retailer_id: 'pick-n-pay',
      store_name: 'Pick n Pay Rosebank',
      website: 'https://www.pnp.co.za/',
    }

    expect(discoveredStoreFromRow(row)).toEqual({
      address: row.address,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      lastSourceTile: row.last_source_tile,
      lat: row.lat,
      lon: row.lon,
      nextScoutAt: row.next_scout_at,
      placeId: row.place_id,
      retailerId: 'pick-n-pay',
      name: row.store_name,
      website: row.website,
    })
  })
})

describe('discovered store scout timing', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'location-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    await db.prepare(
      `CREATE TABLE discovered_stores (
        place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, address TEXT, website TEXT,
        lat REAL NOT NULL, lon REAL NOT NULL, retailer_id TEXT, first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL, last_source_tile TEXT, last_scout_at TEXT,
        next_scout_at TEXT NOT NULL, promotion_count INTEGER NOT NULL DEFAULT 0
      )`,
    ).run()
    await db.prepare(
      `CREATE TABLE store_scout_log (
        place_id TEXT PRIMARY KEY, store_name TEXT NOT NULL, website TEXT, retailer_id TEXT,
        scouted_at TEXT NOT NULL, next_scout_at TEXT NOT NULL,
        promotion_count INTEGER NOT NULL DEFAULT 0
      )`,
    ).run()
    await db.prepare(
      `CREATE TABLE store_promotions (
        id TEXT PRIMARY KEY, place_id TEXT NOT NULL, store_name TEXT NOT NULL,
        retailer_id TEXT, kind TEXT NOT NULL DEFAULT 'deal', title TEXT NOT NULL,
        price_text TEXT, previous_price_text TEXT, saving_text TEXT, source_url TEXT NOT NULL,
        product_url TEXT, image_url TEXT, valid_from TEXT, valid_to TEXT,
        captured_at TEXT NOT NULL, expires_at TEXT NOT NULL
      )`,
    ).run()
    await db.prepare(
      `CREATE TABLE nearby_store_cache (
        tile_key TEXT PRIMARY KEY, stores_json TEXT NOT NULL,
        checked_at TEXT NOT NULL, expires_at TEXT NOT NULL
      )`,
    ).run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('makes a newly discovered store due at the moment it is first seen', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')

    const stored = await writeDiscoveredStores(
      env,
      [{ lat: -26.1, lon: 28.05, name: 'Fresh Market', placeId: 'fresh-market' }],
      nowMs,
      '-522:561',
    )

    const row = await db.prepare(
      `SELECT first_seen_at, next_scout_at FROM discovered_stores WHERE place_id = 'fresh-market'`,
    ).first<{ first_seen_at: string; next_scout_at: string }>()
    expect(row).toEqual({
      first_seen_at: '2026-07-16T10:00:00.000Z',
      next_scout_at: '2026-07-16T10:00:00.000Z',
    })
    expect(stored).toBe(true)
  })

  it('reports a failed discovered-store write so callers do not scout an unqueued store', async () => {
    await db.prepare('DROP TABLE discovered_stores').run()

    const stored = await writeDiscoveredStores(
      env,
      [{ lat: -26.1, lon: 28.05, name: 'Fresh Market', placeId: 'fresh-market' }],
      Date.parse('2026-07-16T10:00:00.000Z'),
    )

    expect(stored).toBe(false)
  })

  it('reports cache persistence as failed when its directory write does not persist', async () => {
    await db.prepare('DROP TABLE discovered_stores').run()

    const stored = await writeCachedStores(
      env,
      '-522:561',
      [{ lat: -26.1, lon: 28.05, name: 'Fresh Market', placeId: 'fresh-market' }],
      Date.parse('2026-07-16T10:00:00.000Z'),
    )

    expect(stored).toBe(false)
    const cached = await db.prepare(
      `SELECT tile_key FROM nearby_store_cache WHERE tile_key = '-522:561'`,
    ).first<{ tile_key: string }>()
    expect(cached?.tile_key).toBe('-522:561')
  })

  it('schedules transient outcomes for a short retry and completed empty outcomes daily', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    const store = { lat: -26.1, lon: 28.05, name: 'Fresh Market', placeId: 'fresh-market' }

    await recordStoreScout(env, store, 0, nowMs, 'transient_failure')
    const transient = await db.prepare(
      `SELECT next_scout_at FROM store_scout_log WHERE place_id = 'fresh-market'`,
    ).first<{ next_scout_at: string }>()
    expect(transient?.next_scout_at).toBe('2026-07-16T11:00:00.000Z')

    await recordStoreScout(env, store, 0, nowMs, 'empty')
    const empty = await db.prepare(
      `SELECT next_scout_at FROM store_scout_log WHERE place_id = 'fresh-market'`,
    ).first<{ next_scout_at: string }>()
    expect(empty?.next_scout_at).toBe('2026-07-17T10:00:00.000Z')
  })

  it('preserves the last valid promotion count when a source attempt fails', async () => {
    const nowMs = Date.parse('2026-07-16T10:00:00.000Z')
    const store = { lat: -26.1, lon: 28.05, name: 'Fresh Market', placeId: 'fresh-market' }
    await writeDiscoveredStores(env, [store], nowMs)
    await db.prepare(
      `UPDATE discovered_stores SET promotion_count = 3 WHERE place_id = 'fresh-market'`,
    ).run()

    await recordStoreScout(env, store, 0, nowMs, 'transient_failure')

    const row = await db.prepare(
      `SELECT promotion_count FROM discovered_stores WHERE place_id = 'fresh-market'`,
    ).first<{ promotion_count: number }>()
    expect(row?.promotion_count).toBe(3)
  })

  it('reads catalogues before applying the page limit so deal rows cannot crowd them out', async () => {
    await insertPromotion(db, promotion({
      id: 'deal-newest',
      kind: 'deal',
      sourceUrl: 'https://market.test/specials',
      title: 'Newest deal',
    }), '2026-07-16T12:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'deal-next',
      kind: 'deal',
      sourceUrl: 'https://market.test/specials',
      title: 'Next deal',
    }), '2026-07-16T11:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'catalogue-one',
      kind: 'catalogue',
      sourceUrl: 'https://market.test/catalogue/july',
      title: 'July catalogue',
    }), '2026-07-16T10:00:00.000Z')

    const catalogues = await readAllStoreCatalogues(
      env,
      '2026-07-16T09:00:00.000Z',
      1,
      0,
    )

    expect(catalogues.map((promotion) => promotion.id)).toEqual(['catalogue-one'])
  })

  it('pages catalogue rows in newest-first order', async () => {
    await insertPromotion(db, promotion({
      id: 'catalogue-new',
      kind: 'catalogue',
      sourceUrl: 'https://market.test/catalogue/new',
      title: 'New catalogue',
    }), '2026-07-16T12:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'catalogue-old',
      kind: 'catalogue',
      sourceUrl: 'https://market.test/catalogue/old',
      title: 'Old catalogue',
    }), '2026-07-16T10:00:00.000Z')

    const secondPage = await readAllStoreCatalogues(
      env,
      '2026-07-16T09:00:00.000Z',
      1,
      1,
    )

    expect(secondPage.map((promotion) => promotion.id)).toEqual(['catalogue-old'])
    expect(secondPage[0].capturedAt).toBe('2026-07-16T10:00:00.000Z')
  })

  it('removes missing rows only for the successful place and official source identity', async () => {
    const current = promotion({
      id: 'current',
      sourceUrl: 'https://Market.Test/specials/current',
      title: 'Current deal',
    })
    await insertPromotion(db, current, '2026-07-16T12:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'old-same-source',
      sourceUrl: 'https://market.test/catalogue/old',
      title: 'Old deal',
    }), '2026-07-15T12:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'other-source',
      sourceUrl: 'https://another-market.test/specials',
      title: 'Other source deal',
    }), '2026-07-15T12:00:00.000Z')
    await insertPromotion(db, promotion({
      id: 'other-place',
      placeId: 'other-place',
      sourceUrl: 'https://market.test/specials',
      title: 'Other branch deal',
    }), '2026-07-15T12:00:00.000Z')

    const removed = await reconcileSuccessfulStorePromotions(env, 'fresh-market', [current])

    expect(removed).toBe(1)
    const rows = await db.prepare('SELECT id FROM store_promotions ORDER BY id').all<{ id: string }>()
    expect(rows.results.map((row) => row.id)).toEqual(['current', 'other-place', 'other-source'])
  })

  it('preserves last-good rows when no certain successful result is supplied', async () => {
    await insertPromotion(db, promotion({
      id: 'last-good',
      sourceUrl: 'https://market.test/specials',
      title: 'Last good deal',
    }), '2026-07-15T12:00:00.000Z')

    expect(await reconcileSuccessfulStorePromotions(env, 'fresh-market', [])).toBe(0)
    const row = await db.prepare(
      `SELECT id FROM store_promotions WHERE id = 'last-good'`,
    ).first<{ id: string }>()
    expect(row?.id).toBe('last-good')
  })
})

function promotion(overrides: Partial<StorePromotion> = {}): StorePromotion {
  return {
    id: 'promotion',
    kind: 'deal',
    placeId: 'fresh-market',
    sourceUrl: 'https://market.test/specials',
    storeName: 'Fresh Market',
    title: 'Promotion',
    ...overrides,
  }
}

async function insertPromotion(
  db: D1Database,
  value: StorePromotion,
  capturedAt: string,
): Promise<void> {
  await db.prepare(
    `INSERT INTO store_promotions (
      id, place_id, store_name, retailer_id, kind, title, price_text,
      previous_price_text, saving_text, source_url, product_url, image_url,
      valid_from, valid_to, captured_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    value.id,
    value.placeId,
    value.storeName,
    value.retailerId ?? null,
    value.kind,
    value.title,
    value.priceText ?? null,
    value.previousPriceText ?? null,
    value.savingText ?? null,
    value.sourceUrl,
    value.productUrl ?? null,
    value.imageUrl ?? null,
    value.validFrom ?? null,
    value.validTo ?? null,
    capturedAt,
    '2026-07-20T00:00:00.000Z',
  ).run()
}
