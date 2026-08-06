import { describe, expect, it } from 'vitest'

import {
  BROWSER_ONLY_RETAILERS,
  MAX_RENDER_SECONDS,
  needsBrowserRender,
  renderPage,
} from './browserRender'
import { readAiBudget, spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'

function fakeDatabase() {
  const rows = new Map<string, { calls: number; used: number }>()
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              return sql.includes('SELECT')
                ? rows.get(String(args[0])) ?? null
                : null
            },
            async run() {
              if (!sql.startsWith('INSERT')) return
              const [id, , , amount] = args as [string, string, string, number]
              const existing = rows.get(id) ?? { calls: 0, used: 0 }
              rows.set(id, {
                calls: existing.calls + 1,
                used: existing.used + amount,
              })
            },
          }
        },
      }
    },
  }
}

const now = new Date('2026-08-07T09:00:00.000Z')

describe('browser rendering', () => {
  it('only spends browser time on shops that refuse a plain fetch', () => {
    // Rendering costs about a thousand times what a fetch costs, so the list
    // is shops actually observed blocking one, not a guess.
    expect(needsBrowserRender('game')).toBe(true)
    expect(needsBrowserRender('superbalist')).toBe(true)
    expect(needsBrowserRender('checkers')).toBe(true)
    // These answer JSON happily and must never be rendered.
    expect(needsBrowserRender('takealot')).toBe(false)
    expect(needsBrowserRender('pep')).toBe(false)
    expect(needsBrowserRender('mrp')).toBe(false)
    expect(BROWSER_ONLY_RETAILERS.has('bathu')).toBe(false)
  })

  it('renders nothing when Browser Rendering is not configured', async () => {
    const env = { DB: fakeDatabase() } as unknown as TrolleyScoutEnv
    expect(await renderPage(env, 'https://shop.test/x', { now })).toBeNull()
    // And costs nothing, so an unconfigured deployment cannot drain the month.
    expect((await readAiBudget(env, 'browserSeconds', now)).used).toBe(0)
  })

  it('refuses to render once the month is spent', async () => {
    const env = {
      BROWSER: {},
      DB: fakeDatabase(),
    } as unknown as TrolleyScoutEnv

    // Fill the month to just under the ceiling.
    const ceiling = (await readAiBudget(env, 'browserSeconds', now)).ceiling
    await spendAiBudget(env, 'browserSeconds', ceiling - 1, now)

    // One more full render would cross it, so it does not happen at all.
    expect(await renderPage(env, 'https://shop.test/x', { now })).toBeNull()
    expect((await readAiBudget(env, 'browserSeconds', now)).used).toBe(
      ceiling - 1,
    )
  })

  it('claims the worst case up front, not the average', async () => {
    // A hung page is when a render costs the most, so the meter has to assume
    // one before the page is even opened.
    const env = {
      BROWSER: {},
      DB: fakeDatabase(),
    } as unknown as TrolleyScoutEnv

    await renderPage(env, 'https://shop.test/x', { now })

    expect((await readAiBudget(env, 'browserSeconds', now)).used).toBe(
      MAX_RENDER_SECONDS,
    )
  })
})
