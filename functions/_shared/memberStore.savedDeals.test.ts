// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import { saveMemberDeal } from './memberStore'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0003_saved_deals.sql', import.meta.url),
  new NodeUrl('../../migrations/0019_deal_site_cache.sql', import.meta.url),
]

describe('saved discovery deals', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'member-saved-deals-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

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
       VALUES (?, ?, ?, 'free', 'active')`,
    ).bind('member-1', 'member@example.test', 'Member').run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('saves a deal-site item only when it matches the cached discovery row', async () => {
    const cached = {
      id: 'onedayonly-42',
      source: 'onedayonly',
      retailerName: 'OneDayOnly',
      sourceLabel: 'OneDayOnly',
      title: 'Trusted daily deal',
      productUrl: 'https://www.onedayonly.co.za/products/trusted-daily-deal',
      priceText: 'R199',
    }
    await db.prepare(
      `INSERT INTO deal_site_cache (source_key, payload_json, item_count, fetched_at)
       VALUES (?, ?, ?, ?)`,
    ).bind('onedayonly', JSON.stringify([cached]), 1, '2026-07-21T12:00:00.000Z').run()

    const result = await saveMemberDeal(env, 'member-1', {
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Found by Trolley Scout from the cached OneDayOnly feed.',
      id: cached.id,
      priceText: cached.priceText,
      productUrl: cached.productUrl,
      retailerId: cached.source,
      retailerName: cached.retailerName,
      sourceLabel: cached.sourceLabel,
      sourceUrl: cached.productUrl,
      title: cached.title,
    })

    expect(result.issues).toBeUndefined()
    expect(result.savedDeal).toMatchObject({
      id: expect.any(String),
      productUrl: cached.productUrl,
      retailerId: 'onedayonly',
      sourceLabel: 'OneDayOnly',
    })
  })

  it('saves a structured feed deal whose source lives on the retailer domain', async () => {
    // Regression: requiring an exact registry source URL rejected every feed
    // deal (their sourceUrl is the feed endpoint, not the landing page).
    const result = await saveMemberDeal(env, 'member-1', {
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Woolworths all-savings feed row.',
      id: 'woolworths-pop-chips',
      priceText: 'R10.99',
      productUrl: 'https://www.woolworths.co.za/prod/pop-chips/123',
      retailerId: 'woolworths',
      retailerName: 'Woolworths',
      sourceLabel: 'All savings',
      sourceUrl: 'https://www.woolworths.co.za/browse/food-south-africa/all-savings',
      title: 'Pop! Chip Smoked Paprika 28 g',
    })

    expect(result.issues).toBeUndefined()
    expect(result.savedDeal).toMatchObject({
      retailerId: 'woolworths',
      sourceLabel: 'All savings',
    })
  })

  it('saves a catalogue deal from a retailer subdomain leaflet', async () => {
    const result = await saveMemberDeal(env, 'member-1', {
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Catalogue scan row.',
      id: 'checkers-catalogue-1',
      priceText: 'R36.99',
      productUrl: 'https://specials.checkers.co.za/current/index.html#page=2',
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceLabel: 'Catalogue scan',
      sourceUrl: 'https://specials.checkers.co.za/current/index.html',
      title: 'Albany Wraps All Variants 250g',
    })

    expect(result.issues).toBeUndefined()
    expect(result.savedDeal).toMatchObject({
      retailerId: 'checkers',
      sourceLabel: 'Catalogue scan',
    })
  })

  it('still rejects a registry retailer deal pointing off the official domain', async () => {
    const result = await saveMemberDeal(env, 'member-1', {
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Untrusted submission.',
      id: 'fake-woolworths',
      productUrl: 'https://attacker.example/fake',
      retailerId: 'woolworths',
      retailerName: 'Woolworths',
      sourceLabel: 'All savings',
      sourceUrl: 'https://attacker.example/feed',
      title: 'Fake deal',
    })

    expect(result.savedDeal).toBeUndefined()
    expect(result.issues).toEqual(['Save deals only from verified Trolley Scout sources.'])
  })

  it('rejects an arbitrary URL that is not in the cached discovery feed', async () => {
    await db.prepare(
      `INSERT INTO deal_site_cache (source_key, payload_json, item_count, fetched_at)
       VALUES (?, ?, 0, ?)`,
    ).bind('onedayonly', '[]', '2026-07-21T12:00:00.000Z').run()

    const result = await saveMemberDeal(env, 'member-1', {
      capturedAt: '2026-07-21T12:00:00.000Z',
      evidenceText: 'Untrusted submission.',
      id: 'fake',
      productUrl: 'https://attacker.example/fake',
      retailerId: 'onedayonly',
      retailerName: 'OneDayOnly',
      sourceLabel: 'OneDayOnly',
      sourceUrl: 'https://attacker.example/fake',
      title: 'Fake deal',
    })

    expect(result.savedDeal).toBeUndefined()
    expect(result.issues).toEqual(['Save deals only from verified Trolley Scout sources.'])
  })
})

function splitMigrationStatements(sql: string) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
