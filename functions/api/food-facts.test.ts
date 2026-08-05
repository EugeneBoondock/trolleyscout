import { describe, expect, it, vi } from 'vitest'

import { factKey, onRequest } from './food-facts'

function makeDb(rows: Record<string, string> = {}) {
  const saved: unknown[][] = []
  return {
    saved,
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (!sql.includes('SELECT')) return null
          const key = args[0] as string
          return rows[key] ? { facts_json: rows[key] } : null
        },
        run: async () => {
          saved.push(args)
          return {}
        },
      }),
    }),
  }
}

function invoke(env: Record<string, unknown>, title: string) {
  return (onRequest as unknown as (context: {
    env: unknown
    request: Request
  }) => Promise<Response>)({
    env,
    request: new Request(
      `https://trolleyscout.co.za/api/food-facts?title=${encodeURIComponent(title)}`,
    ),
  })
}

const factsJson = JSON.stringify({
  budgetTip: 'Buy dried, not tinned.',
  facts: ['High in fibre.', 'Cheap protein.'],
  food: 'Sugar beans',
})

describe('food facts', () => {
  it('shares one row across pack sizes of the same food', () => {
    expect(factKey('Jungle Oats 1kg')).toBe(factKey('JUNGLE OATS 500g'))
    expect(factKey('Sugar Beans 2kg')).not.toBe(factKey('Brown Lentils 500g'))
  })

  it('serves cached facts without touching the AI', async () => {
    const ai = { run: vi.fn() }
    const response = await invoke(
      { AI: ai, DB: makeDb({ [factKey('Sugar Beans 2kg')]: factsJson }) },
      'Sugar Beans 2kg',
    )
    const payload = (await response.json()) as { data: { cached: boolean; food: string } }
    expect(response.status).toBe(200)
    expect(payload.data.cached).toBe(true)
    expect(payload.data.food).toBe('Sugar beans')
    expect(ai.run).not.toHaveBeenCalled()
  })

  it('generates, stores and returns facts on a cache miss', async () => {
    const db = makeDb()
    // The -fast models answer in chat-completions shape, not {response}.
    const ai = {
      run: vi.fn(async () => ({
        choices: [{ message: { content: 'Sure! Here you go: ' + factsJson } }],
      })),
    }
    const response = await invoke({ AI: ai, DB: db }, 'Sugar Beans 2kg')
    const payload = (await response.json()) as { data: { cached: boolean; facts: string[] } }
    expect(response.status).toBe(200)
    expect(payload.data.cached).toBe(false)
    expect(payload.data.facts).toEqual(['High in fibre.', 'Cheap protein.'])
    expect(db.saved).toHaveLength(1)
  })

  it('says not-found when the AI cannot recognise a food', async () => {
    const ai = {
      run: vi.fn(async () => ({
        response: '{"food": "", "facts": [], "budgetTip": ""}',
      })),
    }
    const response = await invoke({ AI: ai, DB: makeDb() }, 'HDMI cable 2m')
    expect(response.status).toBe(404)
  })

  it('rejects empty titles and missing AI honestly', async () => {
    expect((await invoke({ DB: makeDb() }, ' ')).status).toBe(400)
    expect((await invoke({ DB: makeDb() }, 'Oats 1kg')).status).toBe(503)
  })
})
