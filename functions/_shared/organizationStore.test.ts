// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TrolleyScoutEnv } from './env'
import {
  getOrganizationForAccount,
  listMemberOrganizationApplications,
  listOrganizationApplicationsForReview,
  reviewOrganizationApplication,
  submitOrganizationApplication,
  type OrganizationApplicationInput,
} from './organizationStore'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0030_organization_onboarding.sql', import.meta.url),
]

const validInput: OrganizationApplicationInput = {
  category: 'Grocery',
  city: 'Soweto',
  contactEmail: 'owner@freshmarket.co.za',
  contactName: 'Thandi Nkosi',
  contactPhone: '+27 82 555 0134',
  description: 'A family grocer selling fresh produce, bread and household basics.',
  organisationName: 'Fresh Market',
  province: 'Gauteng',
  registrationNumber: '2019/123456/07',
  tradingName: 'Fresh Market Soweto',
  websiteUrl: 'https://freshmarket.co.za',
}

describe('organisation onboarding store', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'organization-store-test' },
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

    for (const [id, email] of [
      ['member-1', 'one@example.co.za'],
      ['member-2', 'two@example.co.za'],
      ['admin-1', 'admin@example.co.za'],
    ]) {
      await db.prepare(
        `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status)
          VALUES (?, ?, 'Member', 'free', 'active')`,
      ).bind(id, email).run()
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('stores a valid application as pending', async () => {
    const result = await submitOrganizationApplication(env, 'member-1', validInput)

    expect(result.issues).toBeUndefined()
    expect(result.application).toMatchObject({
      accountId: 'member-1',
      contactEmail: 'owner@freshmarket.co.za',
      organisationName: 'Fresh Market',
      status: 'pending',
    })

    const row = await db.prepare(
      'SELECT account_id, status, review_note, reviewed_by FROM organization_applications',
    ).first<{ account_id: string; status: string; review_note: string | null; reviewed_by: string | null }>()
    expect(row).toEqual({
      account_id: 'member-1',
      review_note: null,
      reviewed_by: null,
      status: 'pending',
    })
  })

  it('rejects an application that is missing the details a reviewer needs', async () => {
    const result = await submitOrganizationApplication(env, 'member-1', {
      contactEmail: '',
      contactName: '',
      description: '',
      organisationName: '',
    })

    expect(result.application).toBeUndefined()
    expect(result.issues?.length).toBeGreaterThanOrEqual(4)
    await expectApplicationCount(db, 0)
  })

  it('rejects an unusable website link rather than storing it', async () => {
    const result = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      websiteUrl: 'javascript:alert(1)',
    })

    expect(result.issues).toContain('The website must be a valid https:// link, or leave it blank.')
    await expectApplicationCount(db, 0)
  })

  it('rejects a contact email we could never reply to', async () => {
    const result = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      contactEmail: 'owner@freshmarket',
    })

    expect(result.issues).toContain('Enter a valid contact email address so we can reply.')
    await expectApplicationCount(db, 0)
  })

  it('rejects markup in the details so nothing stored can be rendered as HTML', async () => {
    const result = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      organisationName: 'Fresh <script>alert(1)</script> Market',
    })

    expect(result.issues).toContain(
      'Remove < and > from the details — these fields take plain text only.',
    )
    await expectApplicationCount(db, 0)
  })

  it('refuses a second application while the first is still pending', async () => {
    await submitOrganizationApplication(env, 'member-1', validInput)
    const second = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      organisationName: 'Fresh Market Two',
    })

    expect(second.application).toBeUndefined()
    expect(second.issues?.[0]).toContain('already with our team')
    await expectApplicationCount(db, 1)
  })

  it('refuses a new application once the account already runs an organisation', async () => {
    const first = await submitOrganizationApplication(env, 'member-1', validInput)
    await activateOrganizationPlan(db, 'member-1')
    await reviewOrganizationApplication(env, 'admin-1', first.application!.id, 'approved')

    const second = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      organisationName: 'Second Storefront',
    })

    expect(second.issues?.[0]).toContain('already set up on your account')
    await expectApplicationCount(db, 1)
  })

  it('creates exactly one organisation on approval, and approving twice adds none', async () => {
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)
    const applicationId = submitted.application!.id
    await activateOrganizationPlan(db, 'member-1')

    const first = await reviewOrganizationApplication(env, 'admin-1', applicationId, 'approved')
    const second = await reviewOrganizationApplication(env, 'admin-1', applicationId, 'approved')

    expect(first.changed).toBe(true)
    expect(first.application?.status).toBe('approved')
    expect(first.organization).toMatchObject({
      accountId: 'member-1',
      applicationId,
      name: 'Fresh Market',
      slug: 'fresh-market',
      status: 'active',
    })
    expect(second.changed).toBe(false)
    expect(second.organization?.id).toBe(first.organization?.id)
    await expectOrganizationCount(db, 1)
  })

  it('keeps approval closed until the Organisation subscription is active', async () => {
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)

    const result = await reviewOrganizationApplication(
      env,
      'admin-1',
      submitted.application!.id,
      'approved',
    )

    expect(result.changed).toBe(false)
    expect(result.issues).toContain(
      'The Organisation subscription must be active before this application can be approved.',
    )
    expect((await listMemberOrganizationApplications(env, 'member-1'))[0]?.status).toBe('pending')
    await expectOrganizationCount(db, 0)
  })

  it('shows the subscription state in the admin review queue', async () => {
    await submitOrganizationApplication(env, 'member-1', validInput)
    await activateOrganizationPlan(db, 'member-1')

    const queued = await listOrganizationApplicationsForReview(env, 'pending')

    expect(queued[0]).toMatchObject({
      businessSubscriptionActive: true,
      planId: 'organization',
      planStatus: 'active',
    })
  })

  it('closes an approved workspace when its Organisation subscription stops', async () => {
    await activateOrganizationPlan(db, 'member-1')
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)
    await reviewOrganizationApplication(env, 'admin-1', submitted.application!.id, 'approved')

    expect(await getOrganizationForAccount(env, 'member-1')).toBeDefined()

    await db.prepare(
      "UPDATE member_accounts SET plan_id = 'free', plan_status = 'active' WHERE id = ?",
    ).bind('member-1').run()

    expect(await getOrganizationForAccount(env, 'member-1')).toBeUndefined()
  })

  it('records who approved an application and when', async () => {
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)
    await activateOrganizationPlan(db, 'member-1')
    await reviewOrganizationApplication(env, 'admin-1', submitted.application!.id, 'approved')

    const row = await db.prepare(
      'SELECT reviewed_by, reviewed_at FROM organization_applications WHERE id = ?',
    ).bind(submitted.application!.id).first<{ reviewed_by: string; reviewed_at: string }>()

    expect(row?.reviewed_by).toBe('admin-1')
    expect(row?.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('records the reviewer note on a rejection and creates no organisation', async () => {
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)

    const result = await reviewOrganizationApplication(
      env,
      'admin-1',
      submitted.application!.id,
      'rejected',
      'The registration number does not match CIPC.',
    )

    expect(result.changed).toBe(true)
    expect(result.application).toMatchObject({
      reviewNote: 'The registration number does not match CIPC.',
      status: 'rejected',
    })
    expect(result.organization).toBeUndefined()
    await expectOrganizationCount(db, 0)
  })

  it('gives two organisations with the same name distinct slugs', async () => {
    const first = await submitOrganizationApplication(env, 'member-1', validInput)
    const second = await submitOrganizationApplication(env, 'member-2', validInput)
    await activateOrganizationPlan(db, 'member-1')
    await activateOrganizationPlan(db, 'member-2')

    const approvedFirst = await reviewOrganizationApplication(
      env, 'admin-1', first.application!.id, 'approved',
    )
    const approvedSecond = await reviewOrganizationApplication(
      env, 'admin-1', second.application!.id, 'approved',
    )

    expect(approvedFirst.organization?.slug).toBe('fresh-market')
    expect(approvedSecond.organization?.slug).toBe('fresh-market-2')
    await expectOrganizationCount(db, 2)
  })

  it('leaves the application pending when the approval write fails, never half-approved', async () => {
    const submitted = await submitOrganizationApplication(env, 'member-1', validInput)
    await activateOrganizationPlan(db, 'member-1')
    const brokenDb = new Proxy(db, {
      get(target, property) {
        if (property === 'batch') {
          return () => Promise.reject(new Error('batch unavailable'))
        }
        const value = target[property as keyof D1Database]
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const result = await reviewOrganizationApplication(
      { DB: brokenDb }, 'admin-1', submitted.application!.id, 'approved',
    )

    expect(result.changed).toBe(false)
    expect(result.issues?.[0]).toContain('could not be saved')
    expect((await listMemberOrganizationApplications(env, 'member-1'))[0]?.status).toBe('pending')
    await expectOrganizationCount(db, 0)
  })

  it('reports nothing for a member whose application has not been approved', async () => {
    await submitOrganizationApplication(env, 'member-1', validInput)

    expect(await getOrganizationForAccount(env, 'member-1')).toBeUndefined()
    expect(await getOrganizationForAccount(env, 'member-2')).toBeUndefined()
  })

  it('hides a suspended organisation from the portal gate', async () => {
    await suspendOrganizationOf('member-1')

    expect(await getOrganizationForAccount(env, 'member-1')).toBeUndefined()
  })

  async function suspendOrganizationOf(accountId: string) {
    const submitted = await submitOrganizationApplication(env, accountId, validInput)
    await activateOrganizationPlan(db, accountId)
    await reviewOrganizationApplication(env, 'admin-1', submitted.application!.id, 'approved')
    await db.prepare('UPDATE organizations SET status = ? WHERE account_id = ?')
      .bind('suspended', accountId)
      .run()
  }

  it('will not take a new application from the owner of a suspended organisation', async () => {
    await suspendOrganizationOf('member-1')

    const second = await submitOrganizationApplication(env, 'member-1', {
      ...validInput,
      organisationName: 'Fresh Market Two',
    })

    expect(second.issues?.[0]).toContain('suspended')
    await expectApplicationCount(db, 1)
  })

  it('will not approve around a suspension, leaving an approval with no organisation', async () => {
    await suspendOrganizationOf('member-1')
    // Written straight to the table: the submit guard already refuses this, so
    // the review path is being checked on its own.
    await db.prepare(
      `INSERT INTO organization_applications (
        id, account_id, organisation_name, contact_name, contact_email, description,
        status, created_at, updated_at
      ) VALUES ('org-app-second', 'member-1', 'Fresh Market', 'Thandi Nkosi',
        'owner@freshmarket.co.za', 'A family grocer selling fresh produce and bread.',
        'pending', '2026-07-25T09:00:00.000Z', '2026-07-25T09:00:00.000Z')`,
    ).run()

    const result = await reviewOrganizationApplication(env, 'admin-1', 'org-app-second', 'approved')

    expect(result.changed).toBe(false)
    expect(result.issues?.[0]).toContain('suspended')
    await expectOrganizationCount(db, 1)
    const row = await db.prepare(
      "SELECT status FROM organization_applications WHERE id = 'org-app-second'",
    ).first<{ status: string }>()
    expect(row?.status).toBe('pending')
  })

  it('answers with an issue when the reviewed application does not exist', async () => {
    const result = await reviewOrganizationApplication(env, 'admin-1', 'org-app-missing', 'approved')

    expect(result).toMatchObject({ changed: false, issues: ['That application was not found.'] })
  })

  it('lists only the caller’s own applications', async () => {
    await submitOrganizationApplication(env, 'member-1', validInput)
    await submitOrganizationApplication(env, 'member-2', {
      ...validInput,
      organisationName: 'Corner Spaza',
    })

    const mine = await listMemberOrganizationApplications(env, 'member-1')

    expect(mine).toHaveLength(1)
    expect(mine[0]?.organisationName).toBe('Fresh Market')
  })

  it('filters the review queue by status for the admin console', async () => {
    const first = await submitOrganizationApplication(env, 'member-1', validInput)
    await submitOrganizationApplication(env, 'member-2', {
      ...validInput,
      organisationName: 'Corner Spaza',
    })
    await reviewOrganizationApplication(env, 'admin-1', first.application!.id, 'rejected', 'No.')

    const pending = await listOrganizationApplicationsForReview(env, 'pending')
    const everything = await listOrganizationApplicationsForReview(env)

    expect(pending.map((application) => application.organisationName)).toEqual(['Corner Spaza'])
    expect(everything).toHaveLength(2)
  })

  it('ignores an unknown status filter instead of dropping it into the SQL', async () => {
    await submitOrganizationApplication(env, 'member-1', validInput)
    await submitOrganizationApplication(env, 'member-2', {
      ...validInput,
      organisationName: 'Corner Spaza',
    })

    const queue = await listOrganizationApplicationsForReview(env, "pending' OR '1'='1")

    expect(queue).toHaveLength(2)
  })
})

async function expectApplicationCount(db: D1Database, expected: number) {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM organization_applications')
    .first<{ total: number }>()
  expect(row?.total).toBe(expected)
}

async function expectOrganizationCount(db: D1Database, expected: number) {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM organizations')
    .first<{ total: number }>()
  expect(row?.total).toBe(expected)
}

async function activateOrganizationPlan(db: D1Database, accountId: string) {
  await db.prepare(
    "UPDATE member_accounts SET plan_id = 'organization', plan_status = 'active' WHERE id = ?",
  ).bind(accountId).run()
}

function splitMigrationStatements(migration: string): string[] {
  return migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
