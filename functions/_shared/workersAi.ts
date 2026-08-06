import { neuronsFor, refundAiBudget, spendAiBudget } from './aiBudget'
import type { TrolleyScoutEnv } from './env'

/**
 * The one door to Workers AI.
 *
 * Two things happen here that must not be skipped anywhere else:
 *
 * 1. The neuron budget is claimed before the call. The Paid plan includes
 *    10,000 neurons a day and bills every one after that, so an unmetered
 *    `env.AI.run` is a hole in the meter.
 * 2. The call is routed through AI Gateway when one is configured, which is
 *    where caching, retries and the only real per-request cost figures live.
 *    Cloudflare bills the same either way, so there is no reason not to.
 *
 * Returns null when the budget is spent. Every caller already has a path for
 * "no AI available" — that path is now also the path for "not this month".
 */
export async function runMeteredAi<T = unknown>(
  env: TrolleyScoutEnv,
  model: string,
  inputs: Record<string, unknown>,
  options: { now?: Date; skipCache?: boolean } = {},
): Promise<T | null> {
  const ai = env.AI
  if (!ai) return null

  const now = options.now ?? new Date()
  const estimate = neuronsFor(model)
  if (!(await spendAiBudget(env, 'neurons', estimate, now))) return null

  try {
    return (await ai.run(
      model as never,
      inputs as never,
      aiGatewayOptions(env, options.skipCache) as never,
    )) as T
  } catch (error) {
    // A call that never reached Cloudflare cost nothing, so hand the estimate
    // back rather than letting failures eat the day's allowance.
    if (isPreflightFailure(error)) {
      await refundAiBudget(env, 'neurons', estimate, now)
    }
    throw error
  }
}

/**
 * Gateway options for a Workers AI call, or undefined when no gateway is set.
 *
 * The gateway id is configuration, not a secret: it only identifies which of
 * the account's gateways to log through.
 */
export function aiGatewayOptions(
  env: TrolleyScoutEnv,
  skipCache = false,
): { gateway: { id: string; skipCache: boolean } } | undefined {
  const id = env.AI_GATEWAY_ID?.trim()
  if (!id) return undefined
  return { gateway: { id, skipCache } }
}

/**
 * Base URL for talking to OpenAI through the account's gateway.
 *
 * Returns undefined when the gateway is not configured, so the caller keeps
 * using OpenAI directly rather than failing.
 */
export function openAiGatewayBaseUrl(env: TrolleyScoutEnv): string | undefined {
  const gateway = env.AI_GATEWAY_ID?.trim()
  const account = env.CF_ACCOUNT_ID?.trim()
  if (!gateway || !account) return undefined
  return `https://gateway.ai.cloudflare.com/v1/${account}/${gateway}/openai`
}

/** A failure that happened before Cloudflare could have charged for it. */
function isPreflightFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /network|fetch failed|timeout|abort/i.test(message)
}
