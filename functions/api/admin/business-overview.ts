import {
  loadBusinessAdminOverview,
  setBusinessAdminStatus,
} from '../../_shared/businessAdminStore'
import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import {
  hasTrustedMutationOrigin,
  optionalBodyText,
  readJsonObjectBody,
} from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, PATCH')
  }

  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (request.method === 'GET') {
    return json(
      { overview: await loadBusinessAdminOverview(env) },
      { headers: privateHeaders },
    )
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json(
      { message: 'Request origin is not allowed.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request)
  } catch (error) {
    const tooLarge = error instanceof RangeError
    return json(
      { issues: [tooLarge ? 'Request body is too large.' : 'Request body must be valid JSON.'] },
      { headers: privateHeaders, status: tooLarge ? 413 : 400 },
    )
  }

  const businessId = optionalBodyText(body.businessId)?.trim() ?? ''
  const status = optionalBodyText(body.status)
  if (status !== 'active' && status !== 'suspended') {
    return json(
      { issues: ['Choose an active or suspended business status.'] },
      { headers: privateHeaders, status: 422 },
    )
  }

  const result = await setBusinessAdminStatus(env, businessId, status)
  const overview = await loadBusinessAdminOverview(env)
  if (result.issues?.length) {
    return json(
      { changed: false, issues: result.issues, overview },
      { headers: privateHeaders, status: 422 },
    )
  }

  return json(
    { changed: result.changed, overview },
    { headers: privateHeaders },
  )
}
