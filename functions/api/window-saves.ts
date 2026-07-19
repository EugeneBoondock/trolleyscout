// DB-backed Window Shopping saves: a global save count, a cross-device saved
// list, and auto-removal once a deal leaves the live feed.
import { getMemberSession } from '../_shared/memberStore'
import {
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
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const counts = url.searchParams.get('counts')
    if (counts !== null) {
      const ids = counts.split(',').map((s) => s.trim()).filter(Boolean)
      return json({ counts: await getWindowSaveCounts(env, accountId, ids) }, { headers: privateHeaders })
    }
    return json({ deals: await listWindowSaves(env, accountId) }, { headers: privateHeaders })
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
