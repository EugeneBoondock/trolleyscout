// Counts what a member opens, so the admin console can answer "how much is
// this person actually using". Separate from /api/activity, which feeds deal
// personalisation and only records for members who opted into it — an
// operational count must not depend on a personalisation choice.

import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { isUsageMetric, recordMemberUsage } from '../_shared/memberUsageStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../_shared/requestGuards'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'POST') {
    return methodNotAllowed(request.method, 'POST')
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { recorded: false, issues: ['Request origin is not allowed.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    // A signed-out visitor is simply not counted. This is not an error worth
    // showing anyone, so it answers 200 with recorded: false.
    return json({ recorded: false }, { headers: privateHeaders })
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request)
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return json(
      { recorded: false, issues: [tooLarge
        ? 'Request body is too large.'
        : 'Request body must be valid JSON.'] },
      { headers: privateHeaders, status: tooLarge ? 413 : 400 },
    )
  }

  if (!isUsageMetric(body.metric)) {
    return json(
      { recorded: false, issues: ['Choose a valid usage metric.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const amount = typeof body.amount === 'number' && Number.isFinite(body.amount)
    ? body.amount
    : 1

  const recorded = await recordMemberUsage(env, session.account.id, body.metric, amount)
    .catch(() => false)

  return json({ recorded }, { headers: privateHeaders })
}
