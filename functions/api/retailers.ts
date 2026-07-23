import { getStaticRetailersPayload } from '../../src/api/staticData'
import { filterRetailers } from '../../src/services/sourceEngine'
import { retailerLogoUrl } from '../../src/services/storeLogos'
import type { Retailer, SourceKind } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'
import type { TrolleyScoutEnv } from '../_shared/env'
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
    ? getStaticRetailersPayload()
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

export function addRetailerLogos(retailers: Retailer[]): Retailer[] {
  return retailers.map((retailer) => ({
    ...retailer,
    logoUrl: retailerLogoUrl(retailer),
  }))
}
