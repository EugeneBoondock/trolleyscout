// PayFast ITN for fitting credits. This is the authoritative moment credits
// are granted — the app's "payment done" screen is only UX. Duplicates are
// ignored via the credit-event ledger, so a replayed notification can never
// double-load an account.

import type { TrolleyScoutEnv } from '../_shared/env'
import { hasMemberStore } from '../_shared/memberStore'
import { resolvePayFastConfig } from '../_shared/payfast'
import { validatePayFastAdItn } from '../_shared/payfastAds'
import { confirmPayFastItn } from '../_shared/payfastBilling'
import { json, methodNotAllowed } from '../_shared/respond'
import { findTryOnCreditPack } from '../_shared/tryOnCreditPacks'
import { adjustTryOnCredits } from '../_shared/tryOnQuota'
import { parseCreditPaymentReference } from './try-on-credits'

const privateHeaders = { 'cache-control': 'private, no-store' }

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
  const reference = fields.get('m_payment_id')?.trim() ?? ''
  const parsed = parseCreditPaymentReference(reference)
  const pack = parsed ? findTryOnCreditPack(parsed.packId) : undefined

  if (!parsed || !pack) {
    return json(
      { message: 'Payment reference was not found.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  const validation = validatePayFastAdItn(fields, {
    adId: reference,
    amountCents: pack.amountCents,
    merchantId: payfast.merchantId,
    passphrase: payfast.passphrase ?? '',
  })

  if (!validation.valid) {
    console.warn(JSON.stringify({
      event: 'payfast_credits_itn_rejected',
      issue: validation.issue,
    }))
    return json(
      { message: 'Payment notification was rejected.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  const providerConfirmed = await confirmPayFastItn(fields, payfast.mode)
  if (!providerConfirmed) {
    return json(
      { message: 'PayFast did not validate the notification.', received: false },
      { headers: privateHeaders, status: 400 },
    )
  }

  if (validation.status !== 'COMPLETE') {
    return json(
      { duplicate: false, received: true, updated: false },
      { headers: privateHeaders },
    )
  }

  // The payment id makes the grant idempotent: a replayed ITN finds the event
  // already recorded and adds nothing.
  const eventId = `payfast-credits:${validation.paymentId}`
  const claimed = await claimCreditEvent(env, eventId, parsed.accountId, pack.credits)
  if (!claimed) {
    return json(
      { duplicate: true, received: true, updated: false },
      { headers: privateHeaders },
    )
  }

  await adjustTryOnCredits(
    env,
    parsed.accountId,
    pack.credits,
    `purchase:${pack.id}:${validation.paymentId}`,
  )

  return json(
    { duplicate: false, received: true, updated: true },
    { headers: privateHeaders },
  )
}

async function claimCreditEvent(
  env: TrolleyScoutEnv,
  eventId: string,
  accountId: string,
  credits: number,
): Promise<boolean> {
  if (!env.DB) return false
  try {
    const result = await env.DB.prepare(
      `INSERT INTO try_on_credit_events (id, account_id, amount, reason, actor, created_at)
        VALUES (?, ?, ?, 'payfast-claim', 'payfast', ?)
        ON CONFLICT (id) DO NOTHING`,
    )
      .bind(eventId, accountId, credits, new Date().toISOString())
      .run()
    return (result.meta?.changes ?? 0) > 0
  } catch {
    return false
  }
}

async function readLimitedRequestText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteCount = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
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
