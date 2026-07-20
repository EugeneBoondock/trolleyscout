import type { BillingCycle, MemberPlanId } from '../../src/types'
import { getMemberPlan } from '../../src/data/memberPlans'
import { computePeriodEnd } from './planChanges'

// Applies the downgrades that members queued once the period they paid for has
// actually run out. The provider calls are injected so the scheduled worker
// wires in PayFast while the tests stay off the network.

export type SubscriptionAdjuster = (
  token: string,
  amountCents: number,
) => Promise<{ adjusted: boolean; issue?: string }>

export type SubscriptionCanceller = (
  token: string,
) => Promise<{ cancelled: boolean; issue?: string }>

export interface PlanChangeSweepDependencies {
  adjust: SubscriptionAdjuster
  cancel: SubscriptionCanceller
}

export interface PlanChangeSweepResult {
  applied: number
  failed: number
  issues: string[]
}

interface DuePlanChangeRow {
  account_id: string
  pending_billing_cycle: string | null
  pending_effective_at: string
  pending_plan_id: string
  provider_token: string | null
}

export async function applyDuePlanChanges(
  db: D1Database,
  dependencies: PlanChangeSweepDependencies,
  now: Date = new Date(),
): Promise<PlanChangeSweepResult> {
  const timestamp = now.toISOString()
  const due = await db
    .prepare(
      `SELECT account_id, pending_plan_id, pending_billing_cycle, pending_effective_at, provider_token
        FROM billing_subscriptions
        WHERE provider = 'payfast'
          AND status = 'active'
          AND pending_plan_id IS NOT NULL
          AND pending_effective_at IS NOT NULL
          AND pending_effective_at <= ?`,
    )
    .bind(timestamp)
    .all<DuePlanChangeRow>()

  const result: PlanChangeSweepResult = { applied: 0, failed: 0, issues: [] }

  for (const row of due.results ?? []) {
    const outcome = await applyOne(db, dependencies, row, now)

    if (outcome.applied) {
      result.applied += 1
    } else {
      result.failed += 1
      result.issues.push(`${row.account_id}: ${outcome.issue ?? 'Plan change could not be applied.'}`)
    }
  }

  return result
}

async function applyOne(
  db: D1Database,
  dependencies: PlanChangeSweepDependencies,
  row: DuePlanChangeRow,
  now: Date,
): Promise<{ applied: boolean; issue?: string }> {
  const planId = normalizePlanId(row.pending_plan_id)
  const billingCycle: BillingCycle = row.pending_billing_cycle === 'annual' ? 'annual' : 'monthly'
  const token = row.provider_token?.trim()
  const timestamp = now.toISOString()

  if (!token) {
    return { applied: false, issue: 'Subscription token is missing.' }
  }

  if (planId === 'free') {
    const cancelled = await dependencies.cancel(token)

    // Leaving the change queued is deliberate: if PayFast is still billing this
    // token, dropping the member to Free would take away access they are being
    // charged for. It retries on the next sweep and is recorded for an admin.
    if (!cancelled.cancelled) {
      await recordCancellationFailure(db, row.account_id, token, cancelled.issue, timestamp)
      return { applied: false, issue: cancelled.issue ?? 'PayFast did not cancel the subscription.' }
    }

    await db.batch([
      db
        .prepare(
          `UPDATE billing_subscriptions
            SET status = 'cancelled', pending_plan_id = NULL, pending_billing_cycle = NULL,
                pending_effective_at = NULL, updated_at = ?
            WHERE account_id = ? AND provider = 'payfast'`,
        )
        .bind(timestamp, row.account_id),
      db
        .prepare(
          `UPDATE member_accounts SET plan_id = 'free', plan_status = 'active', updated_at = ?
            WHERE id = ?`,
        )
        .bind(timestamp, row.account_id),
    ])

    return { applied: true }
  }

  const amountCents = getMemberPlan(planId).prices[billingCycle]
  const adjusted = await dependencies.adjust(token, amountCents)

  if (!adjusted.adjusted) {
    return { applied: false, issue: adjusted.issue ?? 'PayFast did not adjust the subscription.' }
  }

  // The member has now started a fresh period on the cheaper plan, so the
  // period end rolls forward from today rather than from the old plan's date.
  await db.batch([
    db
      .prepare(
        `UPDATE billing_subscriptions
          SET plan_id = ?, billing_cycle = ?, current_period_end = ?,
              pending_plan_id = NULL, pending_billing_cycle = NULL,
              pending_effective_at = NULL, updated_at = ?
          WHERE account_id = ? AND provider = 'payfast'`,
      )
      .bind(planId, billingCycle, computePeriodEnd(now, billingCycle), timestamp, row.account_id),
    db
      .prepare(
        `UPDATE member_accounts SET plan_id = ?, plan_status = 'active', updated_at = ?
          WHERE id = ?`,
      )
      .bind(planId, timestamp, row.account_id),
  ])

  return { applied: true }
}

// Reuses the ledger the ITN path already writes to, so every subscription that
// is still costing a member money sits in one place in the admin console.
async function recordCancellationFailure(
  db: D1Database,
  accountId: string,
  token: string,
  issue: string | undefined,
  timestamp: string,
) {
  await db
    .prepare(
      `INSERT INTO billing_cancellations (
          id, account_id, provider, provider_token, status, issue, attempts, created_at, updated_at
        ) VALUES (?, ?, 'payfast', ?, 'failed', ?, 1, ?, ?)
        ON CONFLICT(provider, provider_token) DO UPDATE SET
          status = 'failed',
          issue = excluded.issue,
          attempts = billing_cancellations.attempts + 1,
          updated_at = excluded.updated_at`,
    )
    .bind(`cancel-${crypto.randomUUID()}`, accountId, token, issue ?? null, timestamp, timestamp)
    .run()
}

function normalizePlanId(value: string): MemberPlanId {
  return value === 'scout' || value === 'household' || value === 'organization' ? value : 'free'
}
