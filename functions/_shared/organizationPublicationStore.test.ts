// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  advanceOrganizationPublicationStatuses,
  createOrganizationLocation,
  createOrganizationPublication,
  listLiveOrganizationPublications,
  listOrganizationLocations,
  listOrganizationPublications,
  readOrganizationMetrics,
  recordOrganizationPublicationEvent,
  reviewOrganizationPublication,
  submitOrganizationPublication,
  updateOrganizationPublication,
} from './organizationPublicationStore'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0008_auth_roles.sql', import.meta.url),
  new NodeUrl('../../migrations/0030_organization_onboarding.sql', import.meta.url),
  new NodeUrl('../../migrations/0035_organization_publications.sql', import.meta.url),
  new NodeUrl('../../migrations/0043_developer_mcp_campaign_insights.sql', import.meta.url),
]

const dealDraft = {
  bodyText: 'Two kilograms of fresh potatoes at a lower weekend price.',
  currencyCode: 'ZAR',
  endsAt: '2026-08-02T18:00:00.000Z',
  imageAlt: 'A bag of fresh potatoes',
  imageUrl: 'https://images.example.co.za/potatoes.webp',
  kind: 'deal' as const,
  placement: 'both' as const,
  priceCents: 4999,
  previousPriceCents: 6999,
  startsAt: '2026-08-01T06:00:00.000Z',
  targetUrl: 'https://fresh.example.co.za/potatoes',
  title: 'Weekend potato deal',
}

describe('organization publication store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'organization-publication-store-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }

    for (const migrationUrl of migrationUrls) {
      const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }

    for (const [id, email, role] of [
      ['owner-1', 'owner@example.co.za', 'member'],
      ['owner-2', 'other@example.co.za', 'member'],
      ['admin-1', 'admin@example.co.za', 'admin'],
    ]) {
      await db.prepare(
        `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status, role)
          VALUES (?, ?, 'Member', 'organization', 'active', ?)`,
      ).bind(id, email, role).run()
    }

    await db.prepare(
      `INSERT INTO organizations (id, account_id, name, slug, status, created_at, updated_at)
        VALUES ('org-1', 'owner-1', 'Fresh Market', 'fresh-market', 'active', ?, ?)`,
    ).bind('2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z').run()
    await db.prepare(
      `INSERT INTO organizations (id, account_id, name, slug, status, created_at, updated_at)
        VALUES ('org-2', 'owner-2', 'Corner Market', 'corner-market', 'active', ?, ?)`,
    ).bind('2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z').run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('creates a valid deal as an owner draft', async () => {
    const result = await createOrganizationPublication(env, 'owner-1', dealDraft)

    expect(result.issues).toBeUndefined()
    expect(result.publication).toMatchObject({
      kind: 'deal',
      organizationId: 'org-1',
      placement: 'both',
      priceCents: 4999,
      status: 'draft',
      title: 'Weekend potato deal',
    })
    expect(await listOrganizationPublications(env, 'owner-1')).toHaveLength(1)
  })

  it('rejects a deal without a price, image, end date, or safe destination', async () => {
    const result = await createOrganizationPublication(env, 'owner-1', {
      ...dealDraft,
      endsAt: undefined,
      imageAlt: undefined,
      imageUrl: undefined,
      priceCents: undefined,
      targetUrl: 'javascript:alert(1)',
    })

    expect(result.publication).toBeUndefined()
    expect(result.issues).toEqual(expect.arrayContaining([
      'Add a current price greater than zero.',
      'Add a cover image and alternative text.',
      'Add an end date for this commercial publication.',
      'Use a valid HTTPS destination link.',
    ]))
  })

  it('allows posts in chosen destinations and rejects markup', async () => {
    const result = await createOrganizationPublication(env, 'owner-1', {
      bodyText: 'Fresh bread arrives every weekday at seven in the morning.',
      kind: 'post',
      placement: 'marketplace',
      title: 'Bread from the oven <today>',
    })

    expect(result.issues).toEqual(expect.arrayContaining([
      'Remove < and > from publication text.',
    ]))
  })

  it('does not let another organization edit an owner publication', async () => {
    const created = await createOrganizationPublication(env, 'owner-1', dealDraft)

    const result = await updateOrganizationPublication(
      env,
      'owner-2',
      created.publication!.id,
      { ...dealDraft, title: 'Changed by another owner' },
    )

    expect(result).toEqual({ issues: ['That publication was not found.'] })
    expect((await listOrganizationPublications(env, 'owner-1'))[0]?.title)
      .toBe('Weekend potato deal')
  })

  it('moves a submitted publication to scheduled or live only through review', async () => {
    const future = await createOrganizationPublication(env, 'owner-1', dealDraft)
    await submitOrganizationPublication(env, 'owner-1', future.publication!.id)
    const scheduled = await reviewOrganizationPublication(
      env,
      'admin-1',
      future.publication!.id,
      'approved',
      undefined,
      '2026-07-31T12:00:00.000Z',
    )

    const current = await createOrganizationPublication(env, 'owner-1', {
      ...dealDraft,
      endsAt: '2026-08-04T18:00:00.000Z',
      startsAt: '2026-07-30T06:00:00.000Z',
      title: 'Current potato deal',
    })
    await submitOrganizationPublication(env, 'owner-1', current.publication!.id)
    const live = await reviewOrganizationPublication(
      env,
      'admin-1',
      current.publication!.id,
      'approved',
      undefined,
      '2026-07-31T12:00:00.000Z',
    )

    expect(scheduled.publication?.status).toBe('scheduled')
    expect(live.publication?.status).toBe('live')
    expect(scheduled.changed).toBe(true)
    expect(live.changed).toBe(true)
  })

  it('serves only approved records inside their time and placement window', async () => {
    const current = await createOrganizationPublication(env, 'owner-1', {
      ...dealDraft,
      endsAt: '2026-08-04T18:00:00.000Z',
      startsAt: '2026-07-30T06:00:00.000Z',
    })
    await submitOrganizationPublication(env, 'owner-1', current.publication!.id)
    await reviewOrganizationPublication(
      env,
      'admin-1',
      current.publication!.id,
      'approved',
      undefined,
      '2026-07-31T12:00:00.000Z',
    )
    await createOrganizationPublication(env, 'owner-1', {
      ...dealDraft,
      title: 'Unsubmitted deal',
    })

    const marketplace = await listLiveOrganizationPublications(
      env,
      'marketplace',
      '2026-08-01T12:00:00.000Z',
    )
    const afterExpiry = await listLiveOrganizationPublications(
      env,
      'marketplace',
      '2026-08-05T12:00:00.000Z',
    )

    expect(marketplace.map((publication) => publication.title)).toEqual([
      'Weekend potato deal',
    ])
    expect(afterExpiry).toEqual([])
  })

  it('advances scheduled and expired status labels for the business workspace', async () => {
    const created = await createOrganizationPublication(env, 'owner-1', dealDraft)
    await submitOrganizationPublication(env, 'owner-1', created.publication!.id)
    await reviewOrganizationPublication(
      env,
      'admin-1',
      created.publication!.id,
      'approved',
      undefined,
      '2026-07-31T12:00:00.000Z',
    )

    expect(await advanceOrganizationPublicationStatuses(
      env,
      '2026-08-01T12:00:00.000Z',
    )).toBe(1)
    expect((await listOrganizationPublications(env, 'owner-1'))[0]?.status).toBe('live')

    expect(await advanceOrganizationPublicationStatuses(
      env,
      '2026-08-03T12:00:00.000Z',
    )).toBe(1)
    expect((await listOrganizationPublications(env, 'owner-1'))[0]?.status).toBe('expired')
  })

  it('creates locations for the owner and hides them from other organizations', async () => {
    const result = await createOrganizationLocation(env, 'owner-1', {
      addressLine: '12 Vilakazi Street',
      city: 'Soweto',
      countryCode: 'ZA',
      name: 'Orlando West',
      province: 'Gauteng',
    })

    expect(result.location).toMatchObject({
      city: 'Soweto',
      organizationId: 'org-1',
      status: 'active',
    })
    expect(await listOrganizationLocations(env, 'owner-1')).toHaveLength(1)
    expect(await listOrganizationLocations(env, 'owner-2')).toEqual([])
  })

  it('records daily aggregate events without a shopper identifier', async () => {
    const created = await createOrganizationPublication(env, 'owner-1', dealDraft)
    await submitOrganizationPublication(env, 'owner-1', created.publication!.id)
    await reviewOrganizationPublication(
      env,
      'admin-1',
      created.publication!.id,
      'approved',
      undefined,
      '2026-08-01T08:00:00.000Z',
    )
    await recordOrganizationPublicationEvent(
      env,
      created.publication!.id,
      'marketplace',
      'impression',
      '2026-08-01T10:00:00.000Z',
    )
    await recordOrganizationPublicationEvent(
      env,
      created.publication!.id,
      'marketplace',
      'impression',
      '2026-08-01T10:05:00.000Z',
    )
    await recordOrganizationPublicationEvent(
      env,
      created.publication!.id,
      'marketplace',
      'save',
      '2026-08-01T10:10:00.000Z',
    )

    const metrics = await readOrganizationMetrics(
      env,
      'owner-1',
      30,
      '2026-08-02T12:00:00.000Z',
    )
    const row = await db.prepare(
      `SELECT event_date, destination, impressions, image_views, saves, link_clicks
        FROM organization_publication_metrics_daily`,
    ).first<Record<string, number | string>>()

    expect(metrics.totals).toEqual({
      impressions: 2,
      imageViews: 0,
      linkClicks: 0,
      saves: 1,
    })
    expect(row).toEqual({
      event_date: '2026-08-01',
      destination: 'marketplace',
      impressions: 2,
      image_views: 0,
      link_clicks: 0,
      saves: 1,
    })
    expect(Object.keys(row ?? {})).not.toContain('account_id')
  })
})

function splitMigrationStatements(migration: string): string[] {
  return migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
