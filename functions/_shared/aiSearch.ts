import { neuronsFor, spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'

/**
 * Managed retrieval over the parts of the app that are documents.
 *
 * AI Search re-indexes on a six-hour cycle, which rules it out for prices —
 * answering "R199.99" from a six-hour-old index is exactly the stale-fact
 * failure this app exists to avoid. It is a good fit for the content that does
 * not change hourly: help and About pages, the agent-skills documentation, the
 * rules, and the text pulled out of catalogues.
 *
 * Free within its limits during the open beta; the Workers AI generation step
 * is billed normally, so it is metered here like everything else.
 */

/** The model AI Search uses to write an answer from what it retrieved. */
const ANSWER_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

export interface AiSearchAnswer {
  response: string
  sources: string[]
}

/**
 * Asks the documentation corpus a question.
 *
 * Returns null when no instance is configured or the neuron budget is spent —
 * both cases leave the caller to answer from its own context, which is what it
 * did before.
 */
export async function askAiSearch(
  env: TrolleyScoutEnv,
  query: string,
  options: { now?: Date } = {},
): Promise<AiSearchAnswer | null> {
  const instance = env.AI_SEARCH_INSTANCE?.trim()
  const text = query.trim()
  if (!env.AI || !instance || text.length === 0) return null

  const now = options.now ?? new Date()
  if (!(await spendAiBudget(env, 'neurons', neuronsFor(ANSWER_MODEL), now))) {
    return null
  }

  try {
    const result = await env.AI.autorag(instance).aiSearch({
      model: ANSWER_MODEL,
      query: text,
    })
    const response = typeof result?.response === 'string' ? result.response : ''
    if (!response) return null
    return { response, sources: sourcesOf(result) }
  } catch {
    // A missing instance or an indexing error must never cost an answer.
    return null
  }
}

/**
 * Retrieval only, with no generated prose.
 *
 * Cheaper and more honest when the caller wants passages to ground its own
 * answer rather than a second model's summary of them.
 */
export async function searchAiSearch(
  env: TrolleyScoutEnv,
  query: string,
): Promise<string[]> {
  const instance = env.AI_SEARCH_INSTANCE?.trim()
  if (!env.AI || !instance || !query.trim()) return []
  try {
    const result = await env.AI.autorag(instance).search({ query: query.trim() })
    return passagesOf(result)
  } catch {
    return []
  }
}

function sourcesOf(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) return []
  const data = (result as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const names = data
    .map((row) =>
      typeof row === 'object' && row !== null
        ? String((row as { filename?: unknown }).filename ?? '')
        : '',
    )
    .filter((name) => name.length > 0)
  return [...new Set(names)]
}

function passagesOf(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) return []
  const data = (result as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const passages: string[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue
    const content = (row as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const chunk of content) {
      const text =
        typeof chunk === 'object' && chunk !== null
          ? String((chunk as { text?: unknown }).text ?? '')
          : ''
      if (text.trim()) passages.push(text.trim())
    }
  }
  return passages
}
