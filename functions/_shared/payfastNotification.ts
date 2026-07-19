import type { BillingCycle } from '../../src/types'
import { confirmPayFastItn, validatePayFastItn } from './payfastBilling'
import type { PayFastMode } from './payfast'

export interface PayFastBillingAttempt {
  accountId: string
  amountCents: number
  billingCycle: BillingCycle
  id: string
  planId: 'scout' | 'household'
}

export interface PayFastBillingRepository {
  claimEvent(input: {
    amountCents: number
    attemptId: string
    eventId: string
    payloadHash: string
    paymentId: string
    status: string
  }): Promise<boolean>
  completeSubscription(input: {
    accountId: string
    attemptId: string
    billingCycle: BillingCycle
    paymentId: string
    planId: 'scout' | 'household'
    token: string
  }): Promise<void>
  findAttempt(attemptId: string): Promise<PayFastBillingAttempt | undefined>
  markAttempt(attemptId: string, status: string): Promise<void>
}

export async function processPayFastNotification(options: {
  fetcher?: typeof fetch
  fields: URLSearchParams
  merchantId: string
  mode: PayFastMode
  passphrase: string
  payload: string
  repository: PayFastBillingRepository
}) {
  const attemptId = options.fields.get('m_payment_id')?.trim()

  if (!attemptId) {
    return rejected('Payment reference is missing.')
  }

  const attempt = await options.repository.findAttempt(attemptId)

  if (!attempt) {
    return rejected('Payment reference was not found.')
  }

  const validation = validatePayFastItn(options.fields, {
    amountCents: attempt.amountCents,
    attemptId: attempt.id,
    merchantId: options.merchantId,
    passphrase: options.passphrase,
  })

  if (!validation.valid) {
    return rejected(validation.issue)
  }

  const providerConfirmed = await confirmPayFastItn(options.payload, options.mode, options.fetcher)

  if (!providerConfirmed) {
    return rejected('PayFast did not validate the notification.')
  }

  const eventId = `payfast:${validation.paymentId}:${validation.status}`
  const claimed = await options.repository.claimEvent({
    amountCents: validation.amountCents,
    attemptId: attempt.id,
    eventId,
    payloadHash: await hashPayload(options.fields.toString()),
    paymentId: validation.paymentId,
    status: validation.status,
  })

  if (!claimed) {
    return {
      duplicate: true,
      received: true as const,
      updated: false,
    }
  }

  if (validation.status !== 'COMPLETE' || !validation.token) {
    await options.repository.markAttempt(attempt.id, validation.status.toLowerCase())
    return {
      duplicate: false,
      received: true as const,
      updated: false,
    }
  }

  await options.repository.completeSubscription({
    accountId: attempt.accountId,
    attemptId: attempt.id,
    billingCycle: attempt.billingCycle,
    paymentId: validation.paymentId,
    planId: attempt.planId,
    token: validation.token,
  })

  return {
    duplicate: false,
    received: true as const,
    updated: true,
  }
}

function rejected(issue: string) {
  return {
    issue,
    received: false as const,
  }
}

async function hashPayload(payload: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
