import type { BillingCycle } from '../../src/types'
import type {
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

export function createPayFastBillingRepository(db: D1Database): PayFastBillingRepository {
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

      await db.batch([
        db.prepare(
          `UPDATE billing_attempts
            SET status = 'complete', updated_at = ?
            WHERE id = ? AND account_id = ?`,
        ).bind(timestamp, input.attemptId, input.accountId),
        db.prepare(
          `INSERT INTO billing_subscriptions (
            id, account_id, provider, plan_id, billing_cycle, status,
            provider_token, provider_payment_id, created_at, updated_at
          ) VALUES (?, ?, 'payfast', ?, ?, 'active', ?, ?, ?, ?)
          ON CONFLICT(account_id) DO UPDATE SET
            provider = 'payfast',
            plan_id = excluded.plan_id,
            billing_cycle = excluded.billing_cycle,
            status = 'active',
            provider_token = excluded.provider_token,
            provider_payment_id = excluded.provider_payment_id,
            updated_at = excluded.updated_at`,
        ).bind(
          subscriptionId,
          input.accountId,
          input.planId,
          input.billingCycle,
          input.token,
          input.paymentId,
          timestamp,
          timestamp,
        ),
        db.prepare(
          `UPDATE member_accounts
            SET plan_id = ?, plan_status = 'active', updated_at = ?
            WHERE id = ?`,
        ).bind(input.planId, timestamp, input.accountId),
      ])
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

function billingAttemptFromRow(row: BillingAttemptRow): PayFastBillingAttempt | undefined {
  if (
    (row.plan_id !== 'scout' && row.plan_id !== 'household') ||
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
