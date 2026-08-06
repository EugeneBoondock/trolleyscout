import { describe, expect, it } from 'vitest'

import {
  AD_REWARD_RATES,
  MAX_ADS_PER_DAY,
  isAdRewardKind,
  readAdRewardProgress,
  readEarnedSourceBonus,
  recordRewardedAdView,
} from './adRewards'
import type { TrolleyScoutEnv } from './env'

interface View {
  accountId: string
  createdAt: string
  dayKey: string
  kind: string
  paidAt: string | null
  viewId: string
}

/// A small stand-in for the two reward tables. Stateful, because the whole
/// point of this ledger is what it remembers between calls.
function makeEnv() {
  const views: View[] = []
  const grants: Array<{ accountId: string; amount: number; kind: string }> = []
  const credits: Array<{ accountId: string; amount: number; reason: string }> =
    []

  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('FROM ad_reward_views') && sql.includes('day_key')) {
              const [accountId, day] = args as [string, string]
              return {
                n: views.filter(
                  (view) => view.accountId === accountId && view.dayKey === day,
                ).length,
              }
            }
            if (sql.includes('FROM ad_reward_views')) {
              const [accountId, kind] = args as [string, string]
              return {
                n: views.filter(
                  (view) =>
                    view.accountId === accountId &&
                    view.kind === kind &&
                    view.paidAt === null,
                ).length,
              }
            }
            if (sql.includes('FROM ad_reward_grants')) {
              const [accountId, kind] = args as [string, string]
              return {
                n: grants
                  .filter(
                    (grant) =>
                      grant.accountId === accountId && grant.kind === kind,
                  )
                  .reduce((total, grant) => total + grant.amount, 0),
              }
            }
            if (sql.includes('try_on_credits')) {
              return {
                balance: credits.reduce((total, row) => total + row.amount, 0),
              }
            }
            return null
          },
          run: async () => {
            if (sql.includes('INSERT OR IGNORE INTO ad_reward_views')) {
              const [viewId, accountId, kind, dayKey, createdAt] = args as [
                string,
                string,
                string,
                string,
                string,
              ]
              if (views.some((view) => view.viewId === viewId)) {
                return { meta: { changes: 0 } }
              }
              // The stamp is the same inside one call, so a counter keeps the
              // insertion order stable for the oldest-first payout.
              views.push({
                accountId,
                createdAt: `${createdAt}-${views.length}`,
                dayKey,
                kind,
                paidAt: null,
                viewId,
              })
              return { meta: { changes: 1 } }
            }
            if (sql.includes('UPDATE ad_reward_views')) {
              const [paidAt, accountId, kind, limit] = args as [
                string,
                string,
                string,
                number,
              ]
              views
                .filter(
                  (view) =>
                    view.accountId === accountId &&
                    view.kind === kind &&
                    view.paidAt === null,
                )
                .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
                .slice(0, limit)
                .forEach((view) => {
                  view.paidAt = paidAt
                })
              return { meta: { changes: limit } }
            }
            if (sql.includes('INSERT INTO ad_reward_grants')) {
              const [, accountId, kind] = args as [string, string, string]
              grants.push({ accountId, amount: 1, kind })
              return { meta: { changes: 1 } }
            }
            if (sql.includes('try_on_credits')) {
              const [accountId, amount] = args as [string, number]
              credits.push({ accountId, amount, reason: 'ad' })
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 1 } }
          },
        }),
      }),
    },
  } as unknown as TrolleyScoutEnv

  return { credits, env, grants, views }
}

async function watch(
  env: TrolleyScoutEnv,
  kind: 'fitting' | 'source',
  count: number,
  from = 0,
) {
  let last
  for (let index = 0; index < count; index += 1) {
    last = await recordRewardedAdView(env, 'member-1', kind, `view-${from + index}`)
  }
  return last!
}

describe('rewarded ads', () => {
  it('pays a fitting for every five ads, and not before', async () => {
    const { credits, env } = makeEnv()

    for (let index = 0; index < 4; index += 1) {
      const outcome = await recordRewardedAdView(
        env,
        'member-1',
        'fitting',
        `view-${index}`,
      )
      expect(outcome.granted).toBe(0)
      expect(outcome.reason).toBeUndefined()
    }

    // The daily cap is four, so the fifth ad has to be tomorrow's.
    const capped = await recordRewardedAdView(env, 'member-1', 'fitting', 'view-4')
    expect(capped.granted).toBe(0)
    expect(capped.reason).toContain('today')

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const paid = await recordRewardedAdView(
      env,
      'member-1',
      'fitting',
      'view-5',
      tomorrow,
    )

    expect(paid.granted).toBe(1)
    expect(credits).toEqual([
      { accountId: 'member-1', amount: 1, reason: 'ad' },
    ])
  })

  it('counts one ad once, however many times the phone reports it', async () => {
    const { env } = makeEnv()

    await recordRewardedAdView(env, 'member-1', 'fitting', 'view-a')
    const replay = await recordRewardedAdView(env, 'member-1', 'fitting', 'view-a')

    expect(replay.granted).toBe(0)
    expect(replay.reason).toContain('already')
    expect(replay.progress.adsToday).toBe(1)
  })

  it('never lets watching ads beat the plan that pays the bills', () => {
    // Four ads a day at five ads a fitting is at most 24 fittings a month.
    // Scout is R50 for 50 fittings and the whole toolkit, so the plan stays
    // the better deal for anyone who actually needs volume.
    const perMonth = (MAX_ADS_PER_DAY * 30) / AD_REWARD_RATES.fitting.adsPerReward
    expect(perMonth).toBeLessThan(50)
  })

  it('stops handing out shops once the lifetime cap is reached', async () => {
    const { env } = makeEnv()
    const cap = AD_REWARD_RATES.source.lifetimeCap!
    const perReward = AD_REWARD_RATES.source.adsPerReward

    // Spread across days, because the daily cap is the point of a daily cap.
    let day = new Date('2026-08-06T09:00:00.000Z')
    for (let index = 0; index < cap * perReward; index += 1) {
      if (index > 0 && index % MAX_ADS_PER_DAY === 0) {
        day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
      }
      await recordRewardedAdView(env, 'member-1', 'source', `s-${index}`, day)
    }

    expect(await readEarnedSourceBonus(env, 'member-1')).toBe(cap)

    const beyond = await recordRewardedAdView(
      env,
      'member-1',
      'source',
      'one-too-many',
      new Date(day.getTime() + 24 * 60 * 60 * 1000),
    )
    expect(beyond.granted).toBe(0)
    expect(beyond.reason).toContain('earned all')
    expect(await readEarnedSourceBonus(env, 'member-1')).toBe(cap)
  })

  it('reports how far along each reward is', async () => {
    const { env } = makeEnv()
    await watch(env, 'fitting', 2)

    const progress = await readAdRewardProgress(env, 'member-1')

    expect(progress).toMatchObject({
      adsRemainingToday: MAX_ADS_PER_DAY - 2,
      adsToday: 2,
      earned: { fitting: 0, source: 0 },
      progress: { fitting: 2, source: 0 },
    })
  })

  it('grants nothing at all without a store to record it in', async () => {
    const outcome = await recordRewardedAdView(
      {} as TrolleyScoutEnv,
      'member-1',
      'fitting',
      'view-x',
    )
    expect(outcome.granted).toBe(0)
    expect(outcome.reason).toBeTruthy()
  })

  it('only accepts the two rewards it actually offers', () => {
    expect(isAdRewardKind('fitting')).toBe(true)
    expect(isAdRewardKind('source')).toBe(true)
    expect(isAdRewardKind('cash')).toBe(false)
    expect(isAdRewardKind(undefined)).toBe(false)
  })
})
