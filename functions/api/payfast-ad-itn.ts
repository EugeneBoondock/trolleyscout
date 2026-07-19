// PayFast ITN for advertising payments. This is the authoritative record that
// an ad was paid for — the client's "checkout done" signal is only UX. A
// completed, verified notification flips the ad to live; duplicates are ignored
// via the ad_payment_events ledger.

import {
  activatePaidAd,
  claimAdPaymentEvent,
  getAd,
} from '../_shared/adStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { hasMemberStore } from '../_shared/memberStore'
import { resolvePayFastConfig } from '../_shared/payfast'
import { confirmPayFastItn } from '../_shared/payfastBilling'
import { validatePayFastAdItn } from '../_shared/payfastAds'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const payfast = resolvePayFastConfig(env)

  if (!hasMemberStore(env) || !payfast) {
    return json(
      { message: 'Payment notifications are not configured.', received: false },
      { headers: privateHeaders, status: 503 },
    )
  }

  let payload: string

  try {
    payload = await readLimitedRequestText(request, 16_384)
  } catch {
    return json(
      { message: 'Payment notification is too large.', received: false },
      { headers: privateHeaders, status: 413 },
    )
  }

  const fields = new URLSearchParams(payload)
  const adId = fields.get('m_payment_id')?.trim()
  const ad = adId ? await getAd(env, adId) : undefined

  if (!ad) {
    return json(
      { message: 'Payment reference was not found.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  const validation = validatePayFastAdItn(fields, {
    adId: ad.id,
    amountCents: ad.amountCents,
    merchantId: payfast.merchantId,
    passphrase: payfast.passphrase ?? '',
  })

  if (!validation.valid) {
    console.warn(JSON.stringify({ event: 'payfast_ad_itn_rejected', issue: validation.issue }))
    return json(
      { message: 'Payment notification was rejected.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  const providerConfirmed = await confirmPayFastItn(payload, payfast.mode)

  if (!providerConfirmed) {
    return json(
      { message: 'PayFast did not validate the notification.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  const eventId = `payfast-ad:${validation.paymentId}:${validation.status}`
  const claimed = await claimAdPaymentEvent(env, {
    adId: ad.id,
    amountCents: validation.amountCents,
    eventId,
    payloadHash: await hashPayload(payload),
    paymentId: validation.paymentId,
    status: validation.status,
  })

  if (!claimed) {
    return json({ duplicate: true, received: true, updated: false }, { headers: privateHeaders })
  }

  if (validation.status !== 'COMPLETE') {
    return json({ duplicate: false, received: true, updated: false }, { headers: privateHeaders })
  }

  await activatePaidAd(env, ad.id, validation.paymentId)

  return json({ duplicate: false, received: true, updated: true }, { headers: privateHeaders })
}

async function hashPayload(payload: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function readLimitedRequestText(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) {
    return ''
  }

  const reader = request.body.getReader()
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
        throw new Error('Request body exceeded the allowed size.')
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
