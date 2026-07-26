// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { readSourceHealth, recordSourceHealth, truncationAlert } from './sourceHealth'

const migrationUrls = [
  new NodeUrl('../../migrations/0013_deal_items.sql', import.meta.url),
  new NodeUrl('../../migrations/0033_deal_item_sold_out.sql', import.meta.url),
  new NodeUrl('../../migrations/0034_deal_item_country.sql', import.meta.url),
  new NodeUrl('../../migrations/0036_source_health.sql', import.meta.url),
]

const NOW = '2026-07-26T12:00:00.000Z'
const hoursBefore = (hours: number) =>
  new Date(Date.parse(NOW) - hours * 60 * 60 * 1000).toISOString()

describe('source health', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'source-health-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    for (const url of migrationUrls) {
      const migration = (await readFile(url, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  async function snapshot(retailerId: string, count: number, capturedAt: string) {
    await db.prepare(
      `INSERT INTO source_health_snapshots
        (retailer_id, country_code, active_deal_count, captured_at) VALUES (?, 'ZA', ?, ?)`,
    ).bind(retailerId, count, capturedAt).run()
  }

  async function run(
    sourceKey: string,
    retailerId: string,
    status: string,
    candidateCount: number,
    createdAt: string,
  ) {
    await db.prepare(
      `INSERT INTO deal_source_runs
        (id, source_key, retailer_id, status, started_at, finished_at,
         candidate_count, written_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).bind(
      `run-${sourceKey}-${createdAt}`, sourceKey, retailerId, status,
      createdAt, createdAt, candidateCount, createdAt,
    ).run()
  }

  describe('recordSourceHealth', () => {
    async function storeDeal(retailerId: string, id: string, expiresAt: string) {
      // The run row first: deal_items.last_run_id points at it.
      await db.prepare(
        `INSERT OR IGNORE INTO deal_source_runs
          (id, source_key, retailer_id, status, started_at, finished_at,
           candidate_count, written_count, created_at)
          VALUES ('run-1', 'src', ?, 'success', ?, ?, 1, 1, ?)`,
      ).bind(retailerId, NOW, NOW, NOW).run()
      await db.prepare(
        `INSERT INTO deal_items
          (id, retailer_id, source_key, last_run_id, source_product_id, promotion_id,
           title, current_price_cents, evidence_text, product_url, source_url,
           source_kind, captured_at, expires_at, scope_type, scope_store_ids,
           scope_region_ids, excluded_store_ids, scope_key, content_fingerprint,
           status, created_at, updated_at, last_seen_at)
          VALUES (?, ?, 'src', 'run-1', ?, 'promo', 'Item', 1000, 'evidence',
                  'https://shop.test/p', 'https://shop.test', 'structured', ?, ?,
                  'national', '[]', '[]', '[]', 'national', ?, 'active', ?, ?, ?)`,
      ).bind(id, retailerId, id, NOW, expiresAt, id.padEnd(64, 'a').slice(0, 64), NOW, NOW, NOW)
        .run()
    }

    it('writes a zero for a retailer that has fallen to nothing', async () => {
      // A missing row and a zero row read the same to a person, but only a zero
      // can be compared against yesterday — which is the whole alarm.
      await storeDeal('checkers', 'gone-1', hoursBefore(48))

      const written = await recordSourceHealth(env, NOW)

      const rows = await db.prepare(
        'SELECT retailer_id, active_deal_count FROM source_health_snapshots',
      ).all<{ active_deal_count: number; retailer_id: string }>()
      expect(written).toBe(1)
      expect(rows.results).toEqual([{ active_deal_count: 0, retailer_id: 'checkers' }])
    })

    it('counts only what is live now', async () => {
      await storeDeal('shoprite', 'live-1', hoursBefore(-48))
      await storeDeal('shoprite', 'stale-1', hoursBefore(48))

      await recordSourceHealth(env, NOW)

      const row = await db.prepare(
        'SELECT active_deal_count FROM source_health_snapshots WHERE retailer_id = ?',
      ).bind('shoprite').first<{ active_deal_count: number }>()
      expect(row?.active_deal_count).toBe(1)
    })
  })

  describe('readSourceHealth', () => {
    it('raises the alarm when a retailer falls to nothing', async () => {
      await snapshot('shoprite', 615, hoursBefore(24))
      await snapshot('shoprite', 0, NOW)

      const report = await readSourceHealth(env, NOW)

      expect(report.healthy).toBe(false)
      expect(report.alerts).toHaveLength(1)
      expect(report.alerts[0]).toMatchObject({
        currentCount: 0,
        level: 'collapsed',
        peakCount: 615,
        retailerId: 'shoprite',
      })
      expect(report.alerts[0].detail).toContain('615')
    })

    it('raises the alarm on a half-broken feed, not only a dead one', async () => {
      // Eight of sixteen shards answering is fully broken to the shopper who
      // wanted the other eight.
      await snapshot('takealot', 1000, hoursBefore(24))
      await snapshot('takealot', 300, NOW)

      const report = await readSourceHealth(env, NOW)
      expect(report.alerts.map((alert) => alert.retailerId)).toEqual(['takealot'])
    })

    it('stays quiet for a retailer holding its own', async () => {
      await snapshot('makro', 765, hoursBefore(24))
      await snapshot('makro', 700, NOW)

      const report = await readSourceHealth(env, NOW)
      expect(report.healthy).toBe(true)
    })

    it('stays quiet for a shop too small for a fall to mean anything', async () => {
      // Three deals becoming none is a quiet week, not a broken feed.
      await snapshot('tiny-shop', 3, hoursBefore(24))
      await snapshot('tiny-shop', 0, NOW)

      const report = await readSourceHealth(env, NOW)
      expect(report.healthy).toBe(true)
    })

    it('forgets a peak old enough to be another era', async () => {
      // A retailer deliberately dropped should stop being compared with its
      // own ghost, or the alarm never stops ringing.
      await snapshot('retired', 800, hoursBefore(200))
      await snapshot('retired', 0, NOW)

      const report = await readSourceHealth(env, NOW)
      expect(report.healthy).toBe(true)
    })

    it('names a source that keeps answering with nothing', async () => {
      // What Mr Price did for months: every run succeeded and every run was
      // empty, because the query asked the wrong field.
      for (let index = 0; index < 7; index += 1) {
        await run('mr-price::markdowns', 'mr-price', 'success', 0, hoursBefore(index + 1))
      }

      const report = await readSourceHealth(env, NOW)
      const barren = report.alerts.find((alert) => alert.level === 'barren')
      expect(barren).toMatchObject({ retailerId: 'mr-price', sourceKey: 'mr-price::markdowns' })
    })

    it('leaves a source alone that is merely having a quiet run or two', async () => {
      await run('boxer::leaflets-gauteng', 'boxer', 'success', 0, hoursBefore(2))
      await run('boxer::leaflets-gauteng', 'boxer', 'success', 0, hoursBefore(1))

      const report = await readSourceHealth(env, NOW)
      expect(report.alerts).toEqual([])
    })

    it('reports a source whose last run failed', async () => {
      await run('clicks::promotion-products', 'clicks', 'success', 40, hoursBefore(3))
      await run('clicks::promotion-products', 'clicks', 'failed', 0, hoursBefore(1))

      const report = await readSourceHealth(env, NOW)
      expect(report.alerts).toContainEqual(expect.objectContaining({
        level: 'failing',
        sourceKey: 'clicks::promotion-products',
      }))
    })

    it('puts a vanished shop above a merely quiet one', async () => {
      await snapshot('shoprite', 615, hoursBefore(24))
      await snapshot('shoprite', 0, NOW)
      for (let index = 0; index < 7; index += 1) {
        await run('mr-price::markdowns', 'mr-price', 'success', 0, hoursBefore(index + 1))
      }

      const report = await readSourceHealth(env, NOW)
      expect(report.alerts.map((alert) => alert.level)).toEqual(['collapsed', 'barren'])
    })

    it('is healthy with nothing recorded yet', async () => {
      const report = await readSourceHealth(env, NOW)
      expect(report).toMatchObject({ alerts: [], checkedRetailerCount: 0, healthy: true })
    })
  })

  describe('truncationAlert', () => {
    it('says what a full bucket costs rather than just that it is full', () => {
      const alert = truncationAlert(25_000)
      expect(alert.level).toBe('truncated')
      expect(alert.detail).toContain('25000')
      expect(alert.detail).toContain('longest-running')
    })
  })
})

function splitMigrationStatements(migration: string) {
  const triggerStart = migration.indexOf('CREATE TRIGGER')
  const ordinarySql = triggerStart < 0 ? migration : migration.slice(0, triggerStart)
  const statements = ordinarySql.split(';').map((value) => value.trim()).filter(Boolean)

  if (triggerStart >= 0) {
    statements.push(...(migration.slice(triggerStart).match(/CREATE TRIGGER[\s\S]*?END;/g) ?? []))
  }

  return statements
}
