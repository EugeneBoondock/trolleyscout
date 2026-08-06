// How much of each included Cloudflare AI allowance this account has spent.
//
// The Workers Paid plan includes a fixed amount of Workers AI, Browser
// Rendering and Vectorize and bills everything past it. This is the gauge for
// that: it reads the same meter the app checks before every AI call, so the
// number here is the number the app is enforcing.

import { AI_BUDGET, readAllAiBudgets, type AiResource } from '../../_shared/aiBudget'
import type { TrolleyScoutEnv } from '../../_shared/env'
import { getMemberSession } from '../../_shared/memberStore'
import { json, methodNotAllowed } from '../../_shared/respond'

const privateHeaders = { 'cache-control': 'private, no-store' }

/// Flag a resource before it runs out, not once it has.
const WARN_AT = 0.8

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({
  env,
  request,
}) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method, 'GET')

  const session = await getMemberSession(env, request)
  if (!session.isAuthenticated || session.account?.role !== 'admin') {
    return json(
      { error: 'Admins only.' },
      { headers: privateHeaders, status: 403 },
    )
  }
  if (!env.DB) {
    return json(
      { error: 'The usage meter is unavailable.' },
      { headers: privateHeaders, status: 503 },
    )
  }

  const budgets = await readAllAiBudgets(env)
  const resources = budgets.map((budget) => {
    const usedFraction = budget.ceiling > 0 ? budget.used / budget.ceiling : 0
    return {
      calls: budget.calls,
      // What the app will actually allow, which is below what Cloudflare
      // includes — the gap is deliberate headroom.
      ceiling: budget.ceiling,
      included: budget.included,
      label: AI_BUDGET[budget.resource as AiResource].label,
      remaining: budget.remaining,
      resource: budget.resource,
      exhausted: budget.remaining <= 0,
      usedFraction: Number(usedFraction.toFixed(4)),
      used: budget.used,
      warning: usedFraction >= WARN_AT,
      window: AI_BUDGET[budget.resource as AiResource].window,
      windowKey: budget.windowKey,
    }
  })

  return json(
    {
      data: {
        // True when something has stopped working to avoid a bill, which is
        // the one thing worth alerting on.
        anyExhausted: resources.some((resource) => resource.exhausted),
        anyWarning: resources.some((resource) => resource.warning),
        resources,
      },
    },
    { headers: privateHeaders },
  )
}
