import type { TrolleyScoutEnv } from './env'
import { adjustTryOnCredits } from './tryOnQuota'

/**
 * Watching an ad, by choice, in exchange for something.
 *
 * Trolley Scout carries no ad banners. This is the one place a Google ad can
 * appear, and only because the shopper walked to it and pressed play: someone
 * who cannot spare R50 a month can still spend their own time instead. Nothing
 * is shown anywhere else in the app, and nothing is shown to anyone who has
 * not opted in.
 *
 * The exchange rate is worked out from what the reward actually costs us, not
 * from what we could get away with:
 *
 *   A fitting costs R0.10-R0.20 in render time. A completed rewarded ad in
 *   South Africa returns roughly R0.02-R0.05. Five ads therefore pay for one
 *   fitting, and the shopper is never quietly working at a loss.
 *
 * The daily cap is what keeps this honest in the other direction. Scout is R50
 * for 50 fittings a month plus the whole toolkit; four ads a day is at most 24
 * fittings a month, so watching ads can never be the better deal for a heavy
 * user. It is a bridge, not a plan.
 */

export type AdRewardKind = 'fitting' | 'source'

export interface AdRewardRate {
  /// Ads needed for one unit of this reward.
  adsPerReward: number
  kind: AdRewardKind
  label: string
  /// Total units this account may ever earn this way, or null for no ceiling.
  lifetimeCap: number | null
  description: string
}

export const AD_REWARD_RATES: Record<AdRewardKind, AdRewardRate> = {
  fitting: {
    adsPerReward: 5,
    description: 'Five ads pay for one fitting-room render.',
    kind: 'fitting',
    label: 'Fitting-room credit',
    lifetimeCap: null,
  },
  source: {
    adsPerReward: 3,
    description:
      'Three ads add one more store to the shops your Marketplace watches.',
    kind: 'source',
    label: 'Extra Marketplace store',
    // Bounded on purpose: five extra shops is a genuine lift on the free
    // plan's ten, and still nowhere near Scout's hundred.
    lifetimeCap: 5,
  },
}

/// The most ads one account may be paid for in a day.
export const MAX_ADS_PER_DAY = 4

export interface AdRewardProgress {
  adsToday: number
  adsRemainingToday: number
  /// Ads banked toward the next unit, per reward kind.
  progress: Record<AdRewardKind, number>
  earned: Record<AdRewardKind, number>
}

export interface AdRewardOutcome {
  granted: number
  kind: AdRewardKind
  /// Why nothing was granted, when nothing was.
  reason?: string
  progress: AdRewardProgress
}

export function isAdRewardKind(value: unknown): value is AdRewardKind {
  return value === 'fitting' || value === 'source'
}

/** UTC day the cap is counted against. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Records one completed rewarded ad and pays out if it completed a set.
 *
 * `viewId` is the ad network's own id for the view. It is the primary key, so
 * a replayed callback — or a shopper whose phone retried the request — cannot
 * be paid twice for the same ad.
 */
export async function recordRewardedAdView(
  env: TrolleyScoutEnv,
  accountId: string,
  kind: AdRewardKind,
  viewId: string,
  now: Date = new Date(),
): Promise<AdRewardOutcome> {
  if (!env.DB) {
    return {
      granted: 0,
      kind,
      progress: emptyProgress(),
      reason: 'Rewards are not available right now.',
    }
  }

  const today = dayKey(now)
  const seenToday = await countAdsOn(env, accountId, today)
  if (seenToday >= MAX_ADS_PER_DAY) {
    return {
      granted: 0,
      kind,
      progress: await readAdRewardProgress(env, accountId, now),
      reason: `That is all ${MAX_ADS_PER_DAY} for today. Come back tomorrow.`,
    }
  }

  const rate = AD_REWARD_RATES[kind]
  const earnedAlready = await countGranted(env, accountId, kind)
  if (rate.lifetimeCap !== null && earnedAlready >= rate.lifetimeCap) {
    return {
      granted: 0,
      kind,
      progress: await readAdRewardProgress(env, accountId, now),
      reason: `You have earned all ${rate.lifetimeCap} of these.`,
    }
  }

  // The insert is the deduplication: a repeated view id does nothing.
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO ad_reward_views
      (view_id, account_id, reward_kind, day_key, created_at)
      VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(viewId.slice(0, 120), accountId, kind, today, now.toISOString())
    .run()

  if ((inserted.meta?.changes ?? 0) === 0) {
    return {
      granted: 0,
      kind,
      progress: await readAdRewardProgress(env, accountId, now),
      reason: 'That ad was already counted.',
    }
  }

  // A set completes when the unpaid views reach the rate.
  const unpaid = await countUnpaid(env, accountId, kind)
  if (unpaid < rate.adsPerReward) {
    return {
      granted: 0,
      kind,
      progress: await readAdRewardProgress(env, accountId, now),
    }
  }

  await env.DB.prepare(
    `UPDATE ad_reward_views SET paid_at = ?
      WHERE view_id IN (
        SELECT view_id FROM ad_reward_views
        WHERE account_id = ? AND reward_kind = ? AND paid_at IS NULL
        ORDER BY created_at ASC LIMIT ?
      )`,
  )
    .bind(now.toISOString(), accountId, kind, rate.adsPerReward)
    .run()

  await env.DB.prepare(
    `INSERT INTO ad_reward_grants
      (id, account_id, reward_kind, amount, created_at)
      VALUES (?, ?, ?, 1, ?)`,
  )
    .bind(`${accountId}-${kind}-${now.getTime()}`, accountId, kind, now.toISOString())
    .run()

  if (kind === 'fitting') {
    await adjustTryOnCredits(env, accountId, 1, 'Earned by watching an ad', 'ads', now)
  }

  return {
    granted: 1,
    kind,
    progress: await readAdRewardProgress(env, accountId, now),
  }
}

export async function readAdRewardProgress(
  env: TrolleyScoutEnv,
  accountId: string,
  now: Date = new Date(),
): Promise<AdRewardProgress> {
  if (!env.DB) return emptyProgress()
  const [adsToday, fittingUnpaid, sourceUnpaid, fittings, sources] =
    await Promise.all([
      countAdsOn(env, accountId, dayKey(now)),
      countUnpaid(env, accountId, 'fitting'),
      countUnpaid(env, accountId, 'source'),
      countGranted(env, accountId, 'fitting'),
      countGranted(env, accountId, 'source'),
    ])

  return {
    adsRemainingToday: Math.max(0, MAX_ADS_PER_DAY - adsToday),
    adsToday,
    earned: { fitting: fittings, source: sources },
    progress: { fitting: fittingUnpaid, source: sourceUnpaid },
  }
}

/**
 * Extra Marketplace shops this account has earned.
 *
 * Added to the plan's own allowance rather than replacing it, so earning some
 * and then subscribing keeps both.
 */
export async function readEarnedSourceBonus(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<number> {
  if (!env.DB) return 0
  const earned = await countGranted(env, accountId, 'source')
  const cap = AD_REWARD_RATES.source.lifetimeCap ?? earned
  return Math.min(earned, cap)
}

function emptyProgress(): AdRewardProgress {
  return {
    adsRemainingToday: MAX_ADS_PER_DAY,
    adsToday: 0,
    earned: { fitting: 0, source: 0 },
    progress: { fitting: 0, source: 0 },
  }
}

async function countAdsOn(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
  day: string,
): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ad_reward_views WHERE account_id = ? AND day_key = ?',
  )
    .bind(accountId, day)
    .first<{ n: number }>()
  return row?.n ?? 0
}

async function countUnpaid(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
  kind: AdRewardKind,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ad_reward_views
      WHERE account_id = ? AND reward_kind = ? AND paid_at IS NULL`,
  )
    .bind(accountId, kind)
    .first<{ n: number }>()
  return row?.n ?? 0
}

async function countGranted(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
  kind: AdRewardKind,
): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) AS n FROM ad_reward_grants
      WHERE account_id = ? AND reward_kind = ?`,
  )
    .bind(accountId, kind)
    .first<{ n: number }>()
  return row?.n ?? 0
}
