import {
  clampAnalyticsDays,
  getCloudflareTraffic,
  getMemberAnalytics,
} from '../../_shared/adminAnalytics'
import { getMemberSession } from '../../_shared/memberStore'
import { json, methodNotAllowed } from '../../_shared/respond'
import type { TrolleyScoutEnv } from '../../_shared/env'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

// Kept off /api/admin so the console's first paint is not held up by a call
// out to Cloudflare. The analytics tab loads this on its own.
export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const session = await getMemberSession(env, request)

  if (session.account?.role !== 'admin') {
    return json({ message: 'Admin access is required.' }, { headers: privateHeaders, status: 403 })
  }

  const url = new URL(request.url)
  const windowDays = clampAnalyticsDays(url.searchParams.get('days'))
  const countryCode = (url.searchParams.get('country') ?? session.account.countryCode)
    .trim()
    .toUpperCase()

  // Cloudflare is a network call to someone else's API: it must never be able
  // to take the whole tab down with it, so its failures come back as a report
  // that says so.
  const [members, traffic] = await Promise.all([
    getMemberAnalytics(env, countryCode, windowDays),
    getCloudflareTraffic(env, windowDays).catch(() => ({
      configured: true,
      days: [],
      issue: 'Cloudflare analytics could not be reached.',
    })),
  ])

  if (!members) {
    return json(
      { message: 'Analytics are not available.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  return json({ members, traffic, windowDays }, { headers: privateHeaders })
}
