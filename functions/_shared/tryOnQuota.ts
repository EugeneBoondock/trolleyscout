import type { TrolleyScoutEnv } from './env'

// Free shoppers get a real taste of the fitting room, Scout gets a working
// allowance, Household and above stop counting. Enforced server-side because
// each render costs money.
export const TRY_ON_MONTHLY_LIMITS: Record<string, number | null> = {
  business: null,
  developers: null,
  free: 10,
  household: null,
  organization: null,
  scout: 50,
}

export const DEFAULT_TRY_ON_LIMIT = 10

export interface TryOnQuota {
  limit: number | null
  remaining: number | null
  used: number
  /// Bought or granted fittings, spent only after the monthly allowance.
  credits: number
}

export function tryOnLimitFor(planId: string, isAdmin: boolean): number | null {
  if (isAdmin) return null
  const limit = TRY_ON_MONTHLY_LIMITS[planId.trim().toLowerCase()]
  return limit === undefined ? DEFAULT_TRY_ON_LIMIT : limit
}

/** Calendar month in UTC — the same key the usage row is stored under. */
export function monthKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export async function readTryOnQuota(
  env: TrolleyScoutEnv,
  accountId: string,
  planId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<TryOnQuota> {
  const limit = tryOnLimitFor(planId, isAdmin)
  const [used, credits] = await Promise.all([
    readUsedCount(env, accountId, now),
    readCreditBalance(env, accountId),
  ])
  return {
    credits,
    limit,
    // Credits extend the month rather than replace it: the plan's fittings
    // are spent first, then whatever was bought or granted.
    remaining: limit === null ? null : Math.max(0, limit - used) + credits,
    used,
  }
}

export async function readCreditBalance(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<number> {
  if (!env.DB) return 0
  try {
    const row = await env.DB.prepare(
      'SELECT balance FROM try_on_credits WHERE account_id = ?',
    )
      .bind(accountId)
      .first<{ balance: number }>()
    return row?.balance ?? 0
  } catch {
    return 0
  }
}

/** Adds (or removes, with a negative amount) fittings and records why. */
export async function adjustTryOnCredits(
  env: TrolleyScoutEnv,
  accountId: string,
  amount: number,
  reason: string,
  actor?: string,
  now: Date = new Date(),
): Promise<number> {
  if (!env.DB || !Number.isFinite(amount) || amount === 0) {
    return readCreditBalance(env, accountId)
  }
  const stamp = now.toISOString()
  await env.DB.prepare(
    `INSERT INTO try_on_credits (account_id, balance, updated_at)
      VALUES (?, MAX(0, ?), ?)
      ON CONFLICT (account_id)
      DO UPDATE SET balance = MAX(0, balance + ?), updated_at = excluded.updated_at`,
  )
    .bind(accountId, amount, stamp, amount)
    .run()
  await env.DB.prepare(
    `INSERT INTO try_on_credit_events (id, account_id, amount, reason, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `credit-${now.getTime()}-${Math.abs(amount)}`,
      accountId,
      amount,
      reason.slice(0, 120),
      actor ?? null,
      stamp,
    )
    .run()
  return readCreditBalance(env, accountId)
}

async function readUsedCount(
  env: TrolleyScoutEnv,
  accountId: string,
  now: Date,
): Promise<number> {
  if (!env.DB) return 0
  try {
    const row = await env.DB.prepare(
      'SELECT used_count FROM try_on_usage WHERE account_id = ? AND month_key = ?',
    )
      .bind(accountId, monthKey(now))
      .first<{ used_count: number }>()
    return row?.used_count ?? 0
  } catch {
    // A missing table must never lock a paying shopper out of the feature.
    return 0
  }
}

/** Counted only after a render succeeds: a failed try-on costs the shopper
 * nothing from their allowance. Once the month's fittings are spent, the
 * render comes out of bought credits instead. */
export async function recordTryOnUse(
  env: TrolleyScoutEnv,
  accountId: string,
  now: Date = new Date(),
  quota?: TryOnQuota,
): Promise<void> {
  if (!env.DB) return
  const monthlyExhausted = quota !== undefined &&
    quota.limit !== null &&
    quota.used >= quota.limit
  if (monthlyExhausted) {
    await adjustTryOnCredits(env, accountId, -1, 'try-on', undefined, now)
      .catch(() => 0)
    return
  }
  try {
    await env.DB.prepare(
      `INSERT INTO try_on_usage (account_id, month_key, used_count, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT (account_id, month_key)
        DO UPDATE SET used_count = used_count + 1, updated_at = excluded.updated_at`,
    )
      .bind(accountId, monthKey(now), now.toISOString())
      .run()
  } catch {
    // Usage tracking is best-effort; never fail a completed render over it.
  }
}
