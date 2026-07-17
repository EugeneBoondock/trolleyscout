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

// Public, cookieless data — same cross-origin policy as /api/nearby-stores.
const publicHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=300',
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

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const nowIso = new Date().toISOString()
  const [{ stores, tileCount }, promotionCounts, promotions] = await Promise.all([
    readAllDiscoveredStores(env, nowIso),
    readPromotionCountsByPlace(env, nowIso),
    readAllStorePromotions(env, nowIso),
  ])

  const enriched = attachPromotionDetails(stores, promotionCounts, promotions)

  return json(
    {
      stores: enriched,
      summary: {
        areaCount: tileCount,
        knownChainCount: enriched.filter((store) => store.retailerId).length,
        storeCount: enriched.length,
        withPromotionsCount: enriched.filter((store) => store.hasPromotions).length,
      },
    },
    { headers: publicHeaders },
  )
}
