import {
  buildGeoapifyNearbyUrl,
  isValidCoordinate,
  locationTileKey,
  mapGeoapifyStores,
  type NearbyStore,
} from '../../src/services/nearbyStores'
import { nearbyStoreLogoUrl } from '../../src/services/storeLogos'
import type { DiscoveredDeal, StoreLeaflet } from '../../src/types'
import { readDealSnapshots, readLeafletSnapshot } from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import {
  listActiveDealItemsBatch,
  type DealItemScopeFilter,
  type StoredDealItem,
} from '../_shared/dealItemStore'
import {
  readCachedStores,
  readStorePromotions,
  writeCachedStores,
  writeDiscoveredStores,
  type StorePromotion,
} from '../_shared/locationStore'
import { scoutAreaStores } from '../_shared/areaScout'
import { scoutNearbyStores } from '../_shared/storeScout'
import { json, methodNotAllowed } from '../_shared/respond'
import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import { getMemberSession } from '../_shared/memberStore'

// Public, cookieless data — safe to allow any origin so the mobile app (and
// any future client) can read it cross-origin.
const privateHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

const DEFAULT_RADIUS_M = 4000
const MAX_RADIUS_M = 15000
const MAX_DEALS_PER_STORE = 8
const NEARBY_CACHE_VERSION = 'v2'

interface StoreResult extends NearbyStore {
  deals: DiscoveredDeal[]
  leaflets: StoreLeaflet[]
  promotions: StorePromotion[]
}

interface NearbyStoreBackgroundDependencies {
  scoutNearbyStores: typeof scoutNearbyStores
  writeCachedStores: typeof writeCachedStores
  writeDiscoveredStores: typeof writeDiscoveredStores
}

const nearbyStoreBackgroundDependencies: NearbyStoreBackgroundDependencies = {
  scoutNearbyStores,
  writeCachedStores,
  writeDiscoveredStores,
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method, 'GET')
  }

  const url = new URL(request.url)
  const lat = Number(url.searchParams.get('lat'))
  const lon = Number(url.searchParams.get('lon'))
  const radius = clampRadius(Number(url.searchParams.get('radius')))
  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)
  const requestedCountryCode = url.searchParams.get('country')?.trim() || undefined
  const country = countryFromCode(
    requestedCountryCode ?? session.account?.countryCode ?? detected.code,
  )
  const isSouthAfrica = country.code === 'ZA'

  if (!isValidCoordinate(lat, lon)) {
    return json(
      { message: 'A valid lat and lon are required.', stores: [] },
      { headers: privateHeaders, status: 400 },
    )
  }

  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const tileKey = `${NEARBY_CACHE_VERSION}:${country.code}:${locationTileKey(lat, lon)}`

  const cached = await readCachedStores(env, tileKey, nowIso)
  let stores = cached
  let servedFrom: 'cache' | 'live' = 'cache'

  if (!stores) {
    stores = await discoverStores(env, lat, lon, radius, country.code, country.name)
    servedFrom = 'live'
  }

  if (stores.length === 0) {
    return json(
      { message: 'No supermarkets found near you yet.', servedFrom, stores: [] },
      { headers: privateHeaders },
    )
  }

  // Attach what we already know: known chains' live deals + valid leaflets, and
  // any promotions previously scouted for these stores (still within date).
  const [snapshots, leafletSnapshot, promotionsByPlace, normalizedItems] = await Promise.all([
    isSouthAfrica ? readDealSnapshots(env) : Promise.resolve(new Map()),
    isSouthAfrica ? readLeafletSnapshot(env) : Promise.resolve(undefined),
    readStorePromotions(env, stores.map((store) => store.placeId), nowIso, country.code),
    isSouthAfrica ? readNormalizedItemsForRetailers(env, stores, nowIso) : Promise.resolve([]),
  ])

  const dealsByRetailer = groupDealsByRetailer(snapshots)
  const leafletsByRetailer = groupValidLeafletsByRetailer(leafletSnapshot?.leaflets ?? [], nowIso)

  const results: StoreResult[] = stores.map((store) => {
    const normalizedDeals = selectNormalizedDealsForStore(
      normalizedItemsForStore(normalizedItems, store),
      store,
    ).map((item) => normalizedItemToDiscoveredDeal(item, store.name))
    const snapshotDeals = store.retailerId ? dealsByRetailer.get(store.retailerId) ?? [] : []

    return {
      ...store,
      deals: mergeNearMeDeals(normalizedDeals, snapshotDeals).slice(0, MAX_DEALS_PER_STORE),
      leaflets: store.retailerId
        ? selectLeafletsForStore(leafletsByRetailer.get(store.retailerId) ?? [], store)
        : [],
      promotions: promotionsByPlace.get(store.placeId) ?? [],
      logoUrl: nearbyStoreLogoUrl(store),
    }
  })

  // Queue every discovered branch. The scout's due-date check and run limit
  // control cost, while national chain data never blocks a branch catalogue.
  const storesToScout = selectStoresForAutomaticScouting(results)

  waitUntil(persistAndScoutNearbyStores(
    env,
    stores,
    storesToScout,
    nowMs,
    tileKey,
    servedFrom,
  ))

  // Also sweep the area for stores OSM does not know (independents like
  // Frontline Hyper) via keyless web search, rate-limited to once a day per
  // tile inside the scout, and merged into the tile cache for the next visit.
  waitUntil(scoutAreaStores(env, tileKey, lat, lon, stores, nowMs))

  return json(
    {
      country,
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

export function selectStoresForAutomaticScouting(
  stores: Array<NearbyStore & {
    deals?: unknown
    leaflets?: unknown
    promotions?: unknown
  }>,
): NearbyStore[] {
  // The scout only reaches a few stores per request, so stores that still
  // have nothing to show must go first — otherwise already-populated chains
  // keep consuming the budget and empty independents never get scouted.
  const needsDeals = (store: {
    deals?: unknown
    leaflets?: unknown
    promotions?: unknown
  }) =>
    emptyList(store.deals) && emptyList(store.leaflets) && emptyList(store.promotions)

  return [...stores]
    .sort((left, right) => Number(needsDeals(right)) - Number(needsDeals(left)))
    .map(({
      deals: _deals,
      leaflets: _leaflets,
      promotions: _promotions,
      ...store
    }) => store)
}

function emptyList(value: unknown): boolean {
  return !Array.isArray(value) || value.length === 0
}

export async function persistAndScoutNearbyStores(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
  storesNeedingDeals: NearbyStore[],
  nowMs: number,
  tileKey: string,
  servedFrom: 'cache' | 'live',
  dependencies: NearbyStoreBackgroundDependencies = nearbyStoreBackgroundDependencies,
): Promise<void> {
  if (servedFrom === 'live') {
    await dependencies.writeCachedStores(env, tileKey, stores, nowMs)
  }
  const stored = await dependencies.writeDiscoveredStores(env, stores, nowMs, tileKey)
  if (!stored) {
    return
  }
  await dependencies.scoutNearbyStores(env, storesNeedingDeals, nowMs)
}

async function discoverStores(
  env: TrolleyScoutEnv,
  lat: number,
  lon: number,
  radius: number,
  countryCode = 'ZA',
  countryName = 'South Africa',
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

    return mapGeoapifyStores(await response.json(), 40, countryCode, countryName)
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

async function readNormalizedItemsForRetailers(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
  now: string,
): Promise<StoredDealItem[]> {
  // One db.batch() round trip for every retailer × scope filter — this used to
  // be 20+ discrete D1 statements per nearby search.
  let pages: StoredDealItem[][] = []
  try {
    pages = await listActiveDealItemsBatch(
      env,
      buildNearMeDealQueries(stores).map((query) => ({
        limit: 200,
        now,
        ...(query.retailerId ? { retailerIds: [query.retailerId] } : {}),
        scope: query.scope,
      })),
    )
  } catch {
    // The older snapshot lane remains available during migration rollout.
    pages = []
  }

  return [...new Map(pages.flat().map((item) => [item.id, item])).values()]
}

export function buildNearMeDealQueries(stores: NearbyStore[]): Array<{
  retailerId?: string
  scope: DealItemScopeFilter
}> {
  const storesByRetailer = new Map<string, NearbyStore[]>()
  const queries: Array<{ retailerId?: string; scope: DealItemScopeFilter }> = []
  for (const store of stores) {
    if (!store.retailerId) {
      queries.push({ scope: { storeIds: [store.placeId], type: 'store' } })
      continue
    }
    const group = storesByRetailer.get(store.retailerId) ?? []
    group.push(store)
    storesByRetailer.set(store.retailerId, group)
  }

  for (const [retailerId, retailerStores] of storesByRetailer) {
    const seenStoreIds = new Set<string>()
    const seenProvinces = new Set<string>()

    for (const store of retailerStores) {
      if (!seenStoreIds.has(store.placeId)) {
        seenStoreIds.add(store.placeId)
        queries.push({
          retailerId,
          scope: { storeIds: [store.placeId], type: 'store' },
        })
      }
      const province = provinceIdFromAddress(store.address)
      if (province && !seenProvinces.has(province)) {
        seenProvinces.add(province)
        queries.push({
          retailerId,
          scope: { regionIds: provinceRegionIds(province), type: 'province' },
        })
      }
    }

    queries.push({ retailerId, scope: { type: 'national' } })
    // Structured feeds (Woolworths, Dis-Chem, Clicks...) publish online-scoped
    // deals; surface them on the chain's nearby branches too.
    queries.push({ retailerId, scope: { type: 'online' } })
  }
  return queries
}

export function normalizedItemsForStore(
  items: StoredDealItem[],
  store: NearbyStore,
): StoredDealItem[] {
  if (store.retailerId) {
    return items.filter((item) => item.retailerId === store.retailerId)
  }
  return items.filter((item) =>
    item.scope.type === 'store' && item.scope.storeIds.includes(store.placeId),
  )
}

export function selectNormalizedDealsForStore(
  items: StoredDealItem[],
  store: NearbyStore,
  limit = MAX_DEALS_PER_STORE,
): StoredDealItem[] {
  const selected = new Map<string, { item: StoredDealItem; priority: number }>()

  for (const item of items) {
    const priority = scopePriorityForStore(item, store)
    if (!Number.isFinite(priority)) {
      continue
    }
    const key = item.productId || item.id
    const current = selected.get(key)
    if (
      !current ||
      priority < current.priority ||
      (priority === current.priority && item.capturedAt > current.item.capturedAt)
    ) {
      selected.set(key, { item, priority })
    }
  }

  return [...selected.values()]
    .sort((left, right) =>
      left.priority - right.priority ||
      left.item.title.localeCompare(right.item.title) ||
      left.item.id.localeCompare(right.item.id),
    )
    .map(({ item }) => item)
    .slice(0, Math.max(0, Math.floor(limit)))
}

function scopePriorityForStore(item: StoredDealItem, store: NearbyStore): number {
  const scope = item.scope
  if ('excludedStoreIds' in scope && scope.excludedStoreIds?.includes(store.placeId)) {
    return Number.POSITIVE_INFINITY
  }
  if (scope.type === 'store') {
    return scope.storeIds.includes(store.placeId) ? 0 : Number.POSITIVE_INFINITY
  }
  if (scope.type === 'province') {
    const province = provinceIdFromAddress(store.address)
    return province && scope.regionIds.some((regionId) => normalizeRegionId(regionId) === province)
      ? 1
      : Number.POSITIVE_INFINITY
  }
  if (scope.type === 'national') {
    return 2
  }
  // Online/delivery-wide deals (Woolworths, Dis-Chem, Clicks structured feeds)
  // apply to every branch of the chain — lowest priority, below a real
  // branch/province/national special, but still surfaced.
  if (scope.type === 'online') {
    return 3
  }
  return Number.POSITIVE_INFINITY
}

function provinceIdFromAddress(address: string | undefined): string | undefined {
  if (!address) {
    return undefined
  }
  const normalized = normalizeRegionId(address)
  return [
    'eastern-cape',
    'free-state',
    'gauteng',
    'kwazulu-natal',
    'limpopo',
    'mpumalanga',
    'north-west',
    'northern-cape',
    'western-cape',
  ].find((province) => normalized.includes(province))
}

function normalizeRegionId(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function provinceRegionIds(province: string): string[] {
  const names: Record<string, string[]> = {
    'eastern-cape': ['eastern-cape', 'Eastern Cape'],
    'free-state': ['free-state', 'Free State'],
    gauteng: ['gauteng', 'Gauteng'],
    'kwazulu-natal': ['kwazulu-natal', 'KwaZulu-Natal', 'KwaZulu Natal'],
    limpopo: ['limpopo', 'Limpopo'],
    mpumalanga: ['mpumalanga', 'Mpumalanga'],
    'north-west': ['north-west', 'North West'],
    'northern-cape': ['northern-cape', 'Northern Cape'],
    'western-cape': ['western-cape', 'Western Cape'],
  }
  return names[province] ?? [province]
}

function normalizedItemToDiscoveredDeal(
  item: StoredDealItem,
  retailerName: string,
): DiscoveredDeal {
  return {
    capturedAt: item.capturedAt,
    evidenceText: item.evidenceText,
    expiresAt: item.expiresAt,
    id: item.id,
    imageUrl: item.imageUrl,
    previousPriceText:
      item.previousPriceCents !== undefined && item.previousPriceCents > item.priceCents
        ? centsToRand(item.previousPriceCents)
        : undefined,
    priceScope: item.scope,
    priceText: centsToRand(item.priceCents),
    productId: item.productId,
    productUrl: item.productUrl,
    promotionId: item.promotionId,
    retailerId: item.retailerId,
    retailerName,
    savingText: item.savingText,
    sourceLabel: 'Official retailer feed',
    sourceUrl: item.sourceUrl,
    title: item.title,
    validFrom: item.validFrom,
    validTo: item.validTo,
  }
}

function mergeNearMeDeals(...groups: DiscoveredDeal[][]): DiscoveredDeal[] {
  const seen = new Set<string>()
  return groups.flat().filter((deal) => {
    const key = deal.productId
      ? `${deal.retailerId}::${deal.productId}`
      : `${deal.retailerId}::${deal.productUrl}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function centsToRand(value: number): string {
  const amount = value / 100
  return `R${Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2)}`
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

export function selectLeafletsForStore(
  leaflets: StoreLeaflet[],
  store: NearbyStore,
): StoreLeaflet[] {
  return leaflets.filter((leaflet) => {
    const scope = leaflet.priceScope
    if (!scope) {
      return true
    }
    if ('excludedStoreIds' in scope && scope.excludedStoreIds?.includes(store.placeId)) {
      return false
    }
    if (scope.type === 'store') {
      return scope.storeIds.includes(store.placeId)
    }
    if (scope.type === 'province') {
      const province = provinceIdFromAddress(store.address)
      return Boolean(province && scope.regionIds.some(
        (regionId) => normalizeRegionId(regionId) === province,
      ))
    }
    return scope.type === 'national'
  })
}

function clampRadius(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_RADIUS_M
  }

  return Math.min(value, MAX_RADIUS_M)
}
