// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberAccount } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import { startSubscriptionCheckout } from './memberStore'

const PAID_UNTIL = '2099-09-04T15:45:00.000Z'

describe('subscription cancellation and resubscription', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'member-subscription-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = (await miniflare.getD1Database('DB')) as unknown as D1Database
    env = { DB: db }

    await db.prepare(
      `CREATE TABLE billing_subscriptions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_token TEXT NOT NULL,
        provider_payment_id TEXT NOT NULL,
        current_period_end TEXT,
        pending_plan_id TEXT,
        pending_billing_cycle TEXT,
        pending_effective_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ).run()
    await db.prepare(
      `CREATE TABLE billing_attempts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        billing_cycle TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        initial_amount_cents INTEGER,
        billing_starts_at TEXT,
        initial_payment_id TEXT,
        status TEXT NOT NULL,
        onsite_uuid TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
    ).run()
  })

  afterEach(async () => {
    await miniflare.dispose()
  })

  it('cancels future billing immediately but keeps access through the paid period', async () => {
    await seedSubscription('active')
    const cancelSubscription = vi.fn().mockResolvedValue({ cancelled: true })

    const checkout = await startSubscriptionCheckout(
      env,
      request(),
      account(),
      'free',
      'monthly',
      true,
      { cancelSubscription },
    )

    expect(cancelSubscription).toHaveBeenCalledWith(
      'token-old',
      expect.objectContaining({ merchantId: '10000100', mode: 'sandbox' }),
    )
    expect(checkout).toMatchObject({
      effectiveAt: PAID_UNTIL,
      planId: 'free',
      status: 'scheduled',
    })
    expect(await readSubscription()).toMatchObject({
      pending_effective_at: PAID_UNTIL,
      pending_plan_id: 'free',
      status: 'cancelled',
    })
  })

  it('reauthorises at R0 and schedules the first charge for the existing period end', async () => {
    await seedSubscription('cancelled', 'free')

    const checkout = await startSubscriptionCheckout(
      env,
      request(),
      account({ pendingEffectiveAt: PAID_UNTIL, pendingPlanId: 'free' }),
      'scout',
      'monthly',
      true,
    )

    expect(checkout).toMatchObject({
      redirectFields: {
        amount: '0.00',
        billing_date: '2099-09-04',
        recurring_amount: '29.00',
      },
      status: 'checkout_required',
    })

    const attempt = await db.prepare(
      `SELECT amount_cents, initial_amount_cents, billing_starts_at
        FROM billing_attempts LIMIT 1`,
    ).first<{
      amount_cents: number
      billing_starts_at: string
      initial_amount_cents: number
    }>()

    expect(attempt).toEqual({
      amount_cents: 2900,
      billing_starts_at: PAID_UNTIL,
      initial_amount_cents: 0,
    })
  })

  it('removes a legacy queued cancellation without opening another checkout', async () => {
    await seedSubscription('active', 'free')

    const checkout = await startSubscriptionCheckout(
      env,
      request(),
      account({ pendingEffectiveAt: PAID_UNTIL, pendingPlanId: 'free' }),
      'scout',
      'monthly',
      true,
    )

    expect(checkout).toMatchObject({ planId: 'scout', status: 'active' })
    expect(checkout.redirectUrl).toBeUndefined()
    expect((await readSubscription())?.pending_plan_id).toBeNull()
    expect(
      await db.prepare('SELECT COUNT(*) AS count FROM billing_attempts').first<{ count: number }>(),
    ).toEqual({ count: 0 })
  })

  async function seedSubscription(status: string, pendingPlanId: string | null = null) {
    await db.prepare(
      `INSERT INTO billing_subscriptions (
        id, account_id, provider, plan_id, billing_cycle, status,
        provider_token, provider_payment_id, current_period_end,
        pending_plan_id, pending_billing_cycle, pending_effective_at
      ) VALUES ('sub-1', 'member-1', 'payfast', 'scout', 'monthly', ?,
        'token-old', 'pay-old', ?, ?, 'monthly', ?)`,
    )
      .bind(status, PAID_UNTIL, pendingPlanId, pendingPlanId ? PAID_UNTIL : null)
      .run()
  }

  async function readSubscription() {
    return db.prepare(
      `SELECT status, pending_plan_id, pending_effective_at
        FROM billing_subscriptions WHERE account_id = 'member-1'`,
    ).first<{
      pending_effective_at: string | null
      pending_plan_id: string | null
      status: string
    }>()
  }
})

function request() {
  return new Request('https://trolleyscout.co.za/api/subscription')
}

function account(overrides: Partial<MemberAccount> = {}): MemberAccount {
  return {
    billingCycle: 'monthly',
    countryCode: 'ZA',
    countryName: 'South Africa',
    createdAt: '2026-08-04T00:00:00.000Z',
    currencyCode: 'ZAR',
    displayName: 'Sam Shopper',
    email: 'sam@example.test',
    id: 'member-1',
    initials: 'SS',
    planId: 'scout',
    planName: 'Scout',
    planStatus: 'active',
    propertiesAccess: false,
    role: 'member',
    status: 'active',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...overrides,
  }
}
