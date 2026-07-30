/**
 * Records what Mr Scout searched for and what came back.
 *
 * Retrieval was previously invisible. When a shopper reported that Mr Scout
 * could not find 50 inch televisions there was no way to see what had been
 * queried, which stores answered, or how the candidates scored — the bug had
 * to be reproduced by hand. Every retrieval now leaves a row.
 */

import type { TrolleyScoutEnv } from './env'
import type { ProductRetrievalResult } from './scoutRetrieval'

const MAX_LOGGED_CANDIDATES = 10
const MAX_QUERY_LENGTH = 600

export interface ScoutRetrievalLogInput {
  accountId?: string
  queryText: string
  retrieval: ProductRetrievalResult
  shownCount: number
}

export async function logScoutRetrieval(
  env: TrolleyScoutEnv,
  input: ScoutRetrievalLogInput,
): Promise<string | undefined> {
  if (!env.DB) return undefined

  const { retrieval } = input
  const id = crypto.randomUUID()
  const candidates = retrieval.candidates.slice(0, MAX_LOGGED_CANDIDATES).map((candidate) => ({
    priceCents: candidate.priceCents,
    reasons: candidate.scoreReasons,
    retailerId: candidate.retailerId,
    score: candidate.score,
    title: candidate.title,
  }))

  await env.DB.prepare(
    `INSERT INTO scout_retrieval_log (
      id, account_id, query_text, parsed_query, stage_timings,
      candidates, candidate_count, shown_count, total_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.accountId ?? null,
      input.queryText.slice(0, MAX_QUERY_LENGTH),
      JSON.stringify({
        category: retrieval.query.category,
        colour: retrieval.query.colour,
        headTerms: retrieval.query.headTerms,
        modifiers: retrieval.query.modifiers,
        priceCeilingCents: retrieval.query.priceCeilingCents,
        searched: retrieval.searched,
        spec: retrieval.query.spec,
        storefrontQuery: retrieval.query.storefrontQuery,
      }),
      JSON.stringify(retrieval.timings),
      JSON.stringify(candidates),
      retrieval.candidates.length,
      input.shownCount,
      retrieval.timings.reduce((slowest, stage) => Math.max(slowest, stage.ms), 0),
    )
    .run()

  return id
}

export async function recordScoutRetrievalFeedback(
  env: TrolleyScoutEnv,
  retrievalId: string,
  feedback: 'down' | 'up',
): Promise<boolean> {
  if (!env.DB) return false

  const result = await env.DB.prepare(
    'UPDATE scout_retrieval_log SET feedback = ? WHERE id = ?',
  )
    .bind(feedback, retrievalId)
    .run()

  return (result.meta?.changes ?? 0) > 0
}
