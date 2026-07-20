// @vitest-environment node

import { readFile } from 'node:fs/promises'
import { URL as NodeUrl } from 'node:url'
import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyDuePlanChanges, type PlanChangeSweepDependencies } from './planChangeSweep'

const migrationUrls = [
  new NodeUrl('../../migrations/0002_membership.sql', import.meta.url),
  new NodeUrl('../../migrations/0006_payfast_billing.sql', import.meta.url),
  new NodeUrl('../../migrations/0024_support_and_billing_cleanup.sql', import.meta.url),
  new NodeUrl('../../migrations/0025_scheduled_plan_changes.sql', import.meta.url),
]

const PAST = '2026-07-01T00:00:00.000Z'
const FUTURE = '2026-09-01T00:00:00.000Z'
const NOW = new Date('2026-07-20T12:00:00.000Z')

describe('applyDuePlanChanges', () => {
  let miniflare: Miniflare
  let db: D1Database
  let adjustCalls: { amountCents: number; token: string }[]
  let cancelCalls: string[]

  function dependencies(
    overrides: Partial<PlanChangeSweepDependencies> = {},
  ): PlanChangeSweepDependencies {
    return {
      adjust: async (token, amountCents) => {
        adjustCalls.push({ amountCents, token })
        return { adjusted: true }
      },
      cancel: async (token) => {
        cancelCalls.push(token)
        return { cancelled: true }
      },
      ...overrides,
    }
  }

  async function seed(input: {
    pendingBillingCycle?: string
    pendingEffectiveAt: string
    pendingPlanId: string
    planId: string
  }) {
    await db
      .prepare(
        `INSERT INTO member_accounts (id, email, display_name, plan_id, plan_status)
          VALUES ('acc-1', 'shopper@example.co.za', 'Thandi', ?, 'active')`,
      )
      .bind(input.planId)
      .run()

    await db
      .prepare(
        `INSERT INTO billing_subscriptions (
            id, account_id, provider, plan_id, billing_cycle, status,
            provider_token, provider_payment_id, current_period_end,
            pending_plan_id, pending_billing_cycle, pending_effective_at
          ) VALUES ('sub-1', 'acc-1', 'payfast', ?, 'monthly', 'active',
            'token-1', 'pay-1', ?, ?, ?, ?)`,
      )
      .bind(
        input.planId,
        input.pendingEffectiveAt,
        input.pendingPlanId,
        input.pendingBillingCycle ?? 'monthly',
        input.pendingEffectiveAt,
      )
      .run()
  }

  async function readAccountPlan() {
    const row = await db
      .prepare('SELECT plan_id FROM member_accounts WHERE id = ?')
      .bind('acc-1')
      .first<{ plan_id: string }>()

    return row?.plan_id
  }

  async function readSubscription() {
    return db
      .prepare(
        `SELECT plan_id, status, pending_plan_id, pending_effective_at
          FROM billing_subscriptions WHERE account_id = ?`,
      )
      .bind('acc-1')
      .first<{
        pending_effective_at: string | null
        pending_plan_id: string | null
        plan_id: string
        status: string
      }>()
  }

  beforeEach(async () => {
    adjustCalls = []
    cancelCalls = []
    miniflare = new Miniflare({
      d1Databases: { DB: 'plan-change-sweep-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = (await miniflare.getD1Database('DB')) as unknown as D1Database

    for (const migrationUrl of migrationUrls) {
      const migration = (await readFile(migrationUrl, 'utf8')).replace(/^--.*$/gm, '').trim()
      for (const statement of splitMigrationStatements(migration)) {
        await db.prepare(statement).run()
      }
    }
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('moves the member onto the cheaper plan and lowers the recurring amount', async () => {
    await seed({ pendingEffectiveAt: PAST, pendingPlanId: 'scout', planId: 'household' })

    const result = await applyDuePlanChanges(db, dependencies(), NOW)

    expect(result).toMatchObject({ applied: 1, failed: 0 })
    // Scout monthly is R29, so PayFast must be told 2900 cents and not the
    // R59 the member was paying on Household.
    expect(adjustCalls).toEqual([{ amountCents: 2900, token: 'token-1' }])
    expect(await readAccountPlan()).toBe('scout')
    expect(await readSubscription()).toMatchObject({
      pending_effective_at: null,
      pending_plan_id: null,
      plan_id: 'scout',
      status: 'active',
    })
  })

  it('cancels the subscription and drops to free for a queued cancellation', async () => {
    await seed({ pendingEffectiveAt: PAST, pendingPlanId: 'free', planId: 'scout' })

    const result = await applyDuePlanChanges(db, dependencies(), NOW)

    expect(result).toMatchObject({ applied: 1, failed: 0 })
    expect(cancelCalls).toEqual(['token-1'])
    expect(adjustCalls).toEqual([])
    expect(await readAccountPlan()).toBe('free')
    expect(await readSubscription()).toMatchObject({
      pending_plan_id: null,
      status: 'cancelled',
    })
  })

  // The member has not reached the end of what they paid for, so touching their
  // plan now would take away access they are still owed.
  it('leaves a change alone until its effective date arrives', async () => {
    await seed({ pendingEffectiveAt: FUTURE, pendingPlanId: 'scout', planId: 'household' })

    const result = await applyDuePlanChanges(db, dependencies(), NOW)

    expect(result).toMatchObject({ applied: 0, failed: 0 })
    expect(adjustCalls).toEqual([])
    expect(await readAccountPlan()).toBe('household')
    expect(await readSubscription()).toMatchObject({ pending_plan_id: 'scout' })
  })

  // If PayFast is still billing the token, dropping the member to Free would
  // remove access they are being charged for.
  it('keeps the member on their plan and records the failure when a cancel fails', async () => {
    await seed({ pendingEffectiveAt: PAST, pendingPlanId: 'free', planId: 'scout' })

    const result = await applyDuePlanChanges(
      db,
      dependencies({ cancel: async () => ({ cancelled: false, issue: 'PayFast returned 500.' }) }),
      NOW,
    )

    expect(result).toMatchObject({ applied: 0, failed: 1 })
    expect(result.issues[0]).toContain('PayFast returned 500.')
    expect(await readAccountPlan()).toBe('scout')
    expect(await readSubscription()).toMatchObject({
      pending_plan_id: 'free',
      status: 'active',
    })

    const recorded = await db
      .prepare('SELECT status, issue, attempts FROM billing_cancellations WHERE provider_token = ?')
      .bind('token-1')
      .first<{ attempts: number; issue: string; status: string }>()

    expect(recorded).toMatchObject({ attempts: 1, issue: 'PayFast returned 500.', status: 'failed' })
  })

  it('retries a failed adjustment on the next sweep rather than dropping it', async () => {
    await seed({ pendingEffectiveAt: PAST, pendingPlanId: 'scout', planId: 'household' })

    const result = await applyDuePlanChanges(
      db,
      dependencies({ adjust: async () => ({ adjusted: false, issue: 'PayFast returned 503.' }) }),
      NOW,
    )

    expect(result).toMatchObject({ applied: 0, failed: 1 })
    expect(await readAccountPlan()).toBe('household')
    expect(await readSubscription()).toMatchObject({ pending_plan_id: 'scout' })

    // The queued change survives, so a later sweep can still apply it.
    const retry = await applyDuePlanChanges(db, dependencies(), NOW)

    expect(retry).toMatchObject({ applied: 1, failed: 0 })
    expect(await readAccountPlan()).toBe('scout')
  })
})

function splitMigrationStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let triggerDepth = 0

  for (const line of sql.split(/\r?\n/)) {
    const normalized = line.trim().toUpperCase()
    if (normalized.startsWith('CREATE TRIGGER')) {
      triggerDepth += 1
    }
    current += `${line}\n`
    if (triggerDepth > 0 && normalized === 'END;') {
      triggerDepth -= 1
      statements.push(current.trim())
      current = ''
    } else if (triggerDepth === 0 && normalized.endsWith(';')) {
      statements.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    statements.push(current.trim())
  }
  return statements
}
