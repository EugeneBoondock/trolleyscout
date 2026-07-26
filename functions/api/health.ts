import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { readSourceHealth } from '../_shared/sourceHealth'
import type { TrolleyScoutEnv } from '../_shared/env'

// This used to answer `ok: true` unconditionally, which made it a liveness
// check and nothing more — it went on saying ok while Checkers served none of
// its 88 live deals for days. It now answers for the data too, so an uptime
// monitor pointed here goes red when a feed dies rather than only when the
// Worker does. A dead feed is the failure that actually costs a shopper
// something.
//
// Anonymous callers get the shape of the problem — how many shops, how bad —
// because that is all a monitor needs. Which shop, and how far it fell, is
// operational detail and waits for an administrator.

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const base = { service: 'trolley-scout', version: '0.1.0' }
  const unmeasured = { checked: 0, state: 'unmeasured' as const }

  if (!env.DB) {
    return json({ ...base, ok: true, sources: unmeasured })
  }

  let report
  try {
    report = await readSourceHealth(env)
  } catch {
    // A health check that cannot read its own history must not claim the
    // service is broken — but it must not claim it is fine either.
    return json(
      { ...base, ok: true, sources: unmeasured },
      { headers: { 'cache-control': 'no-store' } },
    )
  }

  const session = await getMemberSession(env, request)
  const isAdmin = session.account?.role === 'admin'

  return json(
    {
      ...base,
      ok: report.healthy,
      sources: {
        // Broken out per level so a monitor can page on collapses alone and
        // leave the slower-burning ones to a human in the morning.
        alerting: report.alerts.length,
        checked: report.checkedRetailerCount,
        collapsed: report.alerts.filter((alert) => alert.level === 'collapsed').length,
        failing: report.alerts.filter((alert) => alert.level === 'failing').length,
        state: report.healthy ? 'healthy' : 'degraded',
        ...(isAdmin ? { alerts: report.alerts } : {}),
      },
    },
    {
      // Never cached: a stale health check is worse than none, because it
      // reports a problem as fixed or a fix as still broken.
      headers: { 'cache-control': 'no-store' },
      status: report.healthy ? 200 : 503,
    },
  )
}
