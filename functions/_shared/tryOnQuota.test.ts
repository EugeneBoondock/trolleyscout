import { describe, expect, it } from 'vitest'

import type { TrolleyScoutEnv } from './env'
import {
  adjustTryOnCredits,
  monthKey,
  readTryOnQuota,
  recordTryOnUse,
  tryOnLimitFor,
} from './tryOnQuota'

function makeEnv(rows: { usage?: number; credits?: number } = {}) {
  const statements: Array<{ sql: string; args: unknown[] }> = []
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => {
            if (sql.includes('try_on_usage')) {
              return rows.usage === undefined ? null : { used_count: rows.usage }
            }
            if (sql.includes('try_on_credits')) {
              return rows.credits === undefined ? null : { balance: rows.credits }
            }
            return null
          },
          run: async () => {
            statements.push({ args, sql })
            return { meta: { changes: 1 } }
          },
        }),
      }),
    },
  } as unknown as TrolleyScoutEnv
  return { env, statements }
}

describe('try-on quotas', () => {
  it('gives each plan the fittings it was sold', () => {
    expect(tryOnLimitFor('free', false)).toBe(10)
    expect(tryOnLimitFor('scout', false)).toBe(50)
    expect(tryOnLimitFor('household', false)).toBeNull()
    expect(tryOnLimitFor('organization', false)).toBeNull()
    // An unknown plan is treated as free rather than unlimited.
    expect(tryOnLimitFor('mystery', false)).toBe(10)
    // Admins are never counted.
    expect(tryOnLimitFor('free', true)).toBeNull()
  })

  it('adds bought credits on top of the monthly allowance', async () => {
    const { env } = makeEnv({ credits: 12, usage: 10 })
    const quota = await readTryOnQuota(env, 'member-1', 'free', false)
    // The month is spent, but the credits are still there to spend.
    expect(quota).toMatchObject({ credits: 12, limit: 10, remaining: 12, used: 10 })
  })

  it('spends the month first and credits only after it', async () => {
    const midMonth = makeEnv()
    await recordTryOnUse(midMonth.env, 'member-1', new Date('2026-08-06T10:00:00Z'), {
      credits: 5,
      limit: 10,
      remaining: 8,
      used: 2,
    })
    expect(midMonth.statements[0].sql).toContain('try_on_usage')

    const exhausted = makeEnv()
    await recordTryOnUse(exhausted.env, 'member-1', new Date('2026-08-06T10:00:00Z'), {
      credits: 5,
      limit: 10,
      remaining: 5,
      used: 10,
    })
    expect(exhausted.statements[0].sql).toContain('try_on_credits')
    expect(exhausted.statements[0].args).toContain(-1)
  })

  it('records why every credit moved', async () => {
    const { env, statements } = makeEnv({ credits: 0 })
    await adjustTryOnCredits(env, 'member-1', 30, 'purchase:fittings-30', 'admin-1')
    expect(statements.some((entry) => entry.sql.includes('try_on_credit_events')))
      .toBe(true)
    const event = statements.find((entry) =>
      entry.sql.includes('try_on_credit_events'))
    expect(event?.args).toContain('purchase:fittings-30')
    expect(event?.args).toContain('admin-1')
  })

  it('keys usage by calendar month so allowances reset', () => {
    expect(monthKey(new Date('2026-08-31T23:00:00Z'))).toBe('2026-08')
    expect(monthKey(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09')
  })

  it('never locks a shopper out when the tables are missing', async () => {
    const quota = await readTryOnQuota({} as TrolleyScoutEnv, 'member-1', 'scout', false)
    expect(quota).toMatchObject({ credits: 0, limit: 50, remaining: 50, used: 0 })
  })
})
