// Comments on Window Shopping deals. Tied to the deal id, so they vanish with
// the deal (pruned from the live feed).
import { getMemberSession } from '../_shared/memberStore'
import { addDealComment, listDealComments } from '../_shared/windowSocialStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

const privateHeaders = { 'cache-control': 'private, no-store' }

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (!['GET', 'POST'].includes(request.method)) {
    return methodNotAllowed(request.method, 'GET, POST')
  }

  const url = new URL(request.url)

  // Reading comments is open to any signed-in member; writing requires an account.
  const session = await getMemberSession(env, request)

  if (request.method === 'GET') {
    const dealId = url.searchParams.get('dealId') ?? ''
    if (!dealId) {
      return json({ error: 'dealId is required.' }, { headers: privateHeaders, status: 400 })
    }
    return json({ comments: await listDealComments(env, dealId) }, { headers: privateHeaders })
  }

  if (!session.account) {
    return json({ error: 'Sign in to comment.' }, { headers: privateHeaders, status: 401 })
  }

  let body: { dealId?: string; body?: string }
  try {
    body = (await request.json()) as { dealId?: string; body?: string }
  } catch {
    return json({ error: 'Body must be valid JSON.' }, { headers: privateHeaders, status: 400 })
  }
  const dealId = String(body.dealId ?? '')
  const text = String(body.body ?? '').trim()
  if (!dealId || text.length === 0) {
    return json({ error: 'A comment and dealId are required.' }, { headers: privateHeaders, status: 400 })
  }
  const comment = await addDealComment(env, session.account.id, session.account.displayName, dealId, text)
  if (!comment) {
    return json({ error: 'Could not post the comment.' }, { headers: privateHeaders, status: 500 })
  }
  return json({ comment }, { headers: privateHeaders })
}
