// One-off PayFast payments for advertising. The subscription helpers in
// payfastBilling.ts assume a recurring plan (subscription_type, a returned
// token, and a plan upgrade on completion); an ad is a single charge with none
// of those. This module reuses the load-bearing signature primitives from
// payfast.ts but builds a plain once-off checkout and validates its ITN without
// demanding a subscription token.

import {
  createPayFastSignature,
  getPayFastEndpoints,
  type PayFastMode,
  verifyPayFastSignature,
} from './payfast'

type Fetcher = typeof fetch

export interface PayFastAdCheckoutInput {
  account: { displayName: string; email: string; id: string }
  adId: string
  amountCents: number
  itemName: string
  merchantId: string
  merchantKey: string
  notifyUrl: string
  passphrase: string
}

// Builds the signed once-off checkout fields. Field insertion order is
// load-bearing: PayFast's MD5 signature is computed over the parameters in this
// exact order, and `signature` MUST be appended last.
export function createPayFastAdCheckoutFields(input: PayFastAdCheckoutInput): URLSearchParams {
  const fields = new URLSearchParams()
  const names = splitDisplayName(input.account.displayName)
  const amount = formatRand(input.amountCents)

  fields.append('merchant_id', input.merchantId)
  fields.append('merchant_key', input.merchantKey)
  fields.append('notify_url', input.notifyUrl)
  fields.append('name_first', names.firstName)
  if (names.lastName) {
    fields.append('name_last', names.lastName)
  }
  fields.append('email_address', input.account.email)
  fields.append('m_payment_id', input.adId)
  fields.append('amount', amount)
  fields.append('item_name', input.itemName)
  fields.append('item_description', 'Trolley Scout advertising')
  fields.append('custom_str1', input.account.id)
  fields.append('custom_str2', input.adId)
  fields.append('signature', createPayFastSignature(fields, input.passphrase))

  return fields
}

export async function requestPayFastAdOnsitePayment(
  fields: URLSearchParams,
  mode: PayFastMode,
  fetcher: Fetcher = fetch,
): Promise<string | undefined> {
  const response = await fetcher(getPayFastEndpoints(mode).onsiteUrl, {
    body: fields,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  const text = await readLimitedText(response, 16_384)

  if (!response.ok) {
    return undefined
  }

  try {
    const payload = JSON.parse(text) as { uuid?: unknown }
    return typeof payload.uuid === 'string' && payload.uuid ? payload.uuid : undefined
  } catch {
    return undefined
  }
}

async function readLimitedText(response: Response, maximumBytes: number): Promise<string> {
  if (!response.body) {
    return ''
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteCount = 0

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        break
      }

      byteCount += result.value.byteLength
      if (byteCount > maximumBytes) {
        throw new Error('PayFast response exceeded the allowed size.')
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteCount)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(bytes)
}

export interface PayFastAdItnExpectation {
  adId: string
  amountCents: number
  merchantId: string
  passphrase: string
}

export function validatePayFastAdItn(fields: URLSearchParams, expected: PayFastAdItnExpectation) {
  if (!verifyPayFastSignature(fields, expected.passphrase)) {
    return invalidItn('Payment signature is invalid.')
  }

  if (fields.get('merchant_id') !== expected.merchantId) {
    return invalidItn('Payment merchant does not match.')
  }

  if (fields.get('m_payment_id') !== expected.adId) {
    return invalidItn('Payment reference does not match.')
  }

  const amountCents = parseRandAmount(fields.get('amount_gross'))

  if (amountCents !== expected.amountCents) {
    return invalidItn('Payment amount does not match.')
  }

  const paymentId = fields.get('pf_payment_id')?.trim()
  const status = fields.get('payment_status')?.trim()

  if (!paymentId || !status) {
    return invalidItn('Payment notification is incomplete.')
  }

  return {
    amountCents,
    paymentId,
    status,
    valid: true as const,
  }
}

function invalidItn(issue: string) {
  return { issue, valid: false as const }
}

function splitDisplayName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)

  return {
    firstName: parts[0] ?? 'Trolley Scout advertiser',
    lastName: parts.slice(1).join(' '),
  }
}

function formatRand(amountCents: number): string {
  return (amountCents / 100).toFixed(2)
}

function parseRandAmount(value: string | null): number | undefined {
  if (!value || !/^\d+(?:\.\d{2})?$/.test(value)) {
    return undefined
  }

  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}
