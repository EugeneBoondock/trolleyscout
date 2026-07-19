// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  MAX_DEAL_ALERT_BATCH_KEYS,
  MAX_DEAL_ALERT_RESPONSE_COUNT,
  readDealAlertSummary,
  recordGlobalDealAlertBatch,
  runDealRefreshWithAlerts,
  snapshotDealAlertKeys,
} from './dealAlertStore'

const migrationUrl = new NodeUrl('../../migrations/0023_deal_alert_batches.sql', import.meta.url)

describe('deal alert store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'deal-alert-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    const migration = (await readFile(migrationUrl, 'utf8'))
      .replace(/^--.*$/gm, '')
      .trim()
    for (const statement of migration.split(';').map((value) => value.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('snapshots stable keys from the discovery corpus and deal-site feed', async () => {
    const dependencies = {
      nowMs: () => Date.parse('2026-07-19T12:00:00.000Z'),
      readNormalizedDealsPage: async (_env: TrolleyScoutEnv, _now: string, _limit: number, offset: number) => offset === 0 ? [
        {
          productUrl: 'https://shop.test/products/rice?sku=rice-5kg&ref=home',
          retailerName: 'Shop Test',
          sourceUrl: 'https://shop.test/specials',
          title: 'Rice 5 kg',
        },
      ] : [],
      readPromotionsPage: async (_env: TrolleyScoutEnv, _now: string, _limit: number, offset: number) => offset === 0 ? [
        {
          id: 'milk-special',
          kind: 'deal' as const,
          placeId: 'market-test',
          sourceUrl: 'https://market.test/specials',
          storeName: 'Market Test',
          title: 'Milk 2 L',
        },
      ] : [],
      readSnapshots: async () => new Map([
        ['shop-test::specials', {
          checkedAt: '2026-07-19T12:00:00.000Z',
          deals: [{
            capturedAt: '2026-07-19T12:00:00.000Z',
            evidenceText: 'Rice special',
            id: 'rice-2kg',
            priceText: 'R19.99',
            productUrl: 'https://shop.test/products/rice?sku=rice-2kg&ref=home',
            retailerId: 'shop-test',
            retailerName: 'Shop Test',
            sourceLabel: 'Specials',
            sourceUrl: 'https://shop.test/specials',
            title: 'Rice 2 kg',
          }],
        }],
      ]),
      readDealSites: async () => ({
        deals: [
          {
            id: 'onedayonly-42',
            productUrl: 'https://www.onedayonly.co.za/products/example',
            retailerName: 'OneDayOnly',
            source: 'onedayonly' as const,
            sourceLabel: 'Daily deals',
            title: 'Kitchen set',
          },
        ],
        sources: [],
      }),
    }

    const first = await snapshotDealAlertKeys(env, dependencies)
    const second = await snapshotDealAlertKeys(env, {
      ...dependencies,
      readNormalizedDealsPage: async (_env, _now, _limit, offset) => offset === 0 ? [{
        productUrl: 'https://shop.test/products/rice?ref=campaign&sku=rice-5kg',
        retailerName: 'Shop Test',
        sourceUrl: 'https://shop.test/specials',
        title: 'Rice 5 kg',
      }] : [],
      readSnapshots: async () => new Map([
        ['shop-test::specials', {
          checkedAt: '2026-07-19T12:05:00.000Z',
          deals: [{
            capturedAt: '2026-07-19T12:05:00.000Z',
            evidenceText: 'Rice special updated',
            id: 'rice-2kg-updated',
            priceText: 'R17.99',
            productUrl: 'https://shop.test/products/rice?ref=campaign&sku=rice-2kg',
            retailerId: 'shop-test',
            retailerName: 'Shop Test',
            sourceLabel: 'Specials',
            sourceUrl: 'https://shop.test/specials',
            title: 'Rice 2 kg',
          }],
        }],
      ]),
      readDealSites: dependencies.readDealSites,
    })

    expect(first).toHaveLength(4)
    expect(second).toEqual(first)
    expect(first).toEqual([...first].sort())
  })

  it('pages beyond two hundred active normalized deals without truncating the snapshot', async () => {
    const deals = Array.from({ length: 450 }, (_, index) => ({
      productUrl: `https://shop.test/products/${index}`,
      retailerName: 'Shop Test',
      sourceUrl: 'https://shop.test/specials',
      title: `Deal ${index}`,
    }))
    const readNormalizedDealsPage = vi.fn(async (
      _env: TrolleyScoutEnv,
      _now: string,
      limit: number,
      offset: number,
    ) => deals.slice(offset, offset + limit))

    const keys = await snapshotDealAlertKeys(env, {
      nowMs: () => Date.parse('2026-07-19T12:00:00.000Z'),
      readDealSites: async () => ({ deals: [], sources: [] }),
      readNormalizedDealsPage,
      readPromotionsPage: async () => [],
      readSnapshots: async () => new Map(),
    })

    expect(keys).toHaveLength(450)
    expect(readNormalizedDealsPage).toHaveBeenNthCalledWith(
      1,
      env,
      '2026-07-19T12:00:00.000Z',
      200,
      0,
    )
    expect(readNormalizedDealsPage).toHaveBeenNthCalledWith(
      3,
      env,
      '2026-07-19T12:00:00.000Z',
      200,
      400,
    )
  })

  it('rejects the whole snapshot when one strict corpus lane fails', async () => {
    await expect(snapshotDealAlertKeys(env, {
      readDealSites: async () => ({ deals: [], sources: [] }),
      readNormalizedDealsPage: async () => [],
      readPromotionsPage: async () => {
        throw new Error('store promotion query failed')
      },
      readSnapshots: async () => new Map(),
    })).rejects.toThrow('store promotion query failed')
  })

  it('records one global batch only for keys added after a refresh', async () => {
    const first = await recordGlobalDealAlertBatch(
      env,
      ['deal-a', 'deal-b'],
      ['deal-b', 'deal-a', 'deal-c', 'deal-c'],
      '2026-07-19T12:00:00.000Z',
    )
    const duplicate = await recordGlobalDealAlertBatch(
      env,
      ['deal-a', 'deal-b'],
      ['deal-a', 'deal-b', 'deal-c'],
      '2026-07-19T12:00:01.000Z',
    )
    const unchanged = await recordGlobalDealAlertBatch(
      env,
      ['deal-a', 'deal-b', 'deal-c'],
      ['deal-a', 'deal-b', 'deal-c'],
      '2026-07-19T12:00:02.000Z',
    )

    const rows = await db.prepare(
      'SELECT cursor, deal_count, deal_keys_json, created_at FROM deal_alert_batches',
    ).all<{
      cursor: number
      deal_count: number
      deal_keys_json: string
      created_at: string
    }>()

    expect(first).toMatchObject({ inserted: true, newDealCount: 1 })
    expect(duplicate).toMatchObject({ inserted: false, newDealCount: 1 })
    expect(unchanged).toEqual({ inserted: false, newDealCount: 0 })
    expect(rows.results).toHaveLength(1)
    expect(rows.results[0]).toMatchObject({
      created_at: '2026-07-19T12:00:00.000Z',
      deal_count: 1,
    })
    expect(JSON.parse(rows.results[0].deal_keys_json)).toEqual(['deal-c'])
  })

  it('uses one before and after snapshot around an explicit refresh', async () => {
    const order: string[] = []
    const snapshotKeys = vi.fn(async () => {
      const phase = snapshotKeys.mock.calls.length === 1 ? 'before' : 'after'
      order.push(`snapshot-${phase}`)
      return phase === 'before' ? ['deal-a'] : ['deal-a', 'deal-b']
    })
    const recordBatch = vi.fn(async (
      _env: TrolleyScoutEnv,
      beforeKeys: readonly string[],
      afterKeys: readonly string[],
    ) => {
      order.push('record-batch')
      expect(beforeKeys).toEqual(['deal-a'])
      expect(afterKeys).toEqual(['deal-a', 'deal-b'])
      return { cursor: 4, inserted: true, newDealCount: 1 }
    })

    const result = await runDealRefreshWithAlerts(
      env,
      async () => {
        order.push('refresh')
        return 27
      },
      {
        createdAt: () => '2026-07-19T12:00:00.000Z',
        recordBatch,
        snapshotKeys,
      },
    )

    expect(order).toEqual([
      'snapshot-before',
      'refresh',
      'snapshot-after',
      'record-batch',
    ])
    expect(result).toEqual({
      alerts: {
        afterSnapshotCount: 2,
        batchFailed: false,
        batchInserted: true,
        beforeSnapshotCount: 1,
        newDealCount: 1,
        snapshotFailed: false,
      },
      value: 27,
    })
  })

  it('uses an omitted cursor as a baseline and aggregates later batches', async () => {
    await recordGlobalDealAlertBatch(env, [], ['deal-a', 'deal-b'])
    const firstCursor = (await readDealAlertSummary(env, 0)).latestCursor
    await recordGlobalDealAlertBatch(env, ['deal-a', 'deal-b'], ['deal-a', 'deal-b', 'deal-c'])

    await expect(readDealAlertSummary(env)).resolves.toMatchObject({
      countCapped: false,
      totalNewDealCount: 0,
    })
    await expect(readDealAlertSummary(env, firstCursor)).resolves.toMatchObject({
      countCapped: false,
      totalNewDealCount: 1,
    })
  })

  it('reads the latest cursor and later count from one atomic aggregate query', async () => {
    const first = vi.fn(async () => ({ latest_cursor: 17, total: 6 }))
    const bind = vi.fn(() => ({ first }))
    const prepare = vi.fn((_sql: string) => ({ bind }))
    const atomicEnv = { DB: { prepare } } as unknown as TrolleyScoutEnv & { DB: D1Database }

    await expect(readDealAlertSummary(atomicEnv, 12)).resolves.toEqual({
      countCapped: false,
      latestCursor: 17,
      totalNewDealCount: 6,
    })

    expect(prepare).toHaveBeenCalledTimes(1)
    expect(prepare.mock.calls[0]?.[0]).toContain('MAX(cursor)')
    expect(prepare.mock.calls[0]?.[0]).toContain('SUM(CASE WHEN cursor > ?')
    expect(bind).toHaveBeenCalledWith(12)
  })

  it('rejects a batch larger than the server limit', async () => {
    const keys = Array.from(
      { length: MAX_DEAL_ALERT_BATCH_KEYS + 1 },
      (_, index) => `deal-${index}`,
    )

    await expect(recordGlobalDealAlertBatch(env, [], keys)).rejects.toThrow(
      `A deal alert batch cannot exceed ${MAX_DEAL_ALERT_BATCH_KEYS} keys.`,
    )
  })

  it('caps an old device response without returning unbounded data', async () => {
    const first = Array.from(
      { length: MAX_DEAL_ALERT_BATCH_KEYS },
      (_, index) => `first-${index}`,
    )
    const second = Array.from(
      { length: MAX_DEAL_ALERT_BATCH_KEYS },
      (_, index) => `second-${index}`,
    )
    await recordGlobalDealAlertBatch(env, [], first)
    await recordGlobalDealAlertBatch(env, [], second)

    await expect(readDealAlertSummary(env, 0)).resolves.toMatchObject({
      countCapped: true,
      totalNewDealCount: MAX_DEAL_ALERT_RESPONSE_COUNT,
    })
  })
})
