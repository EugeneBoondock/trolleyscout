import { beforeEach, describe, expect, it } from 'vitest'

import {
  AI_BUDGET,
  budgetCeiling,
  budgetWindowKey,
  neuronsFor,
  readAiBudget,
  readAllAiBudgets,
  refundAiBudget,
  spendAiBudget,
} from './aiBudget'
import type { TrolleyScoutEnv } from './env'

/** A D1 stand-in that understands only the statements this module issues. */
function fakeDatabase() {
  const rows = new Map<string, { calls: number; used: number }>()
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (!sql.includes('SELECT')) return null
              return rows.get(String(args[0])) ?? null
            },
            async run() {
              if (sql.startsWith('INSERT')) {
                const [id, , , amount] = args as [string, string, string, number]
                const existing = rows.get(id) ?? { calls: 0, used: 0 }
                rows.set(id, {
                  calls: existing.calls + 1,
                  used: existing.used + amount,
                })
                return
              }
              if (sql.includes('UPDATE')) {
                const [amount, , id] = args as [number, string, string]
                const existing = rows.get(id)
                if (existing) {
                  rows.set(id, {
                    calls: existing.calls,
                    used: Math.max(0, existing.used - amount),
                  })
                }
              }
            },
          }
        },
      }
    },
  }
  return { db, rows }
}

const now = new Date('2026-08-07T09:00:00.000Z')
let env: TrolleyScoutEnv
let store: ReturnType<typeof fakeDatabase>

beforeEach(() => {
  store = fakeDatabase()
  env = { DB: store.db } as unknown as TrolleyScoutEnv
})

describe('AI budget', () => {
  it('meters each allowance in the window Cloudflare bills it in', () => {
    // Neurons reset daily; browser hours and vector queries are monthly; a
    // stored vector keeps costing until it is deleted.
    expect(budgetWindowKey('neurons', now)).toBe('2026-08-07')
    expect(budgetWindowKey('browserSeconds', now)).toBe('2026-08')
    expect(budgetWindowKey('vectorQueryDims', now)).toBe('2026-08')
    expect(budgetWindowKey('vectorStoredDims', now)).toBe('total')
  })

  it('stops short of the included amount, not exactly at it', () => {
    // Neuron costs are estimates and a request in flight can still land after
    // a check passes, so the ceiling leaves room to be wrong for free.
    expect(budgetCeiling('neurons')).toBeLessThan(AI_BUDGET.neurons.included)
    expect(budgetCeiling('neurons')).toBe(8_500)
    expect(budgetCeiling('browserSeconds')).toBe(30_600)
  })

  it('lets a call through and remembers what it cost', async () => {
    expect(await spendAiBudget(env, 'neurons', 250, now)).toBe(true)

    const state = await readAiBudget(env, 'neurons', now)
    expect(state.used).toBe(250)
    expect(state.calls).toBe(1)
    expect(state.remaining).toBe(8_250)
  })

  it('refuses the call that would take us past the ceiling', async () => {
    expect(await spendAiBudget(env, 'neurons', 8_400, now)).toBe(true)

    // 8,400 + 250 is over 8,500, so this one is refused outright rather than
    // allowed and billed.
    expect(await spendAiBudget(env, 'neurons', 250, now)).toBe(false)
    const state = await readAiBudget(env, 'neurons', now)
    expect(state.used).toBe(8_400)
  })

  it('starts fresh when the window rolls over', async () => {
    await spendAiBudget(env, 'neurons', 8_400, now)

    const tomorrow = new Date('2026-08-08T09:00:00.000Z')
    expect(await spendAiBudget(env, 'neurons', 250, tomorrow)).toBe(true)
    expect((await readAiBudget(env, 'neurons', tomorrow)).used).toBe(250)
    // Yesterday's spend is untouched, not rewritten.
    expect((await readAiBudget(env, 'neurons', now)).used).toBe(8_400)
  })

  it('refuses everything when there is no meter to write to', async () => {
    // An unmetered AI call is the exact thing this module exists to prevent.
    const blind = {} as TrolleyScoutEnv
    expect(await spendAiBudget(blind, 'neurons', 1, now)).toBe(false)
  })

  it('charges up front, because a failed inference still costs', async () => {
    await spendAiBudget(env, 'neurons', 900, now)
    expect((await readAiBudget(env, 'neurons', now)).used).toBe(900)

    // ...and hands back the difference when the call turns out cheaper.
    await refundAiBudget(env, 'neurons', 400, now)
    expect((await readAiBudget(env, 'neurons', now)).used).toBe(500)
  })

  it('never refunds a window below zero', async () => {
    await spendAiBudget(env, 'neurons', 100, now)
    await refundAiBudget(env, 'neurons', 5_000, now)
    expect((await readAiBudget(env, 'neurons', now)).used).toBe(0)
  })

  it('assumes an unknown model is expensive rather than free', () => {
    expect(neuronsFor('@cf/baai/bge-small-en-v1.5')).toBe(10)
    expect(neuronsFor('@cf/meta/llama-3.1-8b-instruct-fast')).toBe(250)
    expect(neuronsFor('@cf/some/model-we-have-not-priced')).toBe(1_000)
    expect(neuronsFor('@cf/baai/bge-small-en-v1.5', 4)).toBe(40)
  })

  it('rejects a nonsense amount instead of corrupting the meter', async () => {
    expect(await spendAiBudget(env, 'neurons', -5, now)).toBe(false)
    expect(await spendAiBudget(env, 'neurons', Number.NaN, now)).toBe(false)
    expect((await readAiBudget(env, 'neurons', now)).used).toBe(0)
  })

  it('reports every allowance for the admin console', async () => {
    await spendAiBudget(env, 'browserSeconds', 600, now)

    const all = await readAllAiBudgets(env, now)
    const browser = all.find((row) => row.resource === 'browserSeconds')
    expect(all).toHaveLength(4)
    expect(browser?.used).toBe(600)
    expect(browser?.included).toBe(36_000)
  })
})
