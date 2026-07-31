import {
  getAdminOverview,
  getMemberSession,
  protectLegacyMemberEmails,
  setAdminCountryCookie,
  setMemberBanned,
  setMemberPropertiesAccess,
  setMemberPlan,
} from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import {
  countOpenSupportMessages,
  countPendingSupportEmailProtection,
  listSupportMessages,
  protectLegacySupportEmails,
  setSupportMessageStatus,
} from '../_shared/supportStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import type { AdminOverview } from '../../src/types'
import type { AdminOverviewFilters } from '../_shared/memberStore'
import { hasEmailProtection } from '../_shared/emailProtection'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

interface AdminActionBody {
  action?: string
  accountId?: string
  banned?: boolean
  granted?: boolean
  planId?: string
  messageId?: string
  reason?: string
  status?: string
  countryCode?: string
}

const ACCOUNT_SORTS = ['joined-newest', 'joined-oldest', 'most-active', 'name'] as const

/** Only a sort we recognise reaches the store; anything else is the default. */
function readAccountSort(value: string | null): AdminOverviewFilters['sort'] {
  return ACCOUNT_SORTS.find((sort) => sort === value) ?? 'joined-newest'
}

// Support messages live in their own store to avoid a circular import between
// memberStore and supportStore, so the console overview is assembled here.
async function buildAdminOverview(
  env: TrolleyScoutEnv,
  filters: AdminOverviewFilters = {},
): Promise<AdminOverview | undefined> {
  const base = await getAdminOverview(env, filters)

  if (!base) {
    return undefined
  }

  const [support, supportOpenCount, pendingSupport] = await Promise.all([
    listSupportMessages(env),
    countOpenSupportMessages(env),
    countPendingSupportEmailProtection(env),
  ])

  return {
    ...base,
    emailProtection: { ...base.emailProtection, pendingSupport },
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
      const overview = await buildAdminOverview(env, { countryCode: body.countryCode })
      return json({ account: result.account, ...(overview ?? {}) }, { headers: privateHeaders })
    }

    if (body.action === 'set_member_banned') {
      if (!body.accountId || typeof body.banned !== 'boolean') {
        return json(
          { message: 'accountId and banned are required.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      // An admin cannot close their own account out from under themselves.
      if (body.accountId === session.account.id) {
        return json(
          { message: 'You cannot ban your own account.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      const result = await setMemberBanned(env, body.accountId, body.banned, body.reason)
      if (!('account' in result) || !result.account) {
        const message =
          'issues' in result && result.issues?.length ? result.issues[0] : 'Could not update the account.'
        return json({ message }, { headers: privateHeaders, status: 400 })
      }
      const overview = await buildAdminOverview(env, { countryCode: body.countryCode })
      return json(
        {
          account: result.account,
          ...(overview ?? {}),
          message: body.banned
            ? `${result.account.displayName} is banned and signed out everywhere.`
            : `${result.account.displayName} can sign in again.`,
        },
        { headers: privateHeaders },
      )
    }

    if (body.action === 'set_test_country') {
      const requestedCode = body.countryCode?.trim().toUpperCase()
      if (!requestedCode) {
        return json(
          { message: 'countryCode is required.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      const overview = await buildAdminOverview(env, { countryCode: requestedCode })
      if (!overview || overview.selectedCountry.code !== requestedCode) {
        return json(
          { message: 'Choose a valid country.' },
          { headers: privateHeaders, status: 400 },
        )
      }
      return json(
        {
          ...overview,
          message: `App test location changed to ${overview.selectedCountry.name}.`,
        },
        {
          headers: {
            ...privateHeaders,
            'set-cookie': setAdminCountryCookie(requestedCode),
          },
        },
      )
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
      const overview = await buildAdminOverview(env, { countryCode: body.countryCode })
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
      const overview = await buildAdminOverview(env, { countryCode: body.countryCode })
      return json({ ...(overview ?? {}) }, { headers: privateHeaders })
    }

    if (body.action === 'protect_legacy_emails') {
      if (!hasEmailProtection(env)) {
        return json(
          { message: 'Email encryption is not configured.' },
          { headers: privateHeaders, status: 503 },
        )
      }
      const [accounts, support] = await Promise.all([
        protectLegacyMemberEmails(env),
        protectLegacySupportEmails(env),
      ])
      const overview = await buildAdminOverview(env, { countryCode: body.countryCode })
      return json(
        {
          ...(overview ?? {}),
          message: `Protected ${accounts.protected + support.protected} email rows.`,
        },
        { headers: privateHeaders },
      )
    }

    return json({ message: 'Unknown admin action.' }, { headers: privateHeaders, status: 400 })
  }

  const params = new URL(request.url).searchParams
  const overview = await buildAdminOverview(env, {
    // Which country's members to list. Absent means everywhere, which is what
    // the console now opens on.
    accountCountryCode: params.get('userCountry') ?? undefined,
    countryCode: params.get('country') ?? session.account.countryCode,
    planId: params.get('plan') ?? undefined,
    query: params.get('q') ?? undefined,
    sort: readAccountSort(params.get('sort')),
  })

  if (!overview) {
    return json(
      { message: 'Admin data is not available.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  return json(overview, { headers: privateHeaders })
}
