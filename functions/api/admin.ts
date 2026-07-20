import {
  getAdminOverview,
  getMemberSession,
  setMemberPropertiesAccess,
  setMemberPlan,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  countOpenSupportMessages,
  listSupportMessages,
  setSupportMessageStatus,
} from '../_shared/supportStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import type { AdminOverview } from '../../src/types'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

interface AdminActionBody {
  action?: string
  accountId?: string
  granted?: boolean
  planId?: string
  messageId?: string
  status?: string
}

// Support messages live in their own store to avoid a circular import between
// memberStore and supportStore, so the console overview is assembled here.
async function buildAdminOverview(env: TrolleyScoutEnv): Promise<AdminOverview | undefined> {
  const base = await getAdminOverview(env)

  if (!base) {
    return undefined
  }

  const [support, supportOpenCount] = await Promise.all([
    listSupportMessages(env),
    countOpenSupportMessages(env),
  ])

  return {
    ...base,
    support,
    summary: { ...base.summary, supportOpenCount },
  }
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  const session = await getMemberSession(env, request)

  // The role is read from the account row server-side — never from the client.
  if (session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  if (request.method === 'POST') {
    let body: AdminActionBody
    try {
      body = (await request.json()) as AdminActionBody
    } catch {
      return json({ message: 'Request body must be valid JSON.' }, { headers: privateHeaders, status: 400 })
    }

    if (body.action === 'set_properties_access') {
      if (!body.accountId || typeof body.granted !== 'boolean') {
        return json(
          { message: 'accountId and granted are required.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      const result = await setMemberPropertiesAccess(env, body.accountId, body.granted)
      if (!('account' in result) || !result.account) {
        const message =
          'issues' in result && result.issues?.length
            ? result.issues[0]
            : 'Could not update access.'
        return json({ message }, { headers: privateHeaders, status: 400 })
      }
      const overview = await buildAdminOverview(env)
      return json({ account: result.account, ...(overview ?? {}) }, { headers: privateHeaders })
    }

    if (body.action === 'set_member_plan') {
      if (!body.accountId || !body.planId) {
        return json(
          { message: 'accountId and planId are required.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      const result = await setMemberPlan(env, body.accountId, body.planId)
      if (!('account' in result) || !result.account) {
        const message =
          'issues' in result && result.issues?.length
            ? result.issues[0]
            : 'Could not update plan.'
        return json({ message }, { headers: privateHeaders, status: 400 })
      }
      const overview = await buildAdminOverview(env)
      return json({ account: result.account, ...(overview ?? {}) }, { headers: privateHeaders })
    }

    if (body.action === 'set_support_status') {
      if (!body.messageId || (body.status !== 'open' && body.status !== 'resolved')) {
        return json(
          { message: 'messageId and a status of open or resolved are required.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      const result = await setSupportMessageStatus(env, body.messageId, body.status)
      if ('issues' in result) {
        return json({ message: result.issues[0] }, { headers: privateHeaders, status: 400 })
      }
      const overview = await buildAdminOverview(env)
      return json({ ...(overview ?? {}) }, { headers: privateHeaders })
    }

    return json({ message: 'Unknown admin action.' }, { headers: privateHeaders, status: 400 })
  }

  const overview = await buildAdminOverview(env)

  if (!overview) {
    return json(
      { message: 'Admin data is not available.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  return json(overview, { headers: privateHeaders })
}
