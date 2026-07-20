import { md5 } from '@noble/hashes/legacy.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { PayFastMode } from './payfast'

// PayFast keeps a subscription running until it is explicitly cancelled. When a
// member moves between plans or billing cycles they authorise a brand new
// subscription, so the one it replaces has to be cancelled or the member is
// charged twice. This wraps the PayFast subscriptions API used for that.
//
// Auth is header-based rather than body-signed: merchant-id, version and
// timestamp are sent as headers, and the signature is an MD5 of those values
// plus the passphrase, ordered alphabetically by key.
const API_HOST = 'https://api.payfast.co.za'
const API_VERSION = 'v1'

type Fetcher = typeof fetch

export interface PayFastSubscriptionCredentials {
  merchantId: string
  mode: PayFastMode
  passphrase?: string
}

export async function cancelPayFastSubscription(
  token: string,
  credentials: PayFastSubscriptionCredentials,
  options: { fetcher?: Fetcher; now?: Date } = {},
): Promise<{ cancelled: boolean; issue?: string }> {
  const trimmed = token.trim()

  if (!trimmed) {
    return { cancelled: false, issue: 'Subscription token is missing.' }
  }

  const fetcher = options.fetcher ?? fetch
  const timestamp = formatPayFastTimestamp(options.now ?? new Date())
  const headers: Record<string, string> = {
    'merchant-id': credentials.merchantId,
    timestamp,
    version: API_VERSION,
  }

  // The sandbox shares the live API host and is selected with ?testing=true.
  const url = `${API_HOST}/subscriptions/${encodeURIComponent(trimmed)}/cancel${
    credentials.mode === 'live' ? '' : '?testing=true'
  }`

  let response: Response

  try {
    response = await fetcher(url, {
      headers: {
        ...headers,
        signature: createPayFastApiSignature(headers, credentials.passphrase),
      },
      method: 'PUT',
    })
  } catch (error: unknown) {
    return {
      cancelled: false,
      issue: error instanceof Error ? error.message : 'PayFast was unreachable.',
    }
  }

  if (!response.ok) {
    return { cancelled: false, issue: `PayFast returned ${response.status}.` }
  }

  return { cancelled: true }
}

// Moves an existing subscription onto a new recurring amount, which is how a
// scheduled downgrade lands without making the member re-authorise anything.
// The new amount applies from the next billing run, so the period they already
// paid for is untouched. Keeping the same token also keeps the payment history
// on one subscription rather than scattering it across cancelled ones.
export async function adjustPayFastSubscription(
  token: string,
  input: { amountCents: number },
  credentials: PayFastSubscriptionCredentials,
  options: { fetcher?: Fetcher; now?: Date } = {},
): Promise<{ adjusted: boolean; issue?: string }> {
  const trimmed = token.trim()

  if (!trimmed) {
    return { adjusted: false, issue: 'Subscription token is missing.' }
  }

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { adjusted: false, issue: 'Subscription amount is invalid.' }
  }

  const fetcher = options.fetcher ?? fetch
  const timestamp = formatPayFastTimestamp(options.now ?? new Date())
  const headers: Record<string, string> = {
    'merchant-id': credentials.merchantId,
    timestamp,
    version: API_VERSION,
  }
  // PayFast takes the recurring amount in cents on this endpoint, unlike the
  // checkout fields, which are in rand.
  const body: Record<string, string> = { amount: String(input.amountCents) }
  const url = `${API_HOST}/subscriptions/${encodeURIComponent(trimmed)}/adjust${
    credentials.mode === 'live' ? '' : '?testing=true'
  }`

  let response: Response

  try {
    response = await fetcher(url, {
      body: new URLSearchParams(body),
      headers: {
        ...headers,
        'content-type': 'application/x-www-form-urlencoded',
        // Body parameters are signed alongside the headers, so an amount
        // tampered with in transit fails verification at PayFast.
        signature: createPayFastApiSignature({ ...headers, ...body }, credentials.passphrase),
      },
      method: 'PATCH',
    })
  } catch (error: unknown) {
    return {
      adjusted: false,
      issue: error instanceof Error ? error.message : 'PayFast was unreachable.',
    }
  }

  if (!response.ok) {
    return { adjusted: false, issue: `PayFast returned ${response.status}.` }
  }

  return { adjusted: true }
}

// The signature covers every header parameter plus the passphrase, sorted by
// key. Values use the same encoding as the checkout signature so a passphrase
// containing spaces or punctuation hashes identically on both sides.
export function createPayFastApiSignature(
  headers: Record<string, string>,
  passphrase?: string,
) {
  const parameters: Record<string, string> = { ...headers }

  if (passphrase) {
    parameters.passphrase = passphrase
  }

  const parameterString = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${encodePayFastApiValue(parameters[key])}`)
    .join('&')

  return bytesToHex(md5(new TextEncoder().encode(parameterString)))
}

// PayFast expects ISO 8601 with a timezone offset rather than a trailing Z.
// South African merchant accounts run on SAST (+02:00), which has no daylight
// saving, so the offset is constant.
export function formatPayFastTimestamp(now: Date) {
  const sast = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return `${sast.toISOString().replace(/\.\d{3}Z$/, '')}+02:00`
}

function encodePayFastApiValue(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+')
}
