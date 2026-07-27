// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  loadBusinessAdminOverview,
  setBusinessAdminStatus,
} from './businessAdminStore'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0006_payfast_billing.sql', import.meta.url),
  new NodeUrl('../../migrations/0008_auth_roles.sql', import.meta.url),
  new NodeUrl('../../migrations/0030_organization_onboarding.sql', import.meta.url),
  new NodeUrl('../../migrations/0035_organization_publications.sql', import.meta.url),
]

describe('business admin reporting store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'business-admin-store-test' },
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

    await db.prepare(
      `INSERT INTO member_accounts (
        id, email, display_name, plan_id, plan_status, role
      ) VALUES ('owner-1', 'owner@example.co.za', 'Thandi Nkosi', 'organization', 'active', 'member')`,
    ).run()
    await db.prepare(
      `INSERT INTO member_accounts (
        id, email, display_name, plan_id, plan_status, role
      ) VALUES ('admin-1', 'admin@example.co.za', 'Platform Admin', 'free', 'active', 'admin')`,
    ).run()
    await db.prepare(
      `INSERT INTO member_accounts (
        id, email, display_name, plan_id, plan_status, role
      ) VALUES ('shopper-1', 'shopper@example.co.za', 'Everyday Shopper', 'monthly', 'active', 'member')`,
    ).run()
    await db.prepare(
      `INSERT INTO organization_applications (
        id, account_id, organisation_name, contact_name, contact_email,
        category, description, status, created_at, updated_at
      ) VALUES (
        'application-1', 'owner-1', 'Fresh Market', 'Thandi Nkosi',
        'owner@example.co.za', 'Groceries',
        'Fresh food and household goods for local shoppers.', 'approved', ?, ?
      )`,
    ).bind('2026-07-01T08:00:00.000Z', '2026-07-01T08:00:00.000Z').run()
    await db.prepare(
      `INSERT INTO organizations (
        id, account_id, application_id, name, slug, status, created_at, updated_at
      ) VALUES (
        'org-1', 'owner-1', 'application-1', 'Fresh Market',
        'fresh-market', 'active', ?, ?
      )`,
    ).bind('2026-07-02T08:00:00.000Z', '2026-07-02T08:00:00.000Z').run()
    await db.prepare(
      `INSERT INTO organization_locations (
        id, organization_id, name, address_line, city, country_code,
        status, created_at, updated_at
      ) VALUES (
        'location-1', 'org-1', 'Orlando West', '12 Vilakazi Street',
        'Soweto', 'ZA', 'active', ?, ?
      )`,
    ).bind('2026-07-03T08:00:00.000Z', '2026-07-03T08:00:00.000Z').run()
    await db.prepare(
      `INSERT INTO organization_publications (
        id, organization_id, created_by, kind, status, placement, title,
        body_text, currency_code, sold_out, created_at, updated_at
      ) VALUES (
        'org-pub-1', 'org-1', 'owner-1', 'deal', 'live', 'both',
        'Weekend potatoes', 'Two kilograms at a lower price.', 'ZAR', 0, ?, ?
      )`,
    ).bind('2026-07-20T08:00:00.000Z', '2026-07-25T08:00:00.000Z').run()
    await db.prepare(
      `INSERT INTO organization_publication_events_daily (
        publication_id, event_date, impressions, opens, saves, outbound_visits
      ) VALUES ('org-pub-1', '2026-07-25', 800, 90, 61, 25)`,
    ).run()
    await db.prepare(
      `INSERT INTO billing_attempts (
        id, account_id, plan_id, billing_cycle, amount_cents,
        status, created_at, updated_at, expires_at
      ) VALUES (
        'attempt-1', 'owner-1', 'organization', 'annual', 149900,
        'complete', ?, ?, ?
      )`,
    ).bind(
      '2026-07-01T07:00:00.000Z',
      '2026-07-01T07:01:00.000Z',
      '2026-07-01T08:00:00.000Z',
    ).run()
    await db.prepare(
      `INSERT INTO billing_events (
        id, provider_event_id, payment_id, attempt_id, payment_status,
        amount_cents, payload_hash, created_at
      ) VALUES (
        'event-1', 'provider-event-1', 'payment-1', 'attempt-1',
        'COMPLETE', 149900, 'hash-1', ?
      )`,
    ).bind('2026-07-01T07:01:00.000Z').run()
    await db.prepare(
      `INSERT INTO billing_attempts (
        id, account_id, plan_id, billing_cycle, amount_cents,
        status, created_at, updated_at, expires_at
      ) VALUES (
        'consumer-attempt-1', 'shopper-1', 'monthly', 'monthly', 9900,
        'complete', ?, ?, ?
      )`,
    ).bind(
      '2026-07-02T07:00:00.000Z',
      '2026-07-02T07:01:00.000Z',
      '2026-07-02T08:00:00.000Z',
    ).run()
    await db.prepare(
      `INSERT INTO billing_events (
        id, provider_event_id, payment_id, attempt_id, payment_status,
        amount_cents, payload_hash, created_at
      ) VALUES (
        'consumer-event-1', 'consumer-provider-event-1', 'consumer-payment-1',
        'consumer-attempt-1', 'COMPLETE', 9900, 'consumer-hash-1', ?
      )`,
    ).bind('2026-07-02T07:01:00.000Z').run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('reports businesses, publishing results, and completed payments', async () => {
    const overview = await loadBusinessAdminOverview(env)

    expect(overview.totals).toMatchObject({
      activeBusinesses: 1,
      businesses: 1,
      campaigns: 1,
      liveCampaigns: 1,
      paidCents: 149900,
      paidTransactions: 1,
    })
    expect(overview.businesses[0]).toMatchObject({
      campaigns: 1,
      category: 'Groceries',
      impressions: 800,
      locations: 1,
      name: 'Fresh Market',
      opens: 90,
      paidCents: 149900,
      saves: 61,
      status: 'active',
      visits: 25,
    })
    expect(overview.campaigns[0]).toMatchObject({
      organizationName: 'Fresh Market',
      status: 'live',
      title: 'Weekend potatoes',
    })
    expect(overview.payments[0]).toMatchObject({
      amountCents: 149900,
      businessName: 'Fresh Market',
      paymentId: 'payment-1',
    })
  })

  it('suspends and reopens a business workspace without deleting history', async () => {
    const suspended = await setBusinessAdminStatus(env, 'org-1', 'suspended')
    const afterSuspension = await loadBusinessAdminOverview(env)
    const reopened = await setBusinessAdminStatus(env, 'org-1', 'active')
    const afterReopen = await loadBusinessAdminOverview(env)

    expect(suspended).toEqual({ changed: true })
    expect(afterSuspension.businesses[0]?.status).toBe('suspended')
    expect(afterSuspension.campaigns).toHaveLength(1)
    expect(afterSuspension.payments).toHaveLength(1)
    expect(reopened).toEqual({ changed: true })
    expect(afterReopen.businesses[0]?.status).toBe('active')
  })
})

function splitMigrationStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
