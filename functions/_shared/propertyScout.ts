// Network + cache layer for Properties Scout. Resolves a shopper's location
// text to each portal's numeric id, fetches the listing pages, parses them with
// the pure helpers in src/services/propertyPortals, and caches the normalized
// results in D1 (one row per portal/type/location/page). Each portal is fetched
// independently and time-bounded so a slow or blocked site never blocks the
// other or the Worker. Property portals can block Cloudflare datacenter IPs, so
// a failed direct fetch retries through the r.jina.ai reader (HTML mode).

import {
  PROPERTY24_AUTOCOMPLETE_URL,
  PROPERTY_PORTAL_LABELS,
  buildPrivatePropertyUrl,
  buildProperty24Url,
  filterAndSortListings,
  interleaveByPortal,
  parsePrivatePropertyListings,
  parsePrivatePropertyLocations,
  parseProperty24Listings,
  parseProperty24LocationCatalog,
  privatePropertyAutocompleteUrl,
  resolvePrivatePropertyLocation,
  resolveProperty24Location,
  type PropertyFilters,
  type PropertySort,
} from '../../src/services/propertyPortals'
import type {
  PropertyListing,
  PropertyListingType,
  PropertyPortalId,
  PropertyPortalSourceMeta,
  PropertySearchResult,
} from '../../src/types'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 10_000
const MAX_PER_PORTAL = 40
const MAX_BODY_BYTES = 2_500_000
const P24_CATALOG_KEY = '__p24_locations__'
const P24_CATALOG_STALE_MS = 7 * 24 * 60 * 60 * 1000
const SEARCH_STALE_MS = 3 * 60 * 60 * 1000

interface PropertyCacheRow {
  cache_key: string
  payload_json: string
  item_count: number
  fetched_at: string
}

export interface PropertySearchParams {
  query: string
  listingType: PropertyListingType
  page?: number
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  sort?: PropertySort
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function timedFetch(url: string, headers: Record<string, string>): Promise<Response | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

// Fetches page HTML directly, falling back to the jina reader (HTML mode) when
// the portal blocks the request. Returns undefined when both routes fail.
async function fetchListingHtml(url: string, jinaApiKey?: string): Promise<string | undefined> {
  const direct = await timedFetch(url, { 'user-agent': BROWSER_UA, accept: 'text/html' })
  if (direct?.ok) {
    const body = (await direct.text()).slice(0, MAX_BODY_BYTES)
    if (body.length > 0) return body
  }

  const proxied = await timedFetch(`https://r.jina.ai/${url}`, {
    'user-agent': BROWSER_UA,
    accept: 'text/html',
    'x-return-format': 'html',
    ...(jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : {}),
  })
  if (proxied?.ok) {
    const body = (await proxied.text()).slice(0, MAX_BODY_BYTES)
    if (body.length > 0) return body
  }
  return undefined
}

async function fetchJson(
  url: string,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const response = await timedFetch(url, {
    'user-agent': BROWSER_UA,
    accept: 'application/json',
    ...extraHeaders,
  })
  if (!response?.ok) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

// Private Property's autocomplete answers "not authenticated" to a plain server
// request; it only serves locations to an XHR-style call from its own origin.
const PRIVATEPROPERTY_XHR_HEADERS = {
  'x-requested-with': 'XMLHttpRequest',
  referer: 'https://www.privateproperty.co.za/',
}

// ---------------------------------------------------------------------------
// D1 cache
// ---------------------------------------------------------------------------

async function readCache(env: TrolleyScoutEnv, key: string): Promise<PropertyCacheRow | undefined> {
  if (!hasTrolleyScoutDatabase(env)) return undefined
  try {
    const row = await env.DB.prepare(
      'SELECT cache_key, payload_json, item_count, fetched_at FROM property_cache WHERE cache_key = ?',
    )
      .bind(key)
      .first<PropertyCacheRow>()
    return row ?? undefined
  } catch {
    return undefined
  }
}

async function writeCache(env: TrolleyScoutEnv, key: string, payload: unknown, count: number): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) return
  try {
    await env.DB.prepare(
      `INSERT INTO property_cache (cache_key, payload_json, item_count, fetched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (cache_key) DO UPDATE SET
          payload_json = excluded.payload_json,
          item_count = excluded.item_count,
          fetched_at = excluded.fetched_at`,
    )
      .bind(key, JSON.stringify(payload), count, new Date().toISOString())
      .run()
  } catch {
    // A cache write failure must never fail a search.
  }
}

function isFresh(row: PropertyCacheRow | undefined, staleMs: number, now: number): boolean {
  return Boolean(row) && now - Date.parse(row!.fetched_at) < staleMs
}

// ---------------------------------------------------------------------------
// Location resolution
// ---------------------------------------------------------------------------

async function getProperty24Catalog(env: TrolleyScoutEnv) {
  const now = Date.now()
  const cached = await readCache(env, P24_CATALOG_KEY)
  if (isFresh(cached, P24_CATALOG_STALE_MS, now)) {
    try {
      return parseProperty24LocationCatalog(JSON.parse(cached!.payload_json))
    } catch {
      // fall through to a fresh fetch
    }
  }
  const payload = await fetchJson(PROPERTY24_AUTOCOMPLETE_URL)
  const catalog = parseProperty24LocationCatalog(payload)
  if (catalog.length > 0) {
    await writeCache(env, P24_CATALOG_KEY, payload, catalog.length)
    return catalog
  }
  // Serve a stale catalogue rather than nothing if the refresh failed.
  if (cached) {
    try {
      return parseProperty24LocationCatalog(JSON.parse(cached.payload_json))
    } catch {
      return []
    }
  }
  return []
}

// ---------------------------------------------------------------------------
// Per-portal fetch (cached)
// ---------------------------------------------------------------------------

async function fetchPortal(
  env: TrolleyScoutEnv,
  portal: PropertyPortalId,
  listingType: PropertyListingType,
  query: string,
  page: number,
): Promise<{ listings: PropertyListing[]; ok: boolean }> {
  // Resolve the location to a portal id and a listing URL.
  let url: string | undefined
  let locationId: string | undefined

  if (portal === 'property24') {
    const catalog = await getProperty24Catalog(env)
    const loc = resolveProperty24Location(catalog, query)
    if (loc) {
      url = buildProperty24Url(loc, listingType, page)
      locationId = `${loc.id}`
    }
  } else {
    const payload = await fetchJson(
      privatePropertyAutocompleteUrl(query),
      PRIVATEPROPERTY_XHR_HEADERS,
    )
    const loc = resolvePrivatePropertyLocation(parsePrivatePropertyLocations(payload), query)
    if (loc) {
      url = buildPrivatePropertyUrl(loc, listingType, page)
      locationId = `${loc.id}`
    }
  }

  if (!url || !locationId) return { listings: [], ok: false }

  const cacheKey = `${portal}:${listingType}:${locationId}:${page}`
  const now = Date.now()
  const cached = await readCache(env, cacheKey)
  if (isFresh(cached, SEARCH_STALE_MS, now)) {
    try {
      const parsed = JSON.parse(cached!.payload_json) as PropertyListing[]
      if (Array.isArray(parsed)) return { listings: parsed, ok: true }
    } catch {
      // fall through to a fresh fetch
    }
  }

  const html = await fetchListingHtml(url, env.JINA_API_KEY)
  if (!html) {
    // Serve stale data rather than nothing when the refresh fails.
    if (cached) {
      try {
        const parsed = JSON.parse(cached.payload_json) as PropertyListing[]
        if (Array.isArray(parsed)) return { listings: parsed, ok: true }
      } catch {
        // ignore
      }
    }
    return { listings: [], ok: false }
  }

  const listings = (
    portal === 'property24'
      ? parseProperty24Listings(html, listingType)
      : parsePrivatePropertyListings(html, listingType)
  ).slice(0, MAX_PER_PORTAL)

  await writeCache(env, cacheKey, listings, listings.length)
  return { listings, ok: true }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function searchProperties(
  env: TrolleyScoutEnv,
  params: PropertySearchParams,
): Promise<PropertySearchResult> {
  // Bound paging tightly: property hunters rarely go past a few pages, and a
  // low cap limits how far any single account can force fresh upstream fetches
  // (each miss may hit the paid jina fallback) and how many rows accrue in
  // property_cache.
  const page = Math.max(1, Math.min(params.page ?? 1, 5))
  const portals: PropertyPortalId[] = ['property24', 'privateproperty']

  const results = await Promise.allSettled(
    portals.map((portal) => fetchPortal(env, portal, params.listingType, params.query, page)),
  )

  const grouped: PropertyListing[][] = []
  const sources: PropertyPortalSourceMeta[] = []

  results.forEach((result, index) => {
    const portal = portals[index]
    const value = result.status === 'fulfilled' ? result.value : { listings: [], ok: false }
    grouped.push(value.listings)
    sources.push({
      id: portal,
      label: PROPERTY_PORTAL_LABELS[portal],
      count: value.listings.length,
      ok: value.ok,
    })
  })

  const filters: PropertyFilters = {
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    minBeds: params.minBeds,
    sort: params.sort ?? 'relevance',
  }

  const combined =
    filters.sort && filters.sort !== 'relevance'
      ? filterAndSortListings(grouped.flat(), filters)
      : filterAndSortListings(interleaveByPortal(grouped), filters)

  return {
    listings: combined,
    sources,
    listingType: params.listingType,
    page,
    locationText: params.query,
    refreshedAt: new Date().toISOString(),
  }
}
