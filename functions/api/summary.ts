import { buildStoredSummary } from '../_shared/offerStore'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'

// One aggregate for every visitor — cache it at the edge instead of paying a
// D1 sweep per app open.
const EDGE_CACHE_SECONDS = 300
const EDGE_CACHE_KEY = 'https://edge-cache.trolleyscout.co.za/api/summary'

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const edgeCache = await openEdgeCache()
  if (edgeCache) {
    const cached = await edgeCache.match(EDGE_CACHE_KEY)
    if (cached) {
      return cached
    }
  }

  const response = json(await buildStoredSummary(env))
  if (!edgeCache) {
    return response
  }
  const publicResponse = new Response(response.body, response)
  publicResponse.headers.set(
    'cache-control',
    `public, max-age=60, s-maxage=${EDGE_CACHE_SECONDS}`,
  )
  waitUntil(edgeCache.put(EDGE_CACHE_KEY, publicResponse.clone()).catch(() => undefined))
  return publicResponse
}

// The Cache API is absent in unit tests and some local runtimes — treat it as
// an optional accelerator, never a requirement.
async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default
  } catch {
    return undefined
  }
}
