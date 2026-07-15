import { hasMemberStore } from '../_shared/memberStore'
import { processPayFastNotification } from '../_shared/payfastNotification'
import { createPayFastBillingRepository } from '../_shared/payfastStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  if (
    !hasMemberStore(env) ||
    !env.PAYFAST_MERCHANT_ID ||
    !env.PAYFAST_PASSPHRASE ||
    (env.PAYFAST_MODE !== 'sandbox' && env.PAYFAST_MODE !== 'live')
  ) {
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

  const result = await processPayFastNotification({
    fields: new URLSearchParams(payload),
    merchantId: env.PAYFAST_MERCHANT_ID,
    mode: env.PAYFAST_MODE,
    passphrase: env.PAYFAST_PASSPHRASE,
    repository: createPayFastBillingRepository(env.DB),
  })

  if (!result.received) {
    console.warn(JSON.stringify({ event: 'payfast_itn_rejected', issue: result.issue }))
  }

  return json(
    result.received
      ? result
      : { message: 'Payment notification was rejected.', received: false },
    {
      headers: privateHeaders,
      status: result.received ? 200 : 400,
    },
  )
}

async function readLimitedRequestText(request: Request, maximumBytes: number) {
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
