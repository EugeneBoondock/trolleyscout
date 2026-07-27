import { getStaticRetailersPayload } from '../../src/api/staticData'
import {
  countSources,
  filterRetailers,
  getSourceKinds,
} from '../../src/services/sourceEngine'
import { retailerLogoUrl } from '../../src/services/storeLogos'
import type { Retailer, RetailerGroup, SourceKind, StoreLeaflet } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'
import { readLeafletSnapshot } from '../_shared/dealSnapshotStore'
import { countryFromCode, detectRequestCountry } from '../_shared/countryContext'
import { countryRetailerSummary, getCountryRetailers } from '../_shared/countryRetailerScout'
import { getMemberSession } from '../_shared/memberStore'

const sourceKinds: Array<SourceKind | 'all'> = ['all', 'app', 'loyalty', 'specials', 'store-finder']

const EDGE_CACHE_SECONDS = 300

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  const summaryOnly = url.searchParams.get('summary') === '1'
  const kindParam = url.searchParams.get('kind') ?? 'all'
  const sourceKind = sourceKinds.includes(kindParam as SourceKind | 'all')
    ? (kindParam as SourceKind | 'all')
    : 'all'
  const session = await getMemberSession(env, request)
  const detected = detectRequestCountry(request)

  // A signed-in member's stored country (see accountRowToMember) can differ
  // from the geo-detected one, so their payload is member-specific. Only the
  // anonymous, geo-detected shape is safe to read from or write to the shared
  // edge cache.
  const edgeCache = session.isAuthenticated ? undefined : await openEdgeCache()
  const cacheParams = new URLSearchParams({
    country: detected.code,
    kind: sourceKind,
    q: query.toLowerCase(),
    summary: summaryOnly ? '1' : '0',
  })
  const edgeCacheKey = `https://edge-cache.trolleyscout.co.za/api/retailers?${cacheParams}`
  if (edgeCache) {
    const cached = await edgeCache.match(edgeCacheKey)
    if (cached) {
      return cached
    }
  }

  const country = countryFromCode(session.account?.countryCode ?? detected.code)
  const payload = country.code === 'ZA'
    ? await southAfricanPayload(env)
    : await internationalPayload(env, country)

  return cacheResponse(
    json({
      country,
      retailers: summaryOnly
        ? []
        : addRetailerLogos(filterRetailers(payload.retailers, { query, sourceKind })),
      summary: payload.summary,
    }),
  )

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

async function internationalPayload(
  env: TrolleyScoutEnv,
  country: ReturnType<typeof detectRequestCountry>,
) {
  const retailers = await getCountryRetailers(env, country)
  return { retailers, summary: countryRetailerSummary(retailers) }
}

async function southAfricanPayload(env: TrolleyScoutEnv) {
  const base = getStaticRetailersPayload()
  const snapshot = await readLeafletSnapshot(env)
  const retailers = mergeCatalogueRetailers(
    base.retailers,
    snapshot?.leaflets ?? [],
    'ZA',
  )
  return {
    retailers,
    summary: {
      ...base.summary,
      retailerCount: retailers.length,
      sourceCount: countSources(retailers),
      sourceKinds: getSourceKinds(retailers),
    },
  }
}

export function mergeCatalogueRetailers(
  existing: Retailer[],
  leaflets: StoreLeaflet[],
  countryCode: string,
): Retailer[] {
  const selectedCountry = countryCode.trim().toUpperCase()
  const knownIds = new Set(existing.map((retailer) => retailer.id))
  const knownNames = new Set(existing.map((retailer) => identityKey(retailer.name)))
  const additions = new Map<string, Retailer>()

  for (const leaflet of leaflets) {
    const leafletCountry = (leaflet.countryCode ?? 'ZA').trim().toUpperCase()
    const nameKey = identityKey(leaflet.retailerName)
    if (
      leafletCountry !== selectedCountry ||
      knownIds.has(leaflet.retailerId) ||
      knownNames.has(nameKey) ||
      additions.has(nameKey)
    ) {
      continue
    }

    const group = catalogueRetailerGroup(leaflet.retailerName)
    additions.set(nameKey, {
      accentColor: catalogueGroupAccent(group),
      group,
      id: leaflet.retailerId,
      logoUrl: leaflet.retailerLogoUrl,
      name: leaflet.retailerName,
      program: 'Current catalogues',
      shortName: leaflet.retailerName,
      sourceNote: `Current ${leaflet.retailerName} catalogue directory.`,
      sources: [{
        kind: 'specials',
        label: 'Current catalogues',
        url: leaflet.retailerUrl ?? leaflet.url,
      }],
      verifiedOn: leaflet.capturedAt.slice(0, 10),
    })
  }

  return [
    ...existing,
    ...Array.from(additions.values()).sort((left, right) =>
      left.name.localeCompare(right.name)),
  ]
}

export function addRetailerLogos(retailers: Retailer[]): Retailer[] {
  return retailers.map((retailer) => ({
    ...retailer,
    logoUrl: retailer.logoUrl ?? retailerLogoUrl(retailer),
  }))
}

function catalogueRetailerGroup(name: string): RetailerGroup {
  const normalized = name.toLowerCase()
  if (/cash|carry|wholesale/.test(normalized)) return 'Wholesale'
  if (/pharm|wellness|chemist/.test(normalized)) return 'Pharmacy'
  if (/home|furn|bed|hardware|build|tile|decor|kitchen/.test(normalized)) return 'Homeware'
  if (/fashion|clothing|shoe|sport|apparel/.test(normalized)) return 'Fashion'
  if (/food|market|grocer|save|super|hyper|spar/.test(normalized)) return 'Supermarket'
  return 'General retailer'
}

function catalogueGroupAccent(group: RetailerGroup): string {
  const accents: Record<RetailerGroup, string> = {
    Fashion: '#2f3136',
    'Fresh market': '#247a45',
    'General retailer': '#325f8f',
    Homeware: '#9a5a35',
    Marketplace: '#b54a38',
    Pharmacy: '#32736b',
    'Sports and outdoors': '#2f6d58',
    Supermarket: '#c23b31',
    Wholesale: '#8b5f32',
    'Value grocer': '#b54437',
  }
  return accents[group]
}

function identityKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}
