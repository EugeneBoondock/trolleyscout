// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readDealSnapshots: vi.fn(),
}))

vi.mock('./dealSnapshotStore', () => ({
  readDealSnapshots: mocks.readDealSnapshots,
}))

import type { TrolleyScoutEnv } from './env'
import { createDealWatch, matchPendingWatches } from './dealWatchStore'

const dealWatchMigrationUrl = new NodeUrl('../../migrations/0016_deal_watches.sql', import.meta.url)

interface PendingWatchRow {
  id: string
  matched_at: string | null
}

describe('deal watch store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    vi.resetAllMocks()
    mocks.readDealSnapshots.mockResolvedValue(new Map())

    miniflare = new Miniflare({
      d1Databases: { DB: 'deal-watch-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    const migration = (await readFile(dealWatchMigrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('matches every pending watch in a single D1 batch call', async () => {
    mocks.readDealSnapshots.mockResolvedValue(new Map([
      ['scout-1', {
        checkedAt: '2026-07-23T09:00:00.000Z',
        deals: [{ title: 'Peanut Butter 1kg', retailerName: 'Pick n Pay', sourceUrl: 'https://example.co.za/pb' }],
      }],
    ]))

    await insertPendingWatch(db, 'watch-match', 'peanut butter')
    await insertPendingWatch(db, 'watch-no-match', 'tomato sauce')

    let batchCalls = 0
    const guardedDb = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            batchCalls += 1
            return target.batch(statements)
          }
        }
        const value = target[property as keyof D1Database]
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const matched = await matchPendingWatches({ DB: guardedDb })

    expect(matched).toBe(1)
    expect(batchCalls).toBe(1)

    const rows = await db.prepare('SELECT id, matched_at FROM deal_watches ORDER BY id')
      .all<PendingWatchRow>()
    const byId = new Map(rows.results.map((row) => [row.id, row.matched_at]))
    expect(byId.get('watch-match')).not.toBeNull()
    expect(byId.get('watch-no-match')).toBeNull()
  })

  it('skips the D1 batch call entirely when nothing in the corpus matches', async () => {
    mocks.readDealSnapshots.mockResolvedValue(new Map([
      ['scout-1', {
        checkedAt: '2026-07-23T09:00:00.000Z',
        deals: [{ title: 'Milk 1L', sourceUrl: 'https://example.co.za/milk' }],
      }],
    ]))

    await insertPendingWatch(db, 'watch-no-match', 'banana')

    let batchCalls = 0
    const guardedDb = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            batchCalls += 1
            return target.batch(statements)
          }
        }
        const value = target[property as keyof D1Database]
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const matched = await matchPendingWatches({ DB: guardedDb })

    expect(matched).toBe(0)
    expect(batchCalls).toBe(0)
  })

  it('does not create a duplicate row when the same query is watched twice', async () => {
    const first = await createDealWatch(env, 'account-1', 'Peanut Butter')
    const second = await createDealWatch(env, 'account-1', 'peanut butter!!')

    expect(first.watch?.id).toBeDefined()
    expect(second.watch?.id).toBe(first.watch?.id)

    const count = await db.prepare('SELECT COUNT(*) AS total FROM deal_watches')
      .first<{ total: number }>()
    expect(count?.total).toBe(1)
  })
})

async function insertPendingWatch(db: D1Database, id: string, queryText: string): Promise<void> {
  await db.prepare(
    `INSERT INTO deal_watches (id, account_id, query_text, normalized_query, created_at)
      VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, 'account-1', queryText, queryText.toLowerCase(), '2026-07-23T09:00:00.000Z')
    .run()
}
