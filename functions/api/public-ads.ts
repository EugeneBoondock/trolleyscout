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

const EDGE_CACHE_SECONDS = 120

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const requested = new URL(request.url).searchParams.get('placement')
  const placement: AdPlacement = isValidAdPlacement(requested) ? requested : 'feed'

  // The live-ads feed never varies by session — no member data goes in or
  // out — so every visitor for a placement can share one edge copy.
  const edgeCache = await openEdgeCache()
  const edgeCacheKey = `https://edge-cache.trolleyscout.co.za/api/public-ads?placement=${placement}`
  if (edgeCache) {
    const cached = await edgeCache.match(edgeCacheKey)
    if (cached) {
      return cached
    }
  }

  const nowIso = new Date().toISOString()
  const ads = await listLiveAds(env, placement, nowIso)

  return cacheResponse(json({ ads, placement }, { headers: publicHeaders }))

  function cacheResponse(value: Response) {
    if (!edgeCache) return value
    const publicResponse = new Response(value.body, value)
    publicResponse.headers.set('cache-control', `public, max-age=60, s-maxage=${EDGE_CACHE_SECONDS}`)
    waitUntil(edgeCache.put(edgeCacheKey, publicResponse.clone()).catch(() => undefined))
    return publicResponse
  }
}

// The Cache API is absent in unit tests and some local runtimes — treat it
// as an optional accelerator, never a requirement.
async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default
  } catch {
    return undefined
  }
}
