import {
  buildGeoapifyNearbyUrl,
  isValidCoordinate,
  locationTileKey,
  mapGeoapifyStores,
  type NearbyStore,
} from '../../src/services/nearbyStores'
import type { DiscoveredDeal, StoreLeaflet } from '../../src/types'
import { readDealSnapshots, readLeafletSnapshot } from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import {
  readCachedStores,
  readStorePromotions,
  writeCachedStores,
  type StorePromotion,
} from '../_shared/locationStore'
import { scoutAreaStores } from '../_shared/areaScout'
import { scoutNearbyStores } from '../_shared/storeScout'
import { json, methodNotAllowed } from '../_shared/respond'

// Public, cookieless data — safe to allow any origin so the mobile app (and
// any future client) can read it cross-origin.
const privateHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

const DEFAULT_RADIUS_M = 4000
const MAX_RADIUS_M = 15000
const MAX_DEALS_PER_STORE = 8

interface StoreResult extends NearbyStore {
  deals: DiscoveredDeal[]
  leaflets: StoreLeaflet[]
  promotions: StorePromotion[]
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  const radius = clampRadius(Number(url.searchParams.get('radius')))

  if (!isValidCoordinate(lat, lon)) {
    return json(
      { message: 'A valid lat and lon are required.', stores: [] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const tileKey = locationTileKey(lat, lon)

  const cached = await readCachedStores(env, tileKey, nowIso)
  let stores = cached
  let servedFrom: 'cache' | 'live' = 'cache'

  if (!stores) {
    stores = await discoverStores(env, lat, lon, radius)
    servedFrom = 'live'

    if (stores.length > 0) {
      waitUntil(writeCachedStores(env, tileKey, stores, nowMs))
    }
  }

  if (stores.length === 0) {
    return json(
      { message: 'No supermarkets found near you yet.', servedFrom, stores: [] },
      { headers: privateHeaders },
    )
  }

  // Attach what we already know: known chains' live deals + valid leaflets, and
  // any promotions previously scouted for these stores (still within date).
  const [snapshots, leafletSnapshot, promotionsByPlace] = await Promise.all([
    readDealSnapshots(env),
    readLeafletSnapshot(env),
    readStorePromotions(env, stores.map((store) => store.placeId), nowIso),
  ])

  const dealsByRetailer = groupDealsByRetailer(snapshots)
  const leafletsByRetailer = groupValidLeafletsByRetailer(leafletSnapshot?.leaflets ?? [], nowIso)

  const results: StoreResult[] = stores.map((store) => ({
    ...store,
    deals: store.retailerId ? (dealsByRetailer.get(store.retailerId) ?? []).slice(0, MAX_DEALS_PER_STORE) : [],
    leaflets: store.retailerId ? leafletsByRetailer.get(store.retailerId) ?? [] : [],
    promotions: promotionsByPlace.get(store.placeId) ?? [],
  }))

  // In the background, scout every store that has nothing to show yet — an
  // independent OR a big chain we have no live feed for — by finding its
  // catalogue on the web. Saved globally so the next visitor gets it instantly.
  const storesNeedingDeals = results
    .filter((store) => store.deals.length === 0 && store.leaflets.length === 0 && store.promotions.length === 0)
    .map(({ deals: _deals, leaflets: _leaflets, promotions: _promotions, ...store }) => store)

  waitUntil(scoutNearbyStores(env, storesNeedingDeals, nowMs))

  // Also sweep the area for stores OSM does not know (independents like
  // Frontline Hyper) via keyless web search — rate-limited to once a day per
  // tile inside the scout, and merged into the tile cache for the next visit.
  waitUntil(scoutAreaStores(env, tileKey, lat, lon, stores, nowMs))

  return json(
    {
      servedFrom,
      stores: results,
      summary: {
        knownChainCount: results.filter((store) => store.retailerId).length,
        storeCount: results.length,
        withDealsCount: results.filter(
          (store) => store.deals.length > 0 || store.leaflets.length > 0 || store.promotions.length > 0,
        ).length,
      },
    },
    { headers: privateHeaders },
  )
}

async function discoverStores(
  env: TrolleyScoutEnv,
  lat: number,
  lon: number,
  radius: number,
): Promise<NearbyStore[]> {
  if (!env.GEOAPIFY_API_KEY) {
    return []
  }

  try {
    const response = await fetch(buildGeoapifyNearbyUrl(lat, lon, radius, env.GEOAPIFY_API_KEY), {
      headers: { accept: 'application/json' },
    })

    if (!response.ok) {
      return []
    }

    return mapGeoapifyStores(await response.json())
  } catch {
    return []
  }
}

function groupDealsByRetailer(
  snapshots: Map<string, { deals: DiscoveredDeal[] }>,
): Map<string, DiscoveredDeal[]> {
  const byRetailer = new Map<string, DiscoveredDeal[]>()

  for (const snapshot of snapshots.values()) {
    for (const deal of snapshot.deals) {
      const list = byRetailer.get(deal.retailerId) ?? []
      list.push(deal)
      byRetailer.set(deal.retailerId, list)
    }
  }

  return byRetailer
}

function groupValidLeafletsByRetailer(
  leaflets: StoreLeaflet[],
  nowIso: string,
): Map<string, StoreLeaflet[]> {
  const today = nowIso.slice(0, 10)
  const byRetailer = new Map<string, StoreLeaflet[]>()

  for (const leaflet of leaflets) {
    // Respect the leaflet's end date — never surface an expired catalogue.
    if (leaflet.validTo && leaflet.validTo.slice(0, 10) < today) {
      continue
    }

    const list = byRetailer.get(leaflet.retailerId) ?? []
    list.push(leaflet)
    byRetailer.set(leaflet.retailerId, list)
  }

  return byRetailer
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RADIUS_M
  }

  return Math.min(value, MAX_RADIUS_M)
}
