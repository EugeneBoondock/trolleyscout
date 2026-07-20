import type { BillingCycle } from '../../src/types'
import { memberPlans } from '../../src/data/memberPlans'
import { computePeriodEnd } from './planChanges'
import type {
  PaidPlanId,
  PayFastBillingAttempt,
  PayFastBillingRepository,
} from './payfastNotification'

interface BillingAttemptRow {
  account_id: string
  amount_cents: number
  billing_cycle: string
  id: string
  plan_id: string
}

// Cancelling the subscription a new one replaces is a PayFast API call, which
// the caller injects so this module stays a pure data layer and the ITN tests
// never reach the network.
export type SupersededSubscriptionCanceller = (
  token: string,
) => Promise<{ cancelled: boolean; issue?: string }>

export function createPayFastBillingRepository(
  db: D1Database,
  cancelSuperseded?: SupersededSubscriptionCanceller,
): PayFastBillingRepository {
  return {
    async claimEvent(input) {
      const result = await db.prepare(
        `INSERT OR IGNORE INTO billing_events (
          id, provider, provider_event_id, payment_id, attempt_id,
          payment_status, amount_cents, payload_hash, created_at
        ) VALUES (?, 'payfast', ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          input.eventId,
          input.eventId,
          input.paymentId,
          input.attemptId,
          input.status,
          input.amountCents,
          input.payloadHash,
          new Date().toISOString(),
        )
        .run()

      return result.meta.changes > 0
    },

    async completeSubscription(input) {
      const timestamp = new Date().toISOString()
      const subscriptionId = `payfast-${input.accountId}`
      // What the member has now paid up to. This is the date a later downgrade
      // is scheduled to land on, so it has to be recorded on every payment.
      const currentPeriodEnd = computePeriodEnd(timestamp, input.billingCycle)
      // Read the outgoing token before the upsert overwrites it. A member
      // switching cycle or plan keeps paying on the old subscription until it
      // is cancelled, so this is the only chance to learn what to cancel.
      const superseded = await db.prepare(
        `SELECT provider_token FROM billing_subscriptions
          WHERE account_id = ? AND provider = 'payfast'`,
      )
        .bind(input.accountId)
        .first<{ provider_token: string }>()

      await db.batch([
        db.prepare(
          `UPDATE billing_attempts
            SET status = 'complete', updated_at = ?
            WHERE id = ? AND account_id = ?`,
        ).bind(timestamp, input.attemptId, input.accountId),
        db.prepare(
          // A fresh payment supersedes anything queued: a member who upgrades
          // while a downgrade is pending has just told us what they want, so
          // the queued change is cleared rather than left to fire later.
          `INSERT INTO billing_subscriptions (
            id, account_id, provider, plan_id, billing_cycle, status,
            provider_token, provider_payment_id, current_period_end, created_at, updated_at
          ) VALUES (?, ?, 'payfast', ?, ?, 'active', ?, ?, ?, ?, ?)
          ON CONFLICT(account_id) DO UPDATE SET
            provider = 'payfast',
            plan_id = excluded.plan_id,
            billing_cycle = excluded.billing_cycle,
            status = 'active',
            provider_token = excluded.provider_token,
            provider_payment_id = excluded.provider_payment_id,
            current_period_end = excluded.current_period_end,
            pending_plan_id = NULL,
            pending_billing_cycle = NULL,
            pending_effective_at = NULL,
            updated_at = excluded.updated_at`,
        ).bind(
          subscriptionId,
          input.accountId,
          input.planId,
          input.billingCycle,
          input.token,
          input.paymentId,
          currentPeriodEnd,
          timestamp,
          timestamp,
        ),
        db.prepare(
          `UPDATE member_accounts
            SET plan_id = ?, plan_status = 'active', updated_at = ?
            WHERE id = ?`,
        ).bind(input.planId, timestamp, input.accountId),
      ])

      // The member is now on the plan they paid for, so a failure to cancel the
      // old subscription must not undo any of that — it is recorded instead and
      // surfaced in the admin console for follow-up.
      const previousToken = superseded?.provider_token?.trim()

      if (cancelSuperseded && previousToken && previousToken !== input.token) {
        const result = await cancelSuperseded(previousToken)

        await recordCancellation(db, {
          accountId: input.accountId,
          issue: result.issue,
          status: result.cancelled ? 'cancelled' : 'failed',
          token: previousToken,
        })
      }
    },

    async findAttempt(attemptId) {
      const row = await db.prepare(
        `SELECT id, account_id, plan_id, billing_cycle, amount_cents
          FROM billing_attempts
          WHERE id = ? AND provider = 'payfast'
          LIMIT 1`,
      )
        .bind(attemptId)
        .first<BillingAttemptRow>()

      return row ? billingAttemptFromRow(row) : undefined
    },

    async markAttempt(attemptId, status) {
      await db.prepare(
        `UPDATE billing_attempts
          SET status = ?, updated_at = ?
          WHERE id = ?`,
      )
        .bind(status, new Date().toISOString(), attemptId)
        .run()
    },
  }
}

async function recordCancellation(
  db: D1Database,
  input: { accountId: string; issue?: string; status: string; token: string },
) {
  const timestamp = new Date().toISOString()

  // Retrying the same token bumps the attempt count rather than adding a row,
  // so the admin view shows one line per stuck subscription.
  await db.prepare(
    `INSERT INTO billing_cancellations (
        id, account_id, provider, provider_token, status, issue, attempts, created_at, updated_at
      ) VALUES (?, ?, 'payfast', ?, ?, ?, 1, ?, ?)
      ON CONFLICT(provider, provider_token) DO UPDATE SET
        status = excluded.status,
        issue = excluded.issue,
        attempts = billing_cancellations.attempts + 1,
        updated_at = excluded.updated_at`,
  )
    .bind(
      `cancel-${crypto.randomUUID()}`,
      input.accountId,
      input.token,
      input.status,
      input.issue ?? null,
      timestamp,
      timestamp,
    )
    .run()
}

function billingAttemptFromRow(row: BillingAttemptRow): PayFastBillingAttempt | undefined {
  if (
    !isPaidPlanId(row.plan_id) ||
    (row.billing_cycle !== 'monthly' && row.billing_cycle !== 'annual') ||
    !Number.isInteger(row.amount_cents) ||
    row.amount_cents <= 0
  ) {
    return undefined
  }

  return {
    accountId: row.account_id,
    amountCents: row.amount_cents,
    billingCycle: row.billing_cycle as BillingCycle,
    id: row.id,
    planId: row.plan_id,
  }
}

// Read from the plan table rather than hard-coded, so a new paid tier is
// billable the moment it is defined instead of silently failing this guard.
function isPaidPlanId(value: string): value is PaidPlanId {
  return memberPlans.some((plan) => plan.isPaid && plan.id === value)
}
