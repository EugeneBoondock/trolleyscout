// Public directory of every store the platform has discovered through the
// Near-me scouts, across all shoppers. This is what turns individual location
// searches into a shared national store database.

import { nearbyStoreLogoUrl } from '../../src/services/storeLogos'
import type { TrolleyScoutEnv } from '../_shared/env'
import {
  readAllDiscoveredStores,
  readAllStorePromotions,
  readPromotionCountsByPlace,
  type DiscoveredStore,
  type StorePromotion,
} from '../_shared/locationStore'
import { json, methodNotAllowed } from '../_shared/respond'
import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import { getMemberSession } from '../_shared/memberStore'

// Public, cookieless data — same cross-origin policy as /api/nearby-stores.
const privateHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

const MAX_PROMOTIONS_PER_STORE = 24

export function attachPromotionDetails(
  stores: DiscoveredStore[],
  promotionCounts: Map<string, number>,
  promotions: StorePromotion[],
) {
  const promotionsByPlace = new Map<string, StorePromotion[]>()

  for (const promotion of promotions) {
    const storePromotions = promotionsByPlace.get(promotion.placeId) ?? []
    storePromotions.push(promotion)
    promotionsByPlace.set(promotion.placeId, storePromotions)
  }

  return stores.map((store) => {
    const promotionCount = promotionCounts.get(store.placeId) ?? 0

    return {
      ...store,
      deals: [],
      hasPromotions: promotionCount > 0,
      leaflets: [],
      logoUrl: nearbyStoreLogoUrl(store),
      promotionCount,
      promotions: prioritizePromotionDetails(promotionsByPlace.get(store.placeId) ?? []),
    }
  })
}

function prioritizePromotionDetails(promotions: StorePromotion[]): StorePromotion[] {
  return [...promotions]
    .sort((left, right) => Number(right.kind === 'catalogue') - Number(left.kind === 'catalogue'))
    .slice(0, MAX_PROMOTIONS_PER_STORE)
}

const EDGE_CACHE_SECONDS = 300

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const nowIso = new Date().toISOString()
  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)
  const country = countryFromCode(session.account?.countryCode ?? detected.code)

  // The directory is identical for every visitor in a country — one edge
  // copy per country instead of three D1 sweeps per request.
  const edgeCache = session.account ? undefined : await openEdgeCache()
  const edgeCacheKey =
    `https://edge-cache.trolleyscout.co.za/api/discovered-stores?country=${country.code}`
  if (edgeCache) {
    const cached = await edgeCache.match(edgeCacheKey)
    if (cached) {
      return cached
    }
  }

  const [{ stores, tileCount }, promotionCounts, promotions] = await Promise.all([
    readAllDiscoveredStores(env, nowIso, 2000, country.code),
    readPromotionCountsByPlace(env, nowIso, country.code),
    readAllStorePromotions(env, nowIso, 3000, country.code),
  ])

  const enriched = attachPromotionDetails(stores, promotionCounts, promotions)

  const response = json(
    {
      country,
      stores: enriched,
      summary: {
        areaCount: tileCount,
        knownChainCount: enriched.filter((store) => store.retailerId).length,
        storeCount: enriched.length,
        withPromotionsCount: enriched.filter((store) => store.hasPromotions).length,
      },
    },
    { headers: privateHeaders },
  )

  if (edgeCache) {
    const publicResponse = new Response(response.body, response)
    publicResponse.headers.set(
      'cache-control',
      `public, max-age=60, s-maxage=${EDGE_CACHE_SECONDS}`,
    )
    waitUntil(edgeCache.put(edgeCacheKey, publicResponse.clone()).catch(() => undefined))
    return publicResponse
  }

  return response
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
