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
  normalizePropertyListing,
  parsePamGoldingAutocomplete,
  parseMyroofPlaces,
  parsePrivatePropertyShapes,
  parseProperty24LocationCatalog,
  resolveProperty24Location,
  resolveProperty24Province,
  slug,
  type PortalPlace,
  type PrivatePropertyLocation,
  type Property24Location,
  type PropertyFilters,
  type PropertySort,
} from '../../src/services/propertyPortals'
import { reverseGeocodePlace } from './reverseGeocode'
import {
  PORTAL_ADAPTERS,
  type PortalAdapter,
  type PortalLocationInput,
} from '../../src/services/propertyAdapters'
import { nearestSaLocation, resolveSaLocation } from '../../src/services/saPropertyLocations'
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

// Build a portal-agnostic location from a Property24 catalogue match, deriving
// the real province (climbing suburb → city → province) unless the caller already
// knows it (e.g. from the reverse geocode). Without this a suburb's province is
// its parent city, which breaks the province-addressed portals.
function locFromP24Match(
  catalog: Property24Location[],
  match: Property24Location,
  provinceHint?: string,
): PortalLocationInput {
  const province = provinceHint || resolveProperty24Province(catalog, match) || match.parentName || ''
  return {
    name: match.name,
    province,
    p24: { id: match.id, type: match.type, name: match.name, parent: match.parentName ?? '' },
  }
}

// Text search: the static catalogue first (fast, and the metros carry every
// portal id), then the full Property24 catalogue for long-tail suburbs.
async function resolveByText(
  env: TrolleyScoutEnv,
  query: string,
): Promise<{ loc: PortalLocationInput; locationName: string } | undefined> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return undefined
  const staticLoc = resolveSaLocation(trimmed)
  if (staticLoc) return { loc: staticLoc, locationName: staticLoc.name }
  const catalog = await getProperty24Catalog(env)
  const match = resolveProperty24Location(catalog, trimmed)
  return match ? { loc: locFromP24Match(catalog, match), locationName: match.name } : undefined
}

// Near me: reverse-geocode the coordinates to the real town/suburb and resolve
// THAT against the catalogues, so a shopper in Edenvale gets Edenvale — not the
// nearest hard-coded metro (which used to surface Kempton Park). Only when the
// reverse lookup is unavailable or unresolvable do we fall back to the nearest
// catalogue city, preserving the previous behaviour as a safety net.
async function resolveNearMe(
  env: TrolleyScoutEnv,
  lat: number,
  lon: number,
): Promise<{ loc: PortalLocationInput; locationName: string } | undefined> {
  const place = await reverseGeocodePlace(env, lat, lon)
  if (place) {
    for (const name of place.names) {
      const staticLoc = resolveSaLocation(name)
      if (staticLoc) return { loc: staticLoc, locationName: staticLoc.name }
    }
    const catalog = await getProperty24Catalog(env)
    for (const name of place.names) {
      const match = resolveProperty24Location(catalog, name)
      if (match) return { loc: locFromP24Match(catalog, match, place.province), locationName: match.name }
    }
  }
  const nearest = nearestSaLocation(lat, lon)
  return nearest ? { loc: nearest, locationName: nearest.name } : undefined
}

export async function searchProperties(
  env: TrolleyScoutEnv,
  params: PropertySearchParams,
): Promise<PropertySearchResult> {
  const page = Math.max(1, Math.min(params.page ?? 1, 5))
  const nearMe = params.lat !== undefined && params.lon !== undefined

  const resolved = nearMe
    ? await resolveNearMe(env, params.lat!, params.lon!)
    : await resolveByText(env, params.query)

  if (!resolved) {
    return {
      listings: [],
      sources: PORTAL_ADAPTERS.map((a) => ({ id: a.id, label: a.label, count: 0, ok: false })),
      listingType: params.listingType,
      page,
      locationText: params.query,
      refreshedAt: new Date().toISOString(),
    }
  }

  let loc: PortalLocationInput = resolved.loc
  const locationName = resolved.locationName

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
    // Normalize beds/baths/garages once, for every portal, before they feed the
    // bed filter, the sort, and the UI — so the counts are consistent no matter
    // which parser produced them (and cached-but-pre-normalization rows are fixed
    // on read too).
    const listings: PropertyListing[] = (value?.listings ?? []).map(normalizePropertyListing)
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
