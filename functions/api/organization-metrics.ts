import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { readOrganizationMetrics } from '../_shared/organizationPublicationStore'
import { getOrganizationForAccount } from '../_shared/organizationStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method, 'GET')
  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { issues: ['Sign in to view business insights.'] },
      { headers: privateHeaders, status: 401 },
    )
  }
  if (!(await getOrganizationForAccount(env, account.id))) {
    return json(
      { issues: ['An active organization is required.'] },
      { headers: privateHeaders, status: 403 },
    )
  }
  const requestedDays = Number(new URL(request.url).searchParams.get('days'))
  const rangeDays = requestedDays === 7 || requestedDays === 90 ? requestedDays : 30
  return json(
    { metrics: await readOrganizationMetrics(env, account.id, rangeDays) },
    { headers: privateHeaders },
  )
}
