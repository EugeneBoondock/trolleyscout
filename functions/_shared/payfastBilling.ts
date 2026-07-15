import type { BillingCycle, MemberPlanId } from '../../src/types'
import {
  createPayFastParameterString,
  createPayFastSignature,
  getPayFastEndpoints,
  type PayFastMode,
  verifyPayFastSignature,
} from './payfast'

interface PayFastBillingOption {
  amountCents: number
  billingCycle: BillingCycle
  frequency: number
  itemName: string
  planId: MemberPlanId
}

interface PayFastItnExpectation {
  amountCents: number
  attemptId: string
  merchantId: string
  passphrase: string
}

type Fetcher = typeof fetch

export function createPayFastCheckoutFields(options: {
  account: {
    displayName: string
    email: string
    id: string
  }
  attemptId: string
  merchantId: string
  merchantKey: string
  notifyUrl: string
  option: PayFastBillingOption
  passphrase: string
}) {
  const fields = new URLSearchParams()
  const names = splitDisplayName(options.account.displayName)
  const amount = formatRand(options.option.amountCents)

  fields.append('merchant_id', options.merchantId)
  fields.append('merchant_key', options.merchantKey)
  fields.append('notify_url', options.notifyUrl)
  fields.append('name_first', names.firstName)
  if (names.lastName) {
    fields.append('name_last', names.lastName)
  }
  fields.append('email_address', options.account.email)
  fields.append('m_payment_id', options.attemptId)
  fields.append('amount', amount)
  fields.append('item_name', options.option.itemName)
  fields.append('item_description', `${options.option.billingCycle} Trolley Scout subscription`)
  fields.append('custom_str1', options.account.id)
  fields.append('custom_str2', options.option.planId)
  fields.append('custom_str3', options.option.billingCycle)
  fields.append('subscription_type', '1')
  fields.append('recurring_amount', amount)
  fields.append('frequency', String(options.option.frequency))
  fields.append('cycles', '0')
  fields.append('signature', createPayFastSignature(fields, options.passphrase))

  return fields
}

export async function requestPayFastOnsitePayment(
  fields: URLSearchParams,
  mode: PayFastMode,
  fetcher: Fetcher = fetch,
) {
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

export function validatePayFastItn(fields: URLSearchParams, expected: PayFastItnExpectation) {
  if (!verifyPayFastSignature(fields, expected.passphrase)) {
    return invalidItn('Payment signature is invalid.')
  }

  if (fields.get('merchant_id') !== expected.merchantId) {
    return invalidItn('Payment merchant does not match.')
  }

  if (fields.get('m_payment_id') !== expected.attemptId) {
    return invalidItn('Payment reference does not match.')
  }

  const amountCents = parseRandAmount(fields.get('amount_gross'))

  if (amountCents !== expected.amountCents) {
    return invalidItn('Payment amount does not match.')
  }

  const paymentId = fields.get('pf_payment_id')?.trim()
  const status = fields.get('payment_status')?.trim()
  const token = fields.get('token')?.trim()

  if (!paymentId || !status) {
    return invalidItn('Payment notification is incomplete.')
  }

  if (status === 'COMPLETE' && !token) {
    return invalidItn('Subscription token is missing.')
  }

  return {
    amountCents,
    paymentId,
    status,
    token: token || undefined,
    valid: true as const,
  }
}

export async function confirmPayFastItn(
  fields: URLSearchParams,
  mode: PayFastMode,
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(getPayFastEndpoints(mode).validationUrl, {
    body: createPayFastParameterString(fields),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  const text = await readLimitedText(response, 64)

  return response.ok && text.trim() === 'VALID'
}

function invalidItn(issue: string) {
  return {
    issue,
    valid: false as const,
  }
}

function splitDisplayName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)

  return {
    firstName: parts[0] ?? 'Trolley Scout member',
    lastName: parts.slice(1).join(' '),
  }
}

function formatRand(amountCents: number) {
  return (amountCents / 100).toFixed(2)
}

function parseRandAmount(value: string | null) {
  if (!value || !/^\d+(?:\.\d{2})?$/.test(value)) {
    return undefined
  }

  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined
}

async function readLimitedText(response: Response, maximumBytes: number) {
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
