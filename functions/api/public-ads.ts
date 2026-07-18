// The public, cookieless feed of live ads. The apps read this to render the
// clearly-labelled "Sponsored" slot in the deals feed and on Near me. Only paid,
// active, unexpired ads are ever returned, and never any billing or account
// detail. Safe to cache briefly at the edge.

import { isValidAdPlacement, type AdPlacement } from '../../src/services/adPricing'
import type { TrolleyScoutEnv } from '../_shared/env'
import { listLiveAds } from '../_shared/adStore'
import { json, methodNotAllowed } from '../_shared/respond'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=120',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const requested = new URL(request.url).searchParams.get('placement')
  const placement: AdPlacement = isValidAdPlacement(requested) ? requested : 'feed'
  const nowIso = new Date().toISOString()

  const ads = await listLiveAds(env, placement, nowIso)

  return json({ ads, placement }, { headers: publicHeaders })
}
