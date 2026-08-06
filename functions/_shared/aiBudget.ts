import type { TrolleyScoutEnv } from './env'

/**
 * Keeps the app inside the AI allowances the Workers Paid plan includes.
 *
 * Cloudflare bills every one of these resources past a fixed included amount,
 * and the amounts are smaller than they look: Workers AI gives 10,000 neurons
 * a *day* on Paid, which is roughly fifty llama-3.1-8b calls, and Paid adds
 * nothing over Free. So this is not a nice-to-have counter — it is the thing
 * standing between a busy afternoon and an invoice.
 *
 * Every AI call asks here first and is refused when the window is spent. The
 * caller then does whatever it would have done with no AI at all, which every
 * one of these features already supports.
 *
 * Allowances verified against Cloudflare's pricing docs on 2026-08-07.
 */

export type AiResource =
  | 'neurons'
  | 'browserSeconds'
  | 'vectorQueryDims'
  | 'vectorStoredDims'

type BudgetWindow = 'day' | 'month' | 'total'

interface BudgetRule {
  /** What the Workers Paid plan includes before billing starts. */
  readonly included: number
  readonly window: BudgetWindow
  readonly label: string
}

export const AI_BUDGET: Record<AiResource, BudgetRule> = {
  // 10,000 neurons/day, then $0.011 per 1,000. Paid adds no extra allowance.
  neurons: { included: 10_000, window: 'day', label: 'Workers AI neurons' },
  // 10 browser hours a month, then $0.09/hour.
  browserSeconds: {
    included: 10 * 60 * 60,
    window: 'month',
    label: 'Browser Rendering',
  },
  // 50M queried vector dimensions a month.
  vectorQueryDims: {
    included: 50_000_000,
    window: 'month',
    label: 'Vectorize queries',
  },
  // 10M stored vector dimensions, counted as a standing total rather than a
  // window: stored vectors keep costing until they are deleted.
  vectorStoredDims: {
    included: 10_000_000,
    window: 'total',
    label: 'Vectorize storage',
  },
}

/**
 * Stop at 85% of the included amount.
 *
 * The neuron figures below are estimates, and a request already in flight can
 * still land after a check passes. Leaving headroom means being wrong about
 * either costs nothing.
 */
export const BUDGET_SAFETY_FRACTION = 0.85

/**
 * Neurons a single call costs, deliberately rounded up.
 *
 * Cloudflare bills the real number after the fact; over-estimating here makes
 * the app stop early rather than one call late.
 */
export const NEURON_ESTIMATES: Record<string, number> = {
  '@cf/meta/llama-3.1-8b-instruct-fast': 250,
  '@cf/meta/llama-3.1-8b-instruct': 250,
  '@cf/mistralai/mistral-small-3.1-24b-instruct': 900,
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': 1_200,
  '@cf/baai/bge-small-en-v1.5': 10,
  '@cf/baai/bge-base-en-v1.5': 20,
  '@cf/openai/whisper': 200,
}

/** An unknown model is assumed expensive rather than free. */
export const DEFAULT_NEURON_ESTIMATE = 1_000

export function neuronsFor(model: string, calls = 1): number {
  return (NEURON_ESTIMATES[model] ?? DEFAULT_NEURON_ESTIMATE) * Math.max(1, calls)
}

export function budgetWindowKey(resource: AiResource, now: Date): string {
  const iso = now.toISOString()
  switch (AI_BUDGET[resource].window) {
    case 'day':
      return iso.slice(0, 10)
    case 'month':
      return iso.slice(0, 7)
    case 'total':
      return 'total'
  }
}

export function budgetCeiling(resource: AiResource): number {
  return Math.floor(AI_BUDGET[resource].included * BUDGET_SAFETY_FRACTION)
}

export interface AiBudgetState {
  resource: AiResource
  used: number
  ceiling: number
  included: number
  remaining: number
  calls: number
  windowKey: string
}

export async function readAiBudget(
  env: TrolleyScoutEnv,
  resource: AiResource,
  now: Date = new Date(),
): Promise<AiBudgetState> {
  const windowKey = budgetWindowKey(resource, now)
  const ceiling = budgetCeiling(resource)
  let used = 0
  let calls = 0
  if (env.DB) {
    const row = await env.DB.prepare(
      'SELECT used, calls FROM ai_budget_usage WHERE id = ?',
    )
      .bind(`${resource}:${windowKey}`)
      .first<{ calls: number; used: number }>()
    used = typeof row?.used === 'number' ? row.used : 0
    calls = typeof row?.calls === 'number' ? row.calls : 0
  }
  return {
    calls,
    ceiling,
    included: AI_BUDGET[resource].included,
    remaining: Math.max(0, ceiling - used),
    resource,
    used,
    windowKey,
  }
}

/**
 * Claims `amount` of an allowance, or refuses.
 *
 * Records the spend up front rather than after the call succeeds: a failed
 * inference still burns the allowance at Cloudflare's end, so charging for it
 * here keeps the meter honest.
 *
 * Without a database there is no meter, and an unmetered AI call is exactly
 * what this module exists to prevent — so it refuses.
 */
export async function spendAiBudget(
  env: TrolleyScoutEnv,
  resource: AiResource,
  amount: number,
  now: Date = new Date(),
): Promise<boolean> {
  if (!Number.isFinite(amount) || amount < 0) return false
  if (!env.DB) return false

  const state = await readAiBudget(env, resource, now)
  if (state.used + amount > state.ceiling) return false

  const windowKey = budgetWindowKey(resource, now)
  await env.DB.prepare(
    `INSERT INTO ai_budget_usage (id, resource, window_key, used, calls, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        used = used + excluded.used,
        calls = calls + 1,
        updated_at = excluded.updated_at`,
  )
    .bind(
      `${resource}:${windowKey}`,
      resource,
      windowKey,
      amount,
      now.toISOString(),
    )
    .run()
  return true
}

/** Hands an over-estimate back when a call turns out to have cost less. */
export async function refundAiBudget(
  env: TrolleyScoutEnv,
  resource: AiResource,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (!env.DB || !Number.isFinite(amount) || amount <= 0) return
  const windowKey = budgetWindowKey(resource, now)
  await env.DB.prepare(
    `UPDATE ai_budget_usage
      SET used = MAX(0, used - ?), updated_at = ?
      WHERE id = ?`,
  )
    .bind(amount, now.toISOString(), `${resource}:${windowKey}`)
    .run()
}

/** Everything the admin console needs to see how close we are to billing. */
export async function readAllAiBudgets(
  env: TrolleyScoutEnv,
  now: Date = new Date(),
): Promise<AiBudgetState[]> {
  const resources = Object.keys(AI_BUDGET) as AiResource[]
  return Promise.all(
    resources.map((resource) => readAiBudget(env, resource, now)),
  )
}
