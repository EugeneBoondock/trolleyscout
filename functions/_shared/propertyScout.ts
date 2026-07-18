// Network + cache layer for Properties Scout.
//
// The SA property portals (Property24, Private Property) serve listings as
// server-rendered HTML and block Cloudflare datacenter IPs (a bot challenge
// comes back as HTTP 200 with no listings). So we:
//   1. Resolve the shopper's text / "near me" coordinates to each portal's
//      numeric location id WITHOUT calling their bot-blocked autocompletes — via
//      a baked-in catalogue (saPropertyLocations), falling back to the full
//      Property24 catalogue fetched through the r.jina.ai reader and cached.
//   2. Fetch each listing page directly first, and whenever that yields zero
//      listings (blocked / challenged) refetch through the reader proxy, which
//      requests from its own network and returns the real HTML.
// Results are cached per portal/type/location/page in D1.

import {
  PROPERTY24_AUTOCOMPLETE_URL,
  PROPERTY_PORTAL_LABELS,
  buildPrivatePropertyUrl,
  buildProperty24Url,
  filterAndSortListings,
  interleaveByPortal,
  parsePrivatePropertyListings,
  parseProperty24Listings,
  parseProperty24LocationCatalog,
  resolveProperty24Location,
  type PropertyFilters,
  type PropertySort,
} from '../../src/services/propertyPortals'
import {
  nearestSaLocation,
  resolveSaLocation,
  toPrivatePropertyLocation,
  toProperty24Location,
  type SaPropertyLocation,
} from '../../src/services/saPropertyLocations'
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

const FETCH_TIMEOUT_MS = 12_000
const MAX_PER_PORTAL = 40
const MAX_BODY_BYTES = 2_800_000
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
  lat?: number
  lon?: number
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

async function timedFetch(
  url: string,
  headers: Record<string, string>,
): Promise<Response | undefined> {
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

async function fetchDirect(url: string): Promise<string | undefined> {
  const response = await timedFetch(url, { 'user-agent': BROWSER_UA, accept: 'text/html' })
  if (!response?.ok) return undefined
  const body = (await response.text()).slice(0, MAX_BODY_BYTES)
  return body.length > 0 ? body : undefined
}

// The r.jina.ai reader fetches from its own network (not Cloudflare's), so it
// slips past the portals' datacenter-IP blocks. `x-return-format: html` returns
// the raw HTML our parsers expect.
async function fetchViaReader(
  url: string,
  jinaApiKey: string | undefined,
  format: 'html' | 'text',
): Promise<string | undefined> {
  const response = await timedFetch(`https://r.jina.ai/${url}`, {
    'user-agent': BROWSER_UA,
    accept: 'text/html',
    'x-return-format': format,
    ...(jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : {}),
  })
  if (!response?.ok) return undefined
  const body = (await response.text()).slice(0, MAX_BODY_BYTES)
  return body.length > 0 ? body : undefined
}

function parseListings(
  portal: PropertyPortalId,
  html: string,
  listingType: PropertyListingType,
): PropertyListing[] {
  return portal === 'property24'
    ? parseProperty24Listings(html, listingType)
    : parsePrivatePropertyListings(html, listingType)
}

// Fetch a listing page and parse it. Direct first (fast when it works); if that
// returns nothing — either a real empty page or, more often, a bot challenge —
// retry through the reader proxy and keep whichever gives more listings.
async function fetchAndParse(
  env: TrolleyScoutEnv,
  portal: PropertyPortalId,
  url: string,
  listingType: PropertyListingType,
): Promise<PropertyListing[]> {
  const direct = await fetchDirect(url)
  let listings = direct ? parseListings(portal, direct, listingType) : []
  if (listings.length === 0) {
    const proxied = await fetchViaReader(url, env.JINA_API_KEY, 'html')
    if (proxied) {
      const proxiedListings = parseListings(portal, proxied, listingType)
      if (proxiedListings.length > listings.length) listings = proxiedListings
    }
  }
  return listings.slice(0, MAX_PER_PORTAL)
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

async function writeCache(
  env: TrolleyScoutEnv,
  key: string,
  payload: unknown,
  count: number,
): Promise<void> {
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
// Property24 full-catalogue fallback (for suburbs not in the static catalogue)
// ---------------------------------------------------------------------------

async function getProperty24Catalog(env: TrolleyScoutEnv) {
  const now = Date.now()
  const cached = await readCache(env, P24_CATALOG_KEY)
  if (isFresh(cached, P24_CATALOG_STALE_MS, now)) {
    try {
      return parseProperty24LocationCatalog(JSON.parse(cached!.payload_json))
    } catch {
      // fall through
    }
  }
  // Direct then reader (the catalogue endpoint is behind the same bot rules).
  let text = await fetchDirect(PROPERTY24_AUTOCOMPLETE_URL)
  let payload = safeJson(text)
  if (!payload) {
    text = await fetchViaReader(PROPERTY24_AUTOCOMPLETE_URL, env.JINA_API_KEY, 'text')
    payload = safeJson(text)
  }
  const catalog = payload ? parseProperty24LocationCatalog(payload) : []
  if (catalog.length > 0) {
    await writeCache(env, P24_CATALOG_KEY, payload, catalog.length)
    return catalog
  }
  if (cached) {
    try {
      return parseProperty24LocationCatalog(JSON.parse(cached.payload_json))
    } catch {
      return []
    }
  }
  return []
}

function safeJson(text: string | undefined): unknown {
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Per-portal fetch (cached)
// ---------------------------------------------------------------------------

async function fetchPortalListings(
  env: TrolleyScoutEnv,
  portal: PropertyPortalId,
  url: string,
  locId: string,
  listingType: PropertyListingType,
  page: number,
): Promise<{ listings: PropertyListing[]; ok: boolean }> {
  const cacheKey = `${portal}:${listingType}:${locId}:${page}`
  const cached = await readCache(env, cacheKey)
  if (isFresh(cached, SEARCH_STALE_MS, Date.now())) {
    const parsed = safeJson(cached!.payload_json)
    if (Array.isArray(parsed)) return { listings: parsed as PropertyListing[], ok: true }
  }

  const listings = await fetchAndParse(env, portal, url, listingType)
  if (listings.length > 0) {
    await writeCache(env, cacheKey, listings, listings.length)
    return { listings, ok: true }
  }
  // Nothing fresh: serve stale rather than blank if we have it.
  if (cached) {
    const parsed = safeJson(cached.payload_json)
    if (Array.isArray(parsed)) return { listings: parsed as PropertyListing[], ok: true }
  }
  return { listings: [], ok: false }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function searchProperties(
  env: TrolleyScoutEnv,
  params: PropertySearchParams,
): Promise<PropertySearchResult> {
  const page = Math.max(1, Math.min(params.page ?? 1, 5))

  // Resolve the location. "Near me" uses coordinates -> nearest catalogue city;
  // otherwise resolve the text against the static catalogue.
  const nearMe = params.lat !== undefined && params.lon !== undefined
  const staticLoc: SaPropertyLocation | undefined = nearMe
    ? nearestSaLocation(params.lat!, params.lon!)
    : resolveSaLocation(params.query)

  // Property24 target: static entry, else the full catalogue (covers any suburb).
  let p24Url: string | undefined
  let p24Id: string | undefined
  const p24Static = staticLoc ? toProperty24Location(staticLoc) : undefined
  if (p24Static) {
    p24Url = buildProperty24Url(p24Static, params.listingType, page)
    p24Id = `${p24Static.id}`
  } else if (!nearMe && params.query.trim().length >= 2) {
    const catalog = await getProperty24Catalog(env)
    const match = resolveProperty24Location(catalog, params.query)
    if (match) {
      p24Url = buildProperty24Url(match, params.listingType, page)
      p24Id = `${match.id}`
    }
  }

  // Private Property target: static catalogue only.
  let ppUrl: string | undefined
  let ppId: string | undefined
  const ppStatic = staticLoc ? toPrivatePropertyLocation(staticLoc) : undefined
  if (ppStatic) {
    ppUrl = buildPrivatePropertyUrl(ppStatic, params.listingType, page)
    ppId = `${ppStatic.id}`
  }

  const jobs: Array<Promise<{ portal: PropertyPortalId; listings: PropertyListing[]; ok: boolean }>> =
    []
  if (p24Url && p24Id) {
    jobs.push(
      fetchPortalListings(env, 'property24', p24Url, p24Id, params.listingType, page).then((r) => ({
        portal: 'property24' as const,
        ...r,
      })),
    )
  }
  if (ppUrl && ppId) {
    jobs.push(
      fetchPortalListings(env, 'privateproperty', ppUrl, ppId, params.listingType, page).then(
        (r) => ({ portal: 'privateproperty' as const, ...r }),
      ),
    )
  }

  const settled = await Promise.allSettled(jobs)
  const grouped: PropertyListing[][] = []
  const sources: PropertyPortalSourceMeta[] = []
  const portalsHit = new Set<PropertyPortalId>()

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue
    const { portal, listings, ok } = result.value
    portalsHit.add(portal)
    grouped.push(listings)
    sources.push({ id: portal, label: PROPERTY_PORTAL_LABELS[portal], count: listings.length, ok })
  }
  // Report portals we couldn't even address (no id) as unavailable, for the UI.
  for (const portal of ['property24', 'privateproperty'] as PropertyPortalId[]) {
    if (!portalsHit.has(portal)) {
      sources.push({ id: portal, label: PROPERTY_PORTAL_LABELS[portal], count: 0, ok: false })
    }
  }

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
    locationText: staticLoc?.name ?? params.query,
    refreshedAt: new Date().toISOString(),
  }
}
