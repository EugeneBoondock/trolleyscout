// Keyless area gap-scout. OpenStreetMap (behind Geoapify) misses many South
// African independents — Frontline Hyper, cash-and-carrys, local hypers — so we
// find them the way a shopper would: a DuckDuckGo search for supermarkets in
// the suburb, then geocode each discovered name with the Geoapify key we
// already hold. No Google APIs involved.

import { matchKnownRetailer, isValidCoordinate, type NearbyStore } from './nearbyStores'
import type { SearchResult } from './webSearch'

// Business directories: their listing pages are category indexes, but a
// business-specific page title ("Frontline Hyper Edenvale | Supermarket…")
// still names a real store, so hosts alone never disqualify a result.
const CATEGORY_TITLE_PATTERNS = [
  /^\d+\s+best\b/i,
  /supermarkets?\s+(?:and|&)\s+hypermarkets?/i,
  /supermarkets?\s+in\s+/i,
  /grocery stores?\s+in\s+/i,
  /wholesalers?\s+(?:companies\s+)?in\s+/i,
  /companies\s+in\s+/i,
  /business directory/i,
  /local search/i,
  /\bnear you\b/i,
  /\byellow pages\b/i,
  /catalogues?\s+(?:and|&)\s+specials/i,
]

// Leading/trailing title segments that are site chrome, not the business name.
const CHROME_SEGMENT = /^(home|homepage|welcome|official site|official website|about us|contact us?)$/i

const MIN_NAME_LENGTH = 4
const MAX_NAME_LENGTH = 60
const MAX_CANDIDATES = 6

export function buildAreaStoresQuery(area: string, countryName = 'South Africa'): string {
  return `supermarkets hyper cash and carry ${area} ${countryName}`
}

// Pulls plausible store names out of search-result titles, skipping category
// listings, chains we already track, and stores already discovered for the
// tile. One candidate per brand (first significant word) to avoid duplicates
// like "Frontline SA" + "Frontline Hyper Edenvale".
export function extractCandidateStoreNames(
  results: SearchResult[],
  existingStoreNames: string[],
  countryCode = 'ZA',
): string[] {
  const existing = existingStoreNames.map(normalizeName)
  const seenBrands = new Set<string>()
  const candidates: string[] = []

  for (const result of results) {
    if (candidates.length >= MAX_CANDIDATES) {
      break
    }

    const name = candidateNameFromTitle(result.title)

    if (!name || (countryCode === 'ZA' && matchKnownRetailer(name))) {
      continue
    }

    const normalized = normalizeName(name)
    const brand = brandToken(normalized)

    if (
      !brand ||
      seenBrands.has(brand) ||
      existing.some((known) => known.includes(normalized) || normalized.includes(known) || brandToken(known) === brand)
    ) {
      continue
    }

    seenBrands.add(brand)
    candidates.push(name)
  }

  return candidates
}

export function candidateNameFromTitle(title: string): string | undefined {
  if (CATEGORY_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return undefined
  }

  // Titles look like "Frontline Hyper Edenvale | Supermarket & Grocery, …",
  // "Home - Devland Cash and Carry", or "Frontline SA". Take the first
  // pipe-segment, then drop chrome words around dashes.
  const firstSegment = title.split('|')[0].trim()
  const dashParts = firstSegment
    .split(/\s+[-–]\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !CHROME_SEGMENT.test(part))

  // "Frontline Hyper in Edenvale" → "Frontline Hyper"; the area is appended
  // back at geocoding time anyway.
  const name = dashParts[0]?.replace(/\s+in\s+[A-Z][a-zA-Z\s]{2,30}$/, '')

  if (
    !name ||
    name.length < MIN_NAME_LENGTH ||
    name.length > MAX_NAME_LENGTH ||
    CATEGORY_TITLE_PATTERNS.some((pattern) => pattern.test(name)) ||
    !/[a-z]/i.test(name)
  ) {
    return undefined
  }

  return name
}

export function buildGeoapifyReverseUrl(lat: number, lon: number, apiKey: string): string {
  // No `type` filter: the full result carries the suburb, which is the area a
  // shopper would actually search by ("Edenvale", not the metro municipality).
  const params = new URLSearchParams({ apiKey, lat: String(lat), lon: String(lon) })
  return `https://api.geoapify.com/v1/geocode/reverse?${params.toString()}`
}

// The suburb/city name a shopper would type, from a reverse-geocode response.
export function extractAreaName(payload: unknown): string | undefined {
  const feature = firstFeature(payload)
  const props = feature?.properties ?? {}

  return firstString(props.suburb) ?? firstString(props.city) ?? firstString(props.county)
}

export function buildGeoapifyGeocodeUrl(
  text: string,
  lat: number,
  lon: number,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    apiKey,
    bias: `proximity:${lon},${lat}`,
    filter: `circle:${lon},${lat},15000`,
    limit: '1',
    text,
  })

  return `https://api.geoapify.com/v1/geocode/search?${params.toString()}`
}

// Result types that pin an actual building/POI rather than a whole locality.
const PRECISE_RESULT_TYPES = new Set(['amenity', 'building', 'street'])

// Turns a geocode response into a store entry. Stores missing from OSM geocode
// to the suburb centroid at best, so those are kept but flagged approximate —
// surfacing the store and its specials link matters more than the pin.
export function mapGeocodedStore(
  name: string,
  payload: unknown,
  fallback: { lat: number; lon: number; area: string; countryCode?: string; countryName?: string },
): NearbyStore {
  const feature = firstFeature(payload)
  const props = feature?.properties ?? {}
  const lat = Number(props.lat)
  const lon = Number(props.lon)
  const resultType = firstString(props.result_type)
  // A hit only counts as this store if the matched place is actually named
  // after it — Geoapify happily fuzzy-matches "Frontline Hyper" to a nearby
  // "Checkers Hyper" POI otherwise.
  const brand = brandToken(normalizeName(name))
  const matchedText = normalizeName(`${firstString(props.name) ?? ''} ${firstString(props.formatted) ?? ''}`)
  const isPrecise = Boolean(
    resultType && PRECISE_RESULT_TYPES.has(resultType) && brand && matchedText.includes(brand),
  )

  return {
    address: isPrecise
      ? (firstString(props.formatted) ?? fallback.area)
      : `${fallback.area} (location approximate)`,
    countryCode: fallback.countryCode,
    countryName: fallback.countryName,
    lat: isPrecise && isValidCoordinate(lat, lon) ? lat : fallback.lat,
    lon: isPrecise && isValidCoordinate(lat, lon) ? lon : fallback.lon,
    name,
    placeId: `area-scout:${slugify(name)}:${slugify(fallback.area)}`,
    retailerId: fallback.countryCode === 'ZA' ? matchKnownRetailer(name) : undefined,
  }
}

export function mergeStores(existing: NearbyStore[], found: NearbyStore[]): NearbyStore[] {
  const seenPlaceIds = new Set(existing.map((store) => store.placeId))
  const seenNames = existing.map((store) => normalizeName(store.name))
  const merged = [...existing]

  for (const store of found) {
    const normalized = normalizeName(store.name)

    if (
      seenPlaceIds.has(store.placeId) ||
      seenNames.some((known) => known.includes(normalized) || normalized.includes(known))
    ) {
      continue
    }

    seenPlaceIds.add(store.placeId)
    seenNames.push(normalized)
    merged.push(store)
  }

  return merged
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// The first word long enough to identify the brand ("frontline", "devland").
function brandToken(normalizedName: string): string | undefined {
  return normalizedName.split(' ').find((token) => token.length >= MIN_NAME_LENGTH)
}

function slugify(value: string): string {
  return normalizeName(value).replace(/\s/g, '-')
}

interface GeocodeFeatureProps {
  lat?: unknown
  lon?: unknown
  name?: unknown
  formatted?: unknown
  result_type?: unknown
  suburb?: unknown
  city?: unknown
  county?: unknown
}

function firstFeature(payload: unknown): { properties?: GeocodeFeatureProps } | undefined {
  const features = (payload as { features?: unknown })?.features
  return Array.isArray(features) ? (features[0] as { properties?: GeocodeFeatureProps }) : undefined
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
