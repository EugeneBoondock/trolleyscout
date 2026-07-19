import { readDealAlertSummary } from '../_shared/dealAlertStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { getNotificationPreferences } from '../_shared/notificationStore'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

const emptyState = {
  countCapped: false,
  enabled: false,
  latestCursor: 0,
  totalNewDealCount: 0,
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)
  const account = session.account
  if (!account) {
    return json(
      { ...emptyState, issues: ['Sign in to check deal alerts.'] },
      { headers: privateHeaders, status: 401 },
    )
  }

  const preferences = await getNotificationPreferences(env, account.id)
  if (!preferences.newDeals) {
    return json(
      { ...emptyState, issues: ['Turn on new-deal alerts before checking for notifications.'] },
      { headers: privateHeaders, status: 403 },
    )
  }

  const after = parseAfterCursor(new URL(request.url).searchParams.get('after'))
  if (after === null) {
    return json(
      { ...emptyState, enabled: true, issues: ['after must be a non-negative safe integer.'] },
      { headers: privateHeaders, status: 400 },
    )
  }

  try {
    const summary = await readDealAlertSummary(env, after)
    return json(
      { ...summary, enabled: true },
      { headers: privateHeaders },
    )
  } catch {
    return json(
      { ...emptyState, enabled: true, issues: ['Deal alerts are unavailable right now.'] },
      { headers: privateHeaders, status: 503 },
    )
  }
}

function parseAfterCursor(value: string | null): number | undefined | null {
  if (value === null) return undefined
  if (!/^(0|[1-9]\d{0,15})$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}
