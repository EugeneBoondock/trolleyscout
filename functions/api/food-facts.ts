import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

// Health facts for a marketplace food. The first shopper to ask pays the AI
// call; the answer is stored and every later shopper reads the same facts, so
// the knowledge compounds instead of burning tokens per tap.

// The plain 3.1-8b was retired 2026-05-30 (error 5028); -fast is its
// supported successor in the catalogue.
const FACTS_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'
const MAX_TITLE_LENGTH = 120

export interface FoodFacts {
  food: string
  facts: string[]
  budgetTip: string
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)

  const title = (new URL(request.url).searchParams.get('title') ?? '')
    .trim()
    .slice(0, MAX_TITLE_LENGTH)
  if (title.length < 2) {
    return json({ available: false, issues: ['Provide a food title.'] }, { status: 400 })
  }

  const key = factKey(title)
  const cached = await readCachedFacts(env, key)
  if (cached) {
    return json({ available: true, cached: true, ...cached })
  }

  if (!env.AI) {
    return json({ available: false, issues: ['Facts are warming up. Try again shortly.'] }, { status: 503 })
  }

  const facts = await generateFacts(env, title)
  if (!facts) {
    return json(
      { available: false, issues: ['No facts for this one yet.'] },
      { status: 404 },
    )
  }

  await saveFacts(env, key, title, facts)
  return json({ available: true, cached: false, ...facts })
}

/** Same food, same key: lowercase, sizes and pack counts stripped, so
 * "Jungle Oats 1kg" and "JUNGLE OATS 500g" share one row. */
export function factKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d+([.,]\d+)?\s*(kg|g|ml|l|litre|liter|pack|pk|s|x)\b/g, ' ')
    .replace(/\bx\s*\d+\b/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readCachedFacts(
  env: TrolleyScoutEnv,
  key: string,
): Promise<FoodFacts | null> {
  if (!env.DB) return null
  try {
    const row = await env.DB.prepare(
      'SELECT facts_json FROM food_facts WHERE fact_key = ?',
    )
      .bind(key)
      .first<{ facts_json: string }>()
    if (!row) return null
    const parsed: unknown = JSON.parse(row.facts_json)
    return isFoodFacts(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function saveFacts(
  env: TrolleyScoutEnv,
  key: string,
  title: string,
  facts: FoodFacts,
): Promise<void> {
  if (!env.DB) return
  try {
    await env.DB.prepare(
      `INSERT INTO food_facts (fact_key, title, facts_json, created_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (fact_key) DO NOTHING`,
    )
      .bind(key, title, JSON.stringify(facts), new Date().toISOString())
      .run()
  } catch {
    // Cache is best-effort; the shopper still has their facts.
  }
}

async function generateFacts(
  env: TrolleyScoutEnv,
  title: string,
): Promise<FoodFacts | null> {
  if (!env.AI) return null
  try {
    const result = await env.AI.run(
      FACTS_MODEL as never,
      {
        max_tokens: 400,
        messages: [
          {
            content:
              'You are a South African dietitian helping low-income shoppers eat well on a tight budget. ' +
              'Given a grocery product name, answer ONLY with JSON: ' +
              '{"food": "<plain food name>", "facts": ["<fact 1>", "<fact 2>", "<fact 3>"], "budgetTip": "<one sentence>"}. ' +
              'Facts must be short, true, evidence-based nutrition facts about the food itself (nutrients, health benefits). ' +
              'The budgetTip says how to get the most nutrition per rand from it. ' +
              'If the product is not a recognisable food, answer {"food": "", "facts": [], "budgetTip": ""}.',
            role: 'system',
          },
          { content: title, role: 'user' },
        ],
      } as never,
    ) as {
      choices?: Array<{ message?: { content?: unknown } }>
      response?: unknown
    }
    // Older models answer {response}; the -fast family answers in the
    // OpenAI chat-completions shape.
    const text = typeof result?.response === 'string'
      ? result.response
      : typeof result?.choices?.[0]?.message?.content === 'string'
        ? result.choices[0].message.content
        : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('food-facts model answered unparseably:',
        JSON.stringify(result).slice(0, 400))
      return null
    }
    const parsed: unknown = JSON.parse(match[0])
    if (!isFoodFacts(parsed) || parsed.facts.length === 0 || !parsed.food) {
      return null
    }
    return {
      budgetTip: parsed.budgetTip.slice(0, 300),
      facts: parsed.facts.slice(0, 4).map((fact) => fact.slice(0, 300)),
      food: parsed.food.slice(0, 80),
    }
  } catch (error) {
    console.error('food-facts model call failed:',
      error instanceof Error ? error.message : String(error))
    return null
  }
}

function isFoodFacts(value: unknown): value is FoodFacts {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.food === 'string' &&
    typeof record.budgetTip === 'string' &&
    Array.isArray(record.facts) &&
    record.facts.every((fact) => typeof fact === 'string')
}
