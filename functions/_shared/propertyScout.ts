// Network + cache layer for Properties Scout.
//
// SA property portals serve listings as server-rendered HTML and many block
// Cloudflare datacenter IPs (a bot challenge comes back as HTTP 200 with no
// listings). So we:
//   1. Resolve the shopper's text / "near me" coordinates to a location WITHOUT
//      calling bot-blocked autocompletes — via a baked-in catalogue
//      (saPropertyLocations), falling back to the full Property24 catalogue
//      (fetched through the r.jina.ai reader, cached) for long-tail suburbs.
//   2. Fan out across every portal adapter (propertyAdapters) that can address
//      the location, fetching each results page directly first and re-fetching
//      through the reader proxy whenever a fetch yields zero listings.
// Results are cached per portal/type/location/page in D1.

import {
  PROPERTY24_AUTOCOMPLETE_URL,
  filterAndSortListings,
  interleaveByPortal,
  matchPlaceByName,
  parsePamGoldingAutocomplete,
  parseMyroofPlaces,
  parsePrivatePropertyShapes,
  parseProperty24LocationCatalog,
  resolveProperty24Location,
  slug,
  type PortalPlace,
  type PrivatePropertyLocation,
  type PropertyFilters,
  type PropertySort,
} from '../../src/services/propertyPortals'
import {
  PORTAL_ADAPTERS,
  type PortalAdapter,
  type PortalLocationInput,
} from '../../src/services/propertyAdapters'
import {
  nearestSaLocation,
  resolveSaLocation,
  type SaPropertyLocation,
} from '../../src/services/saPropertyLocations'
import type {
  PropertyListing,
  PropertyListingType,
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

async function fetchDirect(url: string): Promise<string | undefined> {
  const response = await timedFetch(url, { 'user-agent': BROWSER_UA, accept: 'text/html' })
  if (!response?.ok) return undefined
  const body = (await response.text()).slice(0, MAX_BODY_BYTES)
  return body.length > 0 ? body : undefined
}

// The r.jina.ai reader fetches from its own network (not Cloudflare's), so it
// slips past the portals' datacenter-IP blocks. 'html' returns raw HTML.
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

// Fetch + parse a results page. Direct first (fast when it works); if that
// returns nothing — a real empty page or, more often, a bot challenge — retry
// through the reader proxy and keep whichever gives more.
async function fetchAndParse(
  env: TrolleyScoutEnv,
  url: string,
  parse: (html: string) => PropertyListing[],
): Promise<PropertyListing[]> {
  const direct = await fetchDirect(url)
  let listings = direct ? parse(direct) : []
  if (listings.length === 0) {
    const proxied = await fetchViaReader(url, env.JINA_API_KEY, 'html')
    if (proxied) {
      const proxiedListings = parse(proxied)
      if (proxiedListings.length > listings.length) listings = proxiedListings
    }
  }
  return listings.slice(0, MAX_PER_PORTAL)
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
// Property24 full-catalogue fallback (suburbs not in the static catalogue)
// ---------------------------------------------------------------------------

async function getProperty24Catalog(env: TrolleyScoutEnv) {
  const now = Date.now()
  const cached = await readCache(env, P24_CATALOG_KEY)
  if (isFresh(cached, P24_CATALOG_STALE_MS, now)) {
    const parsed = parseProperty24LocationCatalog(safeJson(cached!.payload_json))
    if (parsed.length > 0) return parsed
  }
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
  return cached ? parseProperty24LocationCatalog(safeJson(cached.payload_json)) : []
}

// ---------------------------------------------------------------------------
// Live location-id resolution (Pam Golding, MyRoof, Private Property)
//
// These three portals need an internal numeric location id in their URLs. Rather
// than curate a table by hand, we resolve the id live from each portal's own data
// and cache it in D1 — so any location resolves, nothing is hand-populated. The
// static catalogue still seeds the common cities as a fast path; whatever it
// lacks is filled here.
// ---------------------------------------------------------------------------

const PG_AUTOCOMPLETE = 'https://webapi.pamgolding.co.za/api/locations/autocomplete-alt?searchTerm='
const MYROOF_HOME = 'https://www.myroof.co.za/'
const PP_SITEMAP = 'https://www.privateproperty.co.za/SiteMap/residential-shapes-0.xml'
const MYROOF_PLACES_KEY = '__myroof_places__'
const PP_CITIES_KEY = '__pp_cities__'
const LOC_STALE_MS = 7 * 24 * 60 * 60 * 1000

// Fetch text direct-first, then via the reader proxy (portals block CF IPs).
async function fetchResolving(env: TrolleyScoutEnv, url: string, format: 'html' | 'text'): Promise<string | undefined> {
  const direct = await fetchDirect(url)
  if (direct && direct.length > 100) return direct
  return fetchViaReader(url, env.JINA_API_KEY, format)
}

async function resolvePamGoldingId(env: TrolleyScoutEnv, query: string): Promise<number | undefined> {
  const q = query.trim()
  if (q.length < 2) return undefined
  const key = `pgid:${slug(q)}`
  const cached = await readCache(env, key)
  if (isFresh(cached, LOC_STALE_MS, Date.now())) {
    const p = safeJson(cached!.payload_json) as { id?: number } | undefined
    if (p && typeof p.id === 'number') return p.id
  }
  const url = `${PG_AUTOCOMPLETE}${encodeURIComponent(q)}`
  let parsed = parsePamGoldingAutocomplete(safeJson(await fetchResolving(env, url, 'text')), q)
  if (!parsed) parsed = parsePamGoldingAutocomplete(safeJson(await fetchViaReader(url, env.JINA_API_KEY, 'text')), q)
  if (parsed) {
    await writeCache(env, key, { id: parsed.id, path: parsed.path }, 1)
    return parsed.id
  }
  if (cached) {
    const p = safeJson(cached.payload_json) as { id?: number } | undefined
    if (p && typeof p.id === 'number') return p.id
  }
  return undefined
}

async function getMyroofPlaces(env: TrolleyScoutEnv): Promise<PortalPlace[]> {
  const cached = await readCache(env, MYROOF_PLACES_KEY)
  if (isFresh(cached, LOC_STALE_MS, Date.now())) {
    const p = safeJson(cached!.payload_json)
    if (Array.isArray(p) && p.length > 0) return p as PortalPlace[]
  }
  const html = await fetchResolving(env, MYROOF_HOME, 'html')
  const places = html ? parseMyroofPlaces(html) : []
  if (places.length > 0) {
    await writeCache(env, MYROOF_PLACES_KEY, places, places.length)
    return places
  }
  return cached ? ((safeJson(cached.payload_json) as PortalPlace[]) ?? []) : []
}

async function getPpCities(env: TrolleyScoutEnv): Promise<PrivatePropertyLocation[]> {
  const cached = await readCache(env, PP_CITIES_KEY)
  if (isFresh(cached, LOC_STALE_MS, Date.now())) {
    const p = safeJson(cached!.payload_json)
    if (Array.isArray(p) && p.length > 0) return p as PrivatePropertyLocation[]
  }
  const xml = await fetchResolving(env, PP_SITEMAP, 'html')
  const cities = xml ? parsePrivatePropertyShapes(xml) : []
  if (cities.length > 0) {
    await writeCache(env, PP_CITIES_KEY, cities, cities.length)
    return cities
  }
  return cached ? ((safeJson(cached.payload_json) as PrivatePropertyLocation[]) ?? []) : []
}

// Fill any missing portal ids on the resolved location, live and in parallel.
// Every resolver swallows its own errors so a lookup miss never fails the search.
async function enrichLocationIds(env: TrolleyScoutEnv, loc: PortalLocationInput): Promise<PortalLocationInput> {
  const query = loc.name
  const patches: Array<Promise<Partial<PortalLocationInput>>> = []
  if (loc.pamgolding === undefined) {
    patches.push(
      resolvePamGoldingId(env, query)
        .then((id) => (id ? { pamgolding: id } : {}))
        .catch(() => ({})),
    )
  }
  if (!loc.myroof) {
    patches.push(
      getMyroofPlaces(env)
        .then((places) => {
          const m = matchPlaceByName(places, query)
          return m ? { myroof: { id: m.id, slug: m.slug } } : {}
        })
        .catch(() => ({})),
    )
  }
  if (!loc.pp) {
    patches.push(
      getPpCities(env)
        .then((cities) => {
          const m = matchPlaceByName(cities, query)
          return m ? { pp: { id: m.id, name: m.name, descriptor: m.descriptor ?? loc.province } } : {}
        })
        .catch(() => ({})),
    )
  }
  if (patches.length === 0) return loc
  const resolved = await Promise.all(patches)
  return Object.assign({}, loc, ...resolved)
}

// ---------------------------------------------------------------------------
// Per-portal fetch (cached)
// ---------------------------------------------------------------------------

async function fetchPortalListings(
  env: TrolleyScoutEnv,
  adapter: PortalAdapter,
  url: string,
  listingType: PropertyListingType,
  cacheKey: string,
): Promise<{ listings: PropertyListing[]; ok: boolean }> {
  const cached = await readCache(env, cacheKey)
  if (isFresh(cached, SEARCH_STALE_MS, Date.now())) {
    const parsed = safeJson(cached!.payload_json)
    if (Array.isArray(parsed)) return { listings: parsed as PropertyListing[], ok: true }
  }
  const listings = await fetchAndParse(env, url, (html) => adapter.parse(html, listingType))
  if (listings.length > 0) {
    await writeCache(env, cacheKey, listings, listings.length)
    return { listings, ok: true }
  }
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
  const nearMe = params.lat !== undefined && params.lon !== undefined

  // Resolve the location to a portal-agnostic input.
  const staticLoc: SaPropertyLocation | undefined = nearMe
    ? nearestSaLocation(params.lat!, params.lon!)
    : resolveSaLocation(params.query)

  let loc: PortalLocationInput | undefined = staticLoc
  let locationName = staticLoc?.name ?? params.query

  // Long-tail text: resolve against the full Property24 catalogue. This gives
  // Property24 + SA Home Traders addressing (both use the P24 taxonomy) even for
  // suburbs not in the static catalogue.
  if (!loc && !nearMe && params.query.trim().length >= 2) {
    const catalog = await getProperty24Catalog(env)
    const match = resolveProperty24Location(catalog, params.query)
    if (match) {
      loc = {
        name: match.name,
        province: match.parentName ?? '',
        p24: { id: match.id, type: match.type, name: match.name, parent: match.parentName ?? '' },
      }
      locationName = match.name
    }
  }

  if (!loc) {
    return {
      listings: [],
      sources: PORTAL_ADAPTERS.map((a) => ({ id: a.id, label: a.label, count: 0, ok: false })),
      listingType: params.listingType,
      page,
      locationText: params.query,
      refreshedAt: new Date().toISOString(),
    }
  }

  // Fill any portal ids the static catalogue / P24 fallback didn't provide,
  // live from each portal's own location data (cached in D1).
  loc = await enrichLocationIds(env, loc)

  const locKey = `${slug(loc.name)}|${slug(loc.province)}`
  const settled = await Promise.allSettled(
    PORTAL_ADAPTERS.map(async (adapter) => {
      const url = adapter.buildUrl(loc!, params.listingType, page)
      if (!url) return { portal: adapter, listings: [] as PropertyListing[], ok: false }
      const cacheKey = `${adapter.id}:${params.listingType}:${locKey}:${page}`
      const r = await fetchPortalListings(env, adapter, url, params.listingType, cacheKey)
      return { portal: adapter, ...r }
    }),
  )

  const grouped: PropertyListing[][] = []
  const sources: PropertyPortalSourceMeta[] = []
  for (let i = 0; i < settled.length; i += 1) {
    const adapter = PORTAL_ADAPTERS[i]
    const value = settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<any>).value : undefined
    const listings: PropertyListing[] = value?.listings ?? []
    grouped.push(listings)
    sources.push({ id: adapter.id, label: adapter.label, count: listings.length, ok: value?.ok ?? false })
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
    locationText: locationName,
    refreshedAt: new Date().toISOString(),
  }
}
