import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { recordScoutRetrievalFeedback } from '../_shared/scoutRetrievalLog'

const privateHeaders = { 'cache-control': 'private, no-store' }
const MAX_BODY_BYTES = 2_048

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json(
      { error: 'Log in to rate Mr Scout.' },
      { headers: privateHeaders, status: 401 },
    )
  }

  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(
      { error: 'Feedback body is too large.' },
      { headers: privateHeaders, status: 413 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(
      { error: 'Request body must be valid JSON.' },
      { headers: privateHeaders, status: 400 },
    )
  }

  const record = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {}
  const retrievalId = typeof record.retrievalId === 'string' ? record.retrievalId.trim() : ''
  const feedback = record.feedback

  if (!retrievalId || retrievalId.length > 100) {
    return json(
      { error: 'A retrieval ID is required.' },
      { headers: privateHeaders, status: 400 },
    )
  }
  if (feedback !== 'down' && feedback !== 'up') {
    return json(
      { error: 'Feedback must be "up" or "down".' },
      { headers: privateHeaders, status: 422 },
    )
  }

  const recorded = await recordScoutRetrievalFeedback(env, retrievalId, feedback)
  return json({ recorded }, { headers: privateHeaders, status: recorded ? 200 : 404 })
}
