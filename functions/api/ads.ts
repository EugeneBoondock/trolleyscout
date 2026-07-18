// Advertising: members submit ads and see their own; admins review the queue.
// Payment happens separately (see ad-checkout.ts) and only after approval, so an
// advertiser is never charged for an ad an admin has not accepted.

import { adRateCard } from '../../src/services/adPricing'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { listAdsForReview, listMemberAds, reviewAd, submitAd } from '../_shared/adStore'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  const session = await getMemberSession(env, request)
  const account = session.account

  if (!account) {
    return json(
      { ads: [], issues: ['Sign in to manage your ads.'], rateCard: adRateCard },
      { headers: privateHeaders, status: 401 },
    )
  }

  const isAdmin = account.role === 'admin'

  if (request.method === 'GET') {
    const queue = new URL(request.url).searchParams.get('queue')

    if (isAdmin && queue === 'review') {
      return json(
        { ads: await listAdsForReview(env), rateCard: adRateCard },
        { headers: privateHeaders },
      )
    }

    return json(
      { ads: await listMemberAds(env, account.id), rateCard: adRateCard },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'POST') {
    let body: Record<string, unknown>

    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    const result = await submitAd(env, account.id, {
      bodyText: String(body.bodyText ?? ''),
      imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
      placement: String(body.placement ?? 'feed'),
      province: body.province ? String(body.province) : undefined,
      reach: Number(body.reach ?? 0),
      targetUrl: String(body.targetUrl ?? ''),
      title: String(body.title ?? ''),
    })

    if (!result.ad) {
      return json(
        { issues: result.issues ?? ['Your ad could not be submitted.'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    return json(
      { ad: result.ad, ads: await listMemberAds(env, account.id) },
      { headers: privateHeaders },
    )
  }

  if (request.method === 'PATCH') {
    if (!isAdmin) {
      return json({ message: 'Admin access is required.' }, { headers: privateHeaders, status: 403 })
    }

    let body: { id?: string; decision?: string; note?: string }

    try {
      body = (await request.json()) as { id?: string; decision?: string; note?: string }
    } catch {
      return json(
        { issues: ['Request body must be valid JSON.'] },
        { headers: privateHeaders, status: 400 },
      )
    }

    if (!body.id || (body.decision !== 'approved' && body.decision !== 'rejected')) {
      return json(
        { issues: ['Provide an ad id and an approved or rejected decision.'] },
        { headers: privateHeaders, status: 422 },
      )
    }

    const changed = await reviewAd(env, account.id, body.id, body.decision, body.note)

    return json({ ads: await listAdsForReview(env), changed }, { headers: privateHeaders })
  }

  return methodNotAllowed(request.method, 'GET, POST, PATCH')
}
