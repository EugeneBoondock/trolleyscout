import { getAdminOverview, getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)

  // The role is read from the account row server-side — never from the client.
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  const overview = await getAdminOverview(env)

  if (!overview) {
    return json(
      { message: 'Admin data is not available.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  return json(overview, { headers: privateHeaders })
}
