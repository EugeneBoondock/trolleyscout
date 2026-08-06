import { describe, expect, it, vi } from 'vitest'

import { readAiBudget, spendAiBudget } from './aiBudget'
import {
  EMBEDDING_DIMENSIONS,
  MAX_INDEXED_PRODUCTS,
  embeddingTextFor,
  forgetProducts,
  indexProducts,
  searchProducts,
} from './productSearchIndex'
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
}

function fakeEnv(overrides: Record<string, unknown> = {}) {
  const upserted: unknown[] = []
  const deleted: string[] = []
  const env = {
    AI: {
      run: vi.fn(async (_model: string, inputs: { text: string[] }) => ({
        data: inputs.text.map(() => new Array(EMBEDDING_DIMENSIONS).fill(0.1)),
      })),
    },
    DB: fakeDatabase(),
    PRODUCT_INDEX: {
      async deleteByIds(ids: string[]) {
        deleted.push(...ids)
      },
      async query() {
        return {
          matches: [
            { id: 'mrp:1', score: 0.82 },
            { id: 'tak:2', score: 0.71 },
          ],
        }
      },
      async upsert(vectors: unknown[]) {
        upserted.push(...vectors)
      },
    },
    ...overrides,
  } as unknown as TrolleyScoutEnv
  return { deleted, env, upserted }
}

const now = new Date('2026-08-07T09:00:00.000Z')

const jeans = {
  categoryText: 'Womens Denim',
  id: 'mrp:1',
  retailerName: 'Mr Price',
  title: 'Mom Jeans',
}

describe('product search index', () => {
  it('is sized to fit inside the included storage', () => {
    // Vectorize includes 10M stored dimensions, and dimensions are vectors x
    // width. 384-wide vectors leave room for the catalogue; 768 would not.
    expect(EMBEDDING_DIMENSIONS).toBe(384)
    expect(MAX_INDEXED_PRODUCTS).toBeGreaterThan(20_000)
  })

  it('embeds what a product is, never what it costs', () => {
    // A vector index is a stale copy the moment a special ends, so the price
    // is never allowed into it.
    const text = embeddingTextFor({ ...jeans, title: 'Mom Jeans R279.99' })
    expect(text).toContain('Mom Jeans')
    expect(text).toContain('Mr Price')
    expect(text).toContain('Womens Denim')
  })

  it('indexes a batch and charges its storage', async () => {
    const { env, upserted } = fakeEnv()

    expect(await indexProducts(env, [jeans], { now })).toBe(1)
    expect(upserted).toHaveLength(1)
    expect((await readAiBudget(env, 'vectorStoredDims', now)).used).toBe(
      EMBEDDING_DIMENSIONS,
    )
  })

  it('stops indexing when the storage allowance is spent', async () => {
    const { env, upserted } = fakeEnv()
    const ceiling = (await readAiBudget(env, 'vectorStoredDims', now)).ceiling
    await spendAiBudget(env, 'vectorStoredDims', ceiling, now)

    expect(await indexProducts(env, [jeans], { now })).toBe(0)
    expect(upserted).toHaveLength(0)
  })

  it('returns matches best first', async () => {
    const { env } = fakeEnv()

    const matches = await searchProducts(env, 'mom jeans', { now })

    expect(matches.map((match) => match.id)).toEqual(['mrp:1', 'tak:2'])
    expect(matches[0].score).toBeGreaterThan(matches[1].score)
  })

  it('falls back to keyword search when the query allowance is spent',
    async () => {
      const { env } = fakeEnv()
      const ceiling = (await readAiBudget(env, 'vectorQueryDims', now)).ceiling
      await spendAiBudget(env, 'vectorQueryDims', ceiling, now)

      // An empty result is the caller's signal to search the old way.
      expect(await searchProducts(env, 'mom jeans', { now })).toEqual([])
    })

  it('does nothing at all without a Vectorize binding', async () => {
    const { env } = fakeEnv({ PRODUCT_INDEX: undefined })

    expect(await indexProducts(env, [jeans], { now })).toBe(0)
    expect(await searchProducts(env, 'jeans', { now })).toEqual([])
    // And spends nothing, so an unconfigured deployment cannot be billed.
    expect((await readAiBudget(env, 'vectorStoredDims', now)).used).toBe(0)
  })

  it('hands storage back when a product leaves the catalogue', async () => {
    const { deleted, env } = fakeEnv()
    await indexProducts(env, [jeans], { now })

    expect(await forgetProducts(env, ['mrp:1'], { now })).toBe(1)

    expect(deleted).toEqual(['mrp:1'])
    // Otherwise the index creeps past the allowance one expired special at a
    // time, and storage is charged until the vector is actually gone.
    expect((await readAiBudget(env, 'vectorStoredDims', now)).used).toBe(0)
  })
})
