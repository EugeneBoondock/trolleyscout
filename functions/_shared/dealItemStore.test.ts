// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type FeedCursor,
  type RetailerDealCandidate,
  retailerSlug,
} from '../../src/services/retailerFeeds/types'
import type { TrolleyScoutEnv } from './env'
import {
  expireDealItems,
  listActiveDealItems,
  readSourceCursor,
  upsertDealItems,
  writeSourceCursor,
} from './dealItemStore'

const migrationUrl = new NodeUrl('../../migrations/0013_deal_items.sql', import.meta.url)

describe('deal item store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'deal-item-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    const migration = (await readFile(migrationUrl, 'utf8'))
      .replace(/^--.*$/gm, '')
      .trim()
    for (const statement of splitMigrationStatements(migration)) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('upserts the same retailer product, promotion, and scope idempotently', async () => {
    const item = candidate()

    const first = await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })
    const second = await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    const count = await db.prepare('SELECT COUNT(*) AS total FROM deal_items')
      .first<{ total: number }>()
    const row = await db.prepare(
      'SELECT id, content_fingerprint FROM deal_items LIMIT 1',
    ).first<{ id: string; content_fingerprint: string }>()

    expect(count?.total).toBe(1)
    expect(first.rowIds).toEqual(second.rowIds)
    expect(row?.id).toBe(first.rowIds[0])
    expect(row?.content_fingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('updates changed content and its fingerprint without creating another row', async () => {
    const item = candidate()
    await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })
    const before = await db.prepare(
      'SELECT id, content_fingerprint FROM deal_items LIMIT 1',
    ).first<{ id: string; content_fingerprint: string }>()

    await upsertDealItems(env, {
      candidates: [{ ...item, priceCents: 7_499, savingText: 'Save R25' }],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    const rows = await db.prepare(
      'SELECT id, current_price_cents, saving_text, content_fingerprint FROM deal_items',
    ).all<{
      id: string
      current_price_cents: number
      saving_text: string
      content_fingerprint: string
    }>()
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]).toMatchObject({
      id: before?.id,
      current_price_cents: 7_499,
      saving_text: 'Save R25',
    })
    expect(rows.results[0].content_fingerprint).not.toBe(before?.content_fingerprint)
  })

  it('stores simultaneous national, online, province, and store prices as separate rows', async () => {
    const item = candidate()
    const candidates: RetailerDealCandidate[] = [
      item,
      { ...item, scope: { type: 'online' }, priceCents: 8_499 },
      { ...item, scope: { type: 'province', regionIds: ['western-cape'] }, priceCents: 7_999 },
      { ...item, scope: { type: 'store', storeIds: ['cavendish'] }, priceCents: 7_499 },
    ]

    const result = await upsertDealItems(env, {
      candidates,
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    const rows = await db.prepare(
      'SELECT id, scope_type, current_price_cents FROM deal_items ORDER BY scope_type',
    ).all<{ id: string; scope_type: string; current_price_cents: number }>()
    expect(rows.results).toHaveLength(4)
    expect(new Set(result.rowIds).size).toBe(4)
    expect(rows.results.map((row) => row.scope_type)).toEqual([
      'national',
      'online',
      'province',
      'store',
    ])
  })

  it('deduplicates one batch by row identity, keeps the newest capture, and counts one write', async () => {
    const older = candidate({ capturedAt: '2026-07-16T09:00:00.000Z', priceCents: 9_999 })
    const newer = candidate({ capturedAt: '2026-07-16T11:00:00.000Z', priceCents: 7_499 })

    const result = await upsertDealItems(env, {
      candidates: [newer, older],
      retailerId: newer.retailerId,
      run: {
        finishedAt: '2026-07-16T11:05:00.000Z',
        id: 'deduplicated-run',
        startedAt: '2026-07-16T11:00:00.000Z',
      },
      sourceKey: 'woolworths::promotions',
    })

    const item = await db.prepare(
      'SELECT captured_at, current_price_cents FROM deal_items LIMIT 1',
    ).first<{ captured_at: string; current_price_cents: number }>()
    const run = await db.prepare(
      'SELECT candidate_count, written_count FROM deal_source_runs WHERE id = ?',
    ).bind('deduplicated-run').first<{ candidate_count: number; written_count: number }>()

    expect(result.processed).toBe(1)
    expect(result.rowIds).toHaveLength(1)
    expect(item).toEqual({
      captured_at: '2026-07-16T11:00:00.000Z',
      current_price_cents: 7_499,
    })
    expect(run).toEqual({ candidate_count: 2, written_count: 1 })
  })

  it('does not claim a write when an older capture loses the database freshness guard', async () => {
    const newer = candidate({ capturedAt: '2026-07-16T11:00:00.000Z', priceCents: 7_499 })
    await upsertDealItems(env, {
      candidates: [newer],
      retailerId: newer.retailerId,
      run: {
        finishedAt: '2026-07-16T11:05:00.000Z',
        id: 'newer-run',
        startedAt: '2026-07-16T11:00:00.000Z',
      },
      sourceKey: 'woolworths::promotions',
    })

    const staleResult = await upsertDealItems(env, {
      candidates: [candidate({ capturedAt: '2026-07-16T09:00:00.000Z', priceCents: 9_999 })],
      retailerId: newer.retailerId,
      run: {
        finishedAt: '2026-07-16T12:05:00.000Z',
        id: 'stale-run',
        startedAt: '2026-07-16T12:00:00.000Z',
      },
      sourceKey: 'woolworths::promotions',
    })

    const item = await db.prepare(
      'SELECT captured_at, current_price_cents FROM deal_items LIMIT 1',
    ).first<{ captured_at: string; current_price_cents: number }>()
    const run = await db.prepare(
      'SELECT candidate_count, written_count FROM deal_source_runs WHERE id = ?',
    ).bind('stale-run').first<{ candidate_count: number; written_count: number }>()

    expect(staleResult).toMatchObject({ processed: 0, rowIds: [] })
    expect(item).toEqual({
      captured_at: '2026-07-16T11:00:00.000Z',
      current_price_cents: 7_499,
    })
    expect(run).toEqual({ candidate_count: 1, written_count: 0 })
  })

  it('rolls back every deal mutation when the source-run audit insert fails', async () => {
    const first = candidate()
    await upsertDealItems(env, {
      candidates: [first],
      retailerId: first.retailerId,
      run: {
        finishedAt: '2026-07-16T10:05:00.000Z',
        id: 'atomic-run',
        startedAt: '2026-07-16T10:00:00.000Z',
      },
      sourceKey: 'woolworths::promotions',
    })

    await expect(upsertDealItems(env, {
      candidates: [candidate({
        capturedAt: '2026-07-16T11:00:00.000Z',
        productId: 'must-roll-back',
        promotionId: 'must-roll-back',
      })],
      retailerId: first.retailerId,
      run: {
        finishedAt: '2026-07-16T11:05:00.000Z',
        id: 'atomic-run',
        startedAt: '2026-07-16T11:00:00.000Z',
      },
      sourceKey: 'woolworths::promotions',
    })).rejects.toThrow()

    const deals = await db.prepare(
      'SELECT source_product_id FROM deal_items ORDER BY source_product_id',
    ).all<{ source_product_id: string }>()
    const run = await db.prepare(
      'SELECT candidate_count, written_count FROM deal_source_runs WHERE id = ?',
    ).bind('atomic-run').first<{ candidate_count: number; written_count: number }>()

    expect(deals.results).toEqual([{ source_product_id: first.productId }])
    expect(run).toEqual({ candidate_count: 1, written_count: 1 })
  })

  it('round-trips every cursor variant and isolates source keys', async () => {
    const cursors: Array<[string, FeedCursor]> = [
      ['woolworths::promotions', { kind: 'offset', offset: 48 }],
      ['clicks::specials', { kind: 'page', page: 3 }],
      ['spar::catalogues', { kind: 'token', token: 'next:branch:42' }],
    ]

    for (const [sourceKey, cursor] of cursors) {
      await writeSourceCursor(env, { cursor, sourceKey, updatedAt: '2026-07-16T10:00:00.000Z' })
    }

    await expect(Promise.all(cursors.map(([sourceKey]) => readSourceCursor(env, sourceKey))))
      .resolves.toEqual(cursors.map(([, cursor]) => cursor))
    await expect(readSourceCursor(env, 'missing::source')).resolves.toBeUndefined()
  })

  it('does not let an older cursor observation rewind newer source progress', async () => {
    await writeSourceCursor(env, {
      cursor: { kind: 'page', page: 8 },
      sourceKey: 'clicks::specials',
      updatedAt: '2026-07-16T12:00:00.000Z',
    })
    await writeSourceCursor(env, {
      cursor: { kind: 'page', page: 2 },
      sourceKey: 'clicks::specials',
      updatedAt: '2026-07-16T11:00:00.000Z',
    })

    await expect(readSourceCursor(env, 'clicks::specials'))
      .resolves.toEqual({ kind: 'page', page: 8 })
    const stored = await db.prepare(
      'SELECT cursor_value, updated_at FROM deal_source_cursors WHERE source_key = ?',
    ).bind('clicks::specials').first<{ cursor_value: string; updated_at: string }>()
    expect(stored).toEqual({
      cursor_value: '8',
      updated_at: '2026-07-16T12:00:00.000Z',
    })
  })

  it('converts a date-only end date to Johannesburg end-of-day', async () => {
    const item = candidate({ validTo: '2026-07-16' })
    await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    const row = await db.prepare('SELECT valid_to, expires_at FROM deal_items LIMIT 1')
      .first<{ valid_to: string; expires_at: string }>()
    expect(row).toEqual({
      expires_at: '2026-07-16T21:59:59.999Z',
      valid_to: '2026-07-16T21:59:59.999Z',
    })
  })

  it('uses a twelve-hour repeat-observation expiry when no end date exists', async () => {
    const item = candidate({ validTo: undefined })
    await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    const row = await db.prepare('SELECT expires_at FROM deal_items LIMIT 1')
      .first<{ expires_at: string }>()
    expect(row?.expires_at).toBe('2026-07-16T22:00:00.000Z')
  })

  it('lists only active rows for an explicit retailer and location scope', async () => {
    const woolworths = candidate()
    const clicks = candidate({
      productId: 'clicks-1',
      promotionId: 'clicks-promo',
      retailerId: retailerSlug('clicks'),
      sourceUrl: 'https://clicks.co.za/specials',
      productUrl: 'https://clicks.co.za/product/clicks-1',
    })
    await upsertDealItems(env, {
      candidates: [
        woolworths,
        { ...woolworths, scope: { type: 'store', storeIds: ['cavendish'] } },
        { ...woolworths, scope: { type: 'store', storeIds: ['canal-walk'] } },
        { ...woolworths, scope: { type: 'province', regionIds: ['western-cape'] } },
        { ...woolworths, scope: { type: 'province', regionIds: ['gauteng'] } },
      ],
      retailerId: woolworths.retailerId,
      sourceKey: 'woolworths::promotions',
    })
    await upsertDealItems(env, {
      candidates: [{ ...clicks, scope: { type: 'store', storeIds: ['cavendish'] } }],
      retailerId: clicks.retailerId,
      sourceKey: 'clicks::specials',
    })

    const storeRows = await listActiveDealItems(env, {
      now: '2026-07-16T12:00:00.000Z',
      retailerIds: ['woolworths'],
      scope: { type: 'store', storeIds: ['cavendish'] },
    })
    const provinceRows = await listActiveDealItems(env, {
      now: '2026-07-16T12:00:00.000Z',
      scope: { type: 'province', regionIds: ['western-cape'] },
    })
    const nationalRows = await listActiveDealItems(env, {
      now: '2026-07-16T12:00:00.000Z',
      scope: { type: 'national' },
    })

    expect(storeRows).toHaveLength(1)
    expect(storeRows[0].scope).toEqual({ type: 'store', storeIds: ['cavendish'] })
    expect(provinceRows).toHaveLength(1)
    expect(provinceRows[0].scope).toEqual({ type: 'province', regionIds: ['western-cape'] })
    expect(nationalRows).toHaveLength(1)
    expect(nationalRows[0].scope).toEqual({ type: 'national' })
  })

  it('filters expired and inactive rows from active listings', async () => {
    const expired = candidate({ productId: 'expired', promotionId: 'expired', validTo: '2026-07-16' })
    const inactive = candidate({ productId: 'inactive', promotionId: 'inactive' })
    await upsertDealItems(env, {
      candidates: [expired, inactive],
      retailerId: expired.retailerId,
      sourceKey: 'woolworths::promotions',
    })
    await db.prepare("UPDATE deal_items SET status = 'inactive' WHERE source_product_id = ?")
      .bind('inactive')
      .run()

    const active = await listActiveDealItems(env, { now: '2026-07-17T00:00:00.000Z' })
    expect(active).toEqual([])
  })

  it('marks elapsed rows expired and returns the changed row count', async () => {
    const elapsed = candidate({ productId: 'elapsed', promotionId: 'elapsed', validTo: '2026-07-16' })
    const future = candidate({ productId: 'future', promotionId: 'future', validTo: '2026-07-18' })
    await upsertDealItems(env, {
      candidates: [elapsed, future],
      retailerId: elapsed.retailerId,
      sourceKey: 'woolworths::promotions',
    })

    await expect(expireDealItems(env, { now: '2026-07-17T00:00:00.000Z' })).resolves.toBe(1)
    const rows = await db.prepare('SELECT source_product_id, status FROM deal_items ORDER BY source_product_id')
      .all<{ source_product_id: string; status: string }>()
    expect(rows.results).toEqual([
      { source_product_id: 'elapsed', status: 'expired' },
      { source_product_id: 'future', status: 'active' },
    ])
  })

  it('keeps valid rows when a later source run fails', async () => {
    const item = candidate()
    await upsertDealItems(env, {
      candidates: [item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })
    await upsertDealItems(env, {
      candidates: [],
      retailerId: item.retailerId,
      run: { errorText: 'upstream timeout', status: 'failed' },
      sourceKey: 'woolworths::promotions',
    })

    const active = await listActiveDealItems(env, { now: '2026-07-16T12:00:00.000Z' })
    expect(active).toHaveLength(1)
    const runs = await db.prepare(
      'SELECT status FROM deal_source_runs ORDER BY finished_at',
    ).all<{ status: string }>()
    expect(runs.results.map((row) => row.status).sort()).toEqual(['failed', 'success'])
  })

  it('rejects malformed candidates before any deal row is written', async () => {
    const item = candidate({ validTo: '2026-99-40' })

    await expect(upsertDealItems(env, {
      candidates: [candidate(), item],
      retailerId: item.retailerId,
      sourceKey: 'woolworths::promotions',
    })).rejects.toThrow(/validTo/)

    const count = await db.prepare('SELECT COUNT(*) AS total FROM deal_items')
      .first<{ total: number }>()
    expect(count?.total).toBe(0)
  })
})

function candidate(overrides: Partial<RetailerDealCandidate> = {}): RetailerDealCandidate {
  return {
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Public promotion feed',
    imageUrl: 'https://images.woolworths.co.za/product-1.webp',
    priceCents: 9_999,
    previousPriceCents: 12_499,
    productId: 'product-1',
    productUrl: 'https://www.woolworths.co.za/product/product-1',
    promotionId: 'promotion-1',
    retailerId: retailerSlug('woolworths'),
    savingText: 'Save R25',
    scope: { type: 'national' },
    sourceKind: 'structured',
    sourceUrl: 'https://www.woolworths.co.za/promotions',
    termsText: 'Offer valid while stocks last',
    title: 'Household product',
    unitText: '2 kg',
    validFrom: '2026-07-16',
    validTo: '2026-07-20',
    ...overrides,
  }
}

function splitMigrationStatements(migration: string) {
  const triggerStart = migration.indexOf('CREATE TRIGGER')
  const ordinarySql = triggerStart < 0 ? migration : migration.slice(0, triggerStart)
  const statements = ordinarySql.split(';').map((value) => value.trim()).filter(Boolean)

  if (triggerStart >= 0) {
    statements.push(...(migration.slice(triggerStart).match(/CREATE TRIGGER[\s\S]*?END;/g) ?? []))
  }

  return statements
}
