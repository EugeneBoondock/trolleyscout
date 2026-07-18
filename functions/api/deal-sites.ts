// Public feed of deals from the external deal sites (OneDayOnly, Hyperli,
// Daddy's Deals, MyRunway). Powers the "Scroll" window-shopping reel and can be
// mixed into the deals board. Reads the D1 cache, and when the cache is empty or
// stale it fetches fresh data (inline on a cold cache, in the background
// otherwise) so a shopper never waits on four upstream sites.

import type { TrolleyScoutEnv } from '../_shared/env'
import {
  dealSitesNeedRefresh,
  readDealSiteFeed,
  refreshDealSites,
} from '../_shared/dealSiteScout'
import { json, methodNotAllowed } from '../_shared/respond'

const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=900',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  let feed = await readDealSiteFeed(env)

  // Cold cache: fetch once inline so the first visitor sees deals. A populated
  // but stale cache is served immediately and refreshed in the background.
  if (feed.deals.length === 0) {
    try {
      await refreshDealSites(env)
    } catch {
      // Fall through with whatever (empty) feed we have.
    }
    feed = await readDealSiteFeed(env)
  } else if (await dealSitesNeedRefresh(env, Date.now())) {
    waitUntil(refreshDealSites(env).catch(() => undefined))
  }

  return json(
    { deals: feed.deals, refreshedAt: feed.refreshedAt, sources: feed.sources },
    { headers: publicHeaders },
  )
}
