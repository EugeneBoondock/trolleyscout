import type { TrolleyScoutEnv } from './env'

/**
 * Checks a Turnstile challenge server-side.
 *
 * Free on every plan, and the places that need it are the ones a bot can
 * currently hit for free: sign-up and the self-serve advert form, where a
 * script can otherwise create accounts or queue adverts in bulk.
 *
 * Absent configuration means absent protection, not a closed door: a
 * deployment without keys keeps working exactly as it does today. That is a
 * deliberate choice — locking every shopper out because a secret is missing
 * would be a worse failure than the one being prevented.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = 'passed' | 'failed' | 'not-configured'

export async function verifyTurnstile(
  env: TrolleyScoutEnv,
  token: string | undefined,
  options: { remoteIp?: string; fetcher?: typeof fetch } = {},
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) return 'not-configured'

  const response = (token ?? '').trim()
  if (!response) return 'failed'

  const body = new FormData()
  body.append('secret', secret)
  body.append('response', response)
  if (options.remoteIp) body.append('remoteip', options.remoteIp)

  try {
    const result = await (options.fetcher ?? fetch)(VERIFY_URL, {
      body,
      method: 'POST',
    })
    if (!result.ok) return 'failed'
    const payload = (await result.json()) as { success?: unknown }
    return payload?.success === true ? 'passed' : 'failed'
  } catch {
    // Cloudflare being unreachable must not take sign-up down with it.
    return 'not-configured'
  }
}

/** True when the request may proceed. */
export function turnstileAllows(result: TurnstileResult): boolean {
  return result !== 'failed'
}

/** The client IP Cloudflare puts on every request reaching a Worker. */
export function callerIp(request: Request): string | undefined {
  return request.headers.get('cf-connecting-ip') ?? undefined
}
