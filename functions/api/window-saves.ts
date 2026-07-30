// DB-backed Window Shopping saves: a global save count, a cross-device saved
// list, and auto-removal once a deal leaves the live feed.
import { getMemberSession } from '../_shared/memberStore'
import {
  getMemberPlan,
  limitVisibleDealsForPlan,
} from '../../src/data/memberPlans'
import {
  getDealCommentCounts,
  getWindowSaveCounts,
  listWindowSaves,
  saveWindowDeal,
  unsaveWindowDeal,
} from '../_shared/windowSocialStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    return methodNotAllowed(request.method, 'GET, POST, DELETE')
  }

  const session = await getMemberSession(env, request)
  if (!session.account) {
    return json({ error: 'Sign in to save deals.' }, { headers: privateHeaders, status: 401 })
  }
  const accountId = session.account.id
  const planId = session.account.role === 'admin'
    ? 'organization'
    : session.account.planId
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const counts = url.searchParams.get('counts')
    if (counts !== null) {
      const ids = counts.split(',').map((s) => s.trim()).filter(Boolean)
      // Comment totals ride along with the save counts, so a card can show how
      // busy a deal's conversation is before anyone opens it.
      const [saveCounts, commentCounts] = await Promise.all([
        getWindowSaveCounts(env, accountId, ids),
        getDealCommentCounts(env, ids),
      ])
      return json(
        { commentCounts, counts: saveCounts },
        { headers: privateHeaders },
      )
    }
    const savedDeals = await listWindowSaves(env, accountId)
    const dealLimit = getMemberPlan(planId).limits.visibleDeals
    return json(
      {
        access: {
          availableDealCount: savedDeals.length,
          dealLimit,
          planId,
        },
        deals: limitVisibleDealsForPlan(savedDeals, planId),
      },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'DELETE') {
    const dealId = url.searchParams.get('dealId') ?? ''
    if (!dealId) {
      return json({ error: 'dealId is required.' }, { headers: privateHeaders, status: 400 })
    }
    return json(await unsaveWindowDeal(env, accountId, dealId), { headers: privateHeaders })
  }

  let body: { deal?: Record<string, unknown> }
  try {
    body = (await request.json()) as { deal?: Record<string, unknown> }
  } catch {
    return json({ error: 'Body must be valid JSON.' }, { headers: privateHeaders, status: 400 })
  }
  if (!body.deal || typeof body.deal !== 'object' || !body.deal.id) {
    return json({ error: 'A deal with an id is required.' }, { headers: privateHeaders, status: 400 })
  }
  return json(await saveWindowDeal(env, accountId, body.deal), { headers: privateHeaders })
}
