// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { listDealReports, moderateDealReport, submitDealReport } from './dealReportStore'

const migrationUrl = new NodeUrl('../../migrations/0049_deal_reports.sql', import.meta.url)

describe('deal report store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'deal-report-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
    for (const statement of migration.split(';').map((part) => part.trim()).filter(Boolean)) {
      await db.prepare(statement).run()
    }
  })

  afterEach(async () => miniflare.dispose())

  it('stores source evidence and returns it to the moderation queue', async () => {
    const result = await submitDealReport(env, 'member-1', 'ZA', draft())

    expect(result.report).toMatchObject({
      accountId: 'member-1',
      countryCode: 'ZA',
      reason: 'price_wrong',
      sourceUrl: 'https://shop.example/specials',
      status: 'pending',
    })
    expect(await listDealReports(env)).toHaveLength(1)
  })

  it('updates one shopper report instead of padding the queue', async () => {
    await submitDealReport(env, 'member-1', 'ZA', draft())
    await submitDealReport(env, 'member-1', 'ZA', draft({ reason: 'expired' }))

    const reports = await listDealReports(env)
    expect(reports).toHaveLength(1)
    expect(reports[0].reason).toBe('expired')
  })

  it('lets an admin resolve a pending report', async () => {
    const saved = await submitDealReport(env, 'member-1', 'ZA', draft())

    expect(await moderateDealReport(env, saved.report!.id, 'resolved')).toEqual({ changed: true })
    expect(await listDealReports(env)).toEqual([])
    expect((await listDealReports(env, 'resolved'))[0].status).toBe('resolved')
  })

  it('requires a note when the listed reasons do not fit', async () => {
    const result = await submitDealReport(env, 'member-1', 'ZA', draft({ reason: 'other' }))
    expect(result.issues).toEqual(['Add a short note for this report.'])
  })
})

function draft(overrides: Partial<Parameters<typeof submitDealReport>[3]> = {}) {
  return {
    dealId: 'deal-1',
    productUrl: 'https://shop.example/product/1',
    reason: 'price_wrong' as const,
    retailerId: 'shop',
    retailerName: 'Shop',
    sourceUrl: 'https://shop.example/specials',
    title: 'Rice 2 kg',
    ...overrides,
  }
}
