import { listDealReports, moderateDealReport } from '../../_shared/dealReportStore'
import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import { hasTrustedMutationOrigin, readJsonObjectBody } from '../../_shared/requestGuards'
import { json, methodNotAllowed } from '../../_shared/respond'
import type { DealReportStatus } from '../../../src/types'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return methodNotAllowed(request.method, 'GET, PATCH')
  }
  const session = await getMemberSession(env, request)
  if (session.account?.role !== 'admin') {
    return json({ issues: ['Admin access is required.'] }, { headers: privateHeaders, status: 403 })
  }

  if (request.method === 'GET') {
    const status = new URL(request.url).searchParams.get('status') ?? 'pending'
    const allowed = new Set(['all', 'pending', 'confirmed', 'dismissed', 'resolved'])
    if (!allowed.has(status)) {
      return json({ issues: ['Choose a valid report status.'] }, { headers: privateHeaders, status: 400 })
    }
    return json({ reports: await listDealReports(env, status as DealReportStatus | 'all') }, { headers: privateHeaders })
  }

  if (!hasTrustedMutationOrigin(request)) {
    return json({ issues: ['Request origin is not allowed.'] }, { headers: privateHeaders, status: 403 })
  }
  let body: Record<string, unknown>
  try {
    body = await readJsonObjectBody(request)
  } catch {
    return json({ issues: ['Request body must be valid JSON.'] }, { headers: privateHeaders, status: 400 })
  }
  const result = await moderateDealReport(
    env,
    typeof body.id === 'string' ? body.id : '',
    (typeof body.status === 'string' ? body.status : '') as DealReportStatus,
  )
  return json(
    { ...result, reports: await listDealReports(env, 'pending') },
    { headers: privateHeaders, status: result.issues ? 422 : 200 },
  )
}
