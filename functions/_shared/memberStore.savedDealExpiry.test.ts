// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  listExpiringSavedDeals,
  listSavedDeals,
  purgeExpiredSavedDeals,
} from './memberStore'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0003_saved_deals.sql', import.meta.url),
  new NodeUrl('../../migrations/0005_deal_snapshots.sql', import.meta.url),
  new NodeUrl('../../migrations/0019_deal_site_cache.sql', import.meta.url),
  new NodeUrl('../../migrations/0028_saved_deal_images.sql', import.meta.url),
  new NodeUrl('../../migrations/0029_saved_deal_expiry.sql', import.meta.url),
]

// 0029 backfills from deal_items. Its own migration carries triggers whose
// BEGIN...END bodies the statement splitter here cannot handle, so stand in
// the few columns the backfill actually reads.
const DEAL_ITEMS_STANDIN = `CREATE TABLE IF NOT EXISTS deal_items (
  id TEXT PRIMARY KEY,
  product_url TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  valid_to TEXT
)`

const NOW = Date.parse('2026-07-24T09:00:00.000Z')
const day = (offset: number) =>
  new Date(NOW + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

describe('saved deal expiry', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'saved-deal-expiry-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    await db.prepare(DEAL_ITEMS_STANDIN).run()

    for (const migrationUrl of migrationUrls) {
      const migration = (await readFile(migrationUrl, 'utf8'))
        .replace(/^--.*$/gm, '')
        .trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }

    await db.prepare(
      `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status)
       VALUES ('member-1', 'member@example.test', 'Member', 'free', 'active')`,
    ).run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  async function insertSaved(id: string, validTo: string | null) {
    await db.prepare(
      `INSERT INTO member_saved_deals (
        id, account_id, deal_id, retailer_id, source_label, source_url, product_url,
        title, captured_at, evidence_text, created_at, valid_to
      ) VALUES (?, 'member-1', ?, 'checkers', 'Specials', 'https://checkers.co.za/specials',
        ?, ?, '2026-07-01T00:00:00.000Z', 'was R20 now R10', '2026-07-01T00:00:00.000Z', ?)`,
    )
      .bind(id, id, `https://checkers.co.za/p/${id}`, `Deal ${id}`, validTo)
      .run()
  }

  it('hides a saved offer whose last day has passed', async () => {
    await insertSaved('closed', day(-1))
    await insertSaved('open', day(5))

    const saved = await listSavedDeals(env, 'member-1', NOW)

    expect(saved.map((deal) => deal.title)).toEqual(['Deal open'])
  })

  it('keeps an offer that ends today, because it is still valid today', async () => {
    await insertSaved('ends-today', day(0))
    expect(await listSavedDeals(env, 'member-1', NOW)).toHaveLength(1)
  })

  it('keeps an offer with no stated end date rather than guessing it closed', async () => {
    await insertSaved('undated', null)
    expect(await listSavedDeals(env, 'member-1', NOW)).toHaveLength(1)
  })

  it('reports the offers closing inside the warning window, soonest first', async () => {
    await insertSaved('today', day(0))
    await insertSaved('in-two', day(2))
    await insertSaved('far-off', day(30))
    await insertSaved('undated', null)

    const expiring = await listExpiringSavedDeals(env, 'member-1', 3, NOW)

    expect(expiring.map((deal) => deal.title)).toEqual(['Deal today', 'Deal in-two'])
  })

  it('does not report an offer that has already closed as expiring', async () => {
    await insertSaved('closed', day(-2))
    expect(await listExpiringSavedDeals(env, 'member-1', 3, NOW)).toEqual([])
  })

  it('clears offers only once the grace period has passed', async () => {
    await insertSaved('just-closed', day(-2))
    await insertSaved('long-closed', day(-30))
    await insertSaved('open', day(3))

    const removed = await purgeExpiredSavedDeals(env, NOW)

    const remaining = await db.prepare(
      'SELECT id FROM member_saved_deals ORDER BY id',
    ).all<{ id: string }>()
    expect(removed).toBe(1)
    expect(remaining.results.map((row) => row.id)).toEqual(['just-closed', 'open'])
  })

  it('returns nothing for a signed-out shopper', async () => {
    await insertSaved('open', day(3))
    expect(await listSavedDeals(env, undefined, NOW)).toEqual([])
    expect(await listExpiringSavedDeals(env, undefined)).toEqual([])
  })
})

function splitMigrationStatements(migration: string): string[] {
  return migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
