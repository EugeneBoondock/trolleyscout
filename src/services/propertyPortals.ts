// Parsers and URL builders for the South African property portals that power
// Properties Scout: Property24 and Private Property. Everything here is pure and
// synchronous so it can be unit-tested against captured fixtures; the network
// side (fetching, caching, timeouts) lives in functions/_shared/propertyScout.ts.
//
// How each portal is addressed (reverse-engineered from the live sites):
//   * Property24 uses numeric location ids. Its search box calls
//     /autocomplete/propertiesgrouped, which returns the WHOLE location
//     catalogue grouped by first letter; the client filters locally. A listing
//     page is /{for-sale|to-rent}/<slug>/<parent>/<id>, and the id is
//     authoritative — a wrong slug simply 301s to the canonical one.
//   * Private Property also uses numeric ids. Its box calls
//     /Portal/Search/GetAutocompleteLocations?suburbPhrase=..., returning
//     [{text, descriptorText, itemId}]. A listing page is
//     /{for-sale|to-rent}/<province>/<city>/<itemId>; the id is authoritative.

import type {
  PropertyListing,
  PropertyListingType,
  PropertyPortalId,
} from '../types'

export const PROPERTY_PORTAL_LABELS: Record<PropertyPortalId, string> = {
  property24: 'Property24',
  privateproperty: 'Private Property',
  gumtree: 'Gumtree',
  pamgolding: 'Pam Golding',
  myroof: 'MyRoof',
  sahometraders: 'SA Home Traders',
  seeff: 'Seeff',
  remax: 'RE/MAX',
  harcourts: 'Harcourts',
  rawson: 'Rawson',
  chaseveritt: 'Chas Everitt',
  jawitz: 'Jawitz',
  immoafrica: 'ImmoAfrica',
  wakefields: 'Wakefields',
  tysonprop: 'Tyson Properties',
  century21: 'Century 21',
  huizemark: 'Huizemark',
  justproperty: 'Just Property',
  lewgeffen: "Lew Geffen Sotheby's",
  dormehlphalane: 'Dormehl Phalane',
  fineandcountry: 'Fine & Country',
  engelvoelkers: 'Engel & Völkers',
  roomies: 'Roomies',
  realnet: 'RealNet',
  leapfrog: 'Leapfrog',
}

const PROPERTY24_ORIGIN = 'https://www.property24.com'
const PRIVATEPROPERTY_ORIGIN = 'https://www.privateproperty.co.za'

export const PROPERTY24_AUTOCOMPLETE_URL = `${PROPERTY24_ORIGIN}/autocomplete/propertiesgrouped?searchTerm=a`
export function privatePropertyAutocompleteUrl(phrase: string): string {
  return `${PRIVATEPROPERTY_ORIGIN}/Portal/Search/GetAutocompleteLocations?suburbPhrase=${encodeURIComponent(
    phrase,
  )}`
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Lowercase, strip every non-alphanumeric, for tolerant location matching. */
export function normalizeLocationToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** URL slug: lowercase words joined by hyphens, safe for a path segment. */
export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'za'
  )
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&nbsp;': ' ',
  '&#160;': ' ',
  '&#39;': "'",
  '&#039;': "'",
  '&quot;': '"',
  '&apos;': "'",
  '&#8217;': '’',
}

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|nbsp|quot|apos|#160|#39|#039|#8217);/g, (m) => ENTITIES[m] ?? m)
}

export function collapseSpace(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').trim()
}

/** Pulls a plain rand amount out of "R 1 695 000" / "R12,500 pm" → 12500. */
export function parseRandValue(text: string | undefined): number | undefined {
  if (!text) return undefined
  const match = /R\s*([\d][\d\s.,]*)/i.exec(decodeEntities(text))
  if (!match) return undefined
  const digits = match[1].replace(/[^\d]/g, '')
  if (!digits) return undefined
  const value = Number(digits)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

const LISTING_PREFIX: Record<PropertyListingType, string> = {
  sale: 'for-sale',
  rent: 'to-rent',
}

export function bedroomsFromTitle(title: string): number | undefined {
  const match = /(\d+)\s*bed/i.exec(title)
  return match ? Number(match[1]) : undefined
}

// ---------------------------------------------------------------------------
// Property24
// ---------------------------------------------------------------------------

export interface Property24Location {
  id: number
  name: string
  parentName?: string
  // 5 province, 2 city/metro, 1 suburb, 4 region, 13 other.
  type: number
  normalizedName: string
  normalizedParentName?: string
}

/** Flattens the grouped autocomplete payload into a flat location list. */
export function parseProperty24LocationCatalog(payload: unknown): Property24Location[] {
  if (!payload || typeof payload !== 'object') return []
  const out: Property24Location[] = []
  for (const group of Object.values(payload as Record<string, unknown>)) {
    if (!Array.isArray(group)) continue
    for (const entry of group) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      if (typeof e.id !== 'number' || typeof e.name !== 'string') continue
      out.push({
        id: e.id,
        name: e.name,
        parentName: typeof e.parentName === 'string' ? e.parentName : undefined,
        type: typeof e.type === 'number' ? e.type : 0,
        normalizedName:
          typeof e.normalizedName === 'string'
            ? e.normalizedName
            : normalizeLocationToken(e.name),
        normalizedParentName:
          typeof e.normalizedParentName === 'string' ? e.normalizedParentName : undefined,
      })
    }
  }
  return out
}

// Prefer a city, then a suburb, then a province, then anything else — so
// "cape town" resolves to the metro rather than a like-named street.
const P24_TYPE_RANK: Record<number, number> = { 2: 0, 1: 1, 5: 2, 4: 3, 13: 4 }

function p24Rank(type: number): number {
  return P24_TYPE_RANK[type] ?? 9
}

export function resolveProperty24Location(
  catalog: Property24Location[],
  query: string,
): Property24Location | undefined {
  const token = normalizeLocationToken(query)
  if (!token) return undefined

  const exact = catalog.filter((l) => l.normalizedName === token)
  if (exact.length > 0) {
    return exact.sort((a, b) => p24Rank(a.type) - p24Rank(b.type))[0]
  }

  const prefix = catalog.filter((l) => l.normalizedName.startsWith(token))
  if (prefix.length > 0) {
    return prefix.sort(
      (a, b) => p24Rank(a.type) - p24Rank(b.type) || a.name.length - b.name.length,
    )[0]
  }

  const contains = catalog.filter((l) => l.normalizedName.includes(token))
  return contains.sort(
    (a, b) => p24Rank(a.type) - p24Rank(b.type) || a.name.length - b.name.length,
  )[0]
}

export function buildProperty24Url(
  location: Property24Location,
  listingType: PropertyListingType,
  page = 1,
): string {
  const prefix = LISTING_PREFIX[listingType]
  const name = slug(location.name)
  const parent = slug(location.parentName ?? '')
  let path: string
  if (location.type === 5) {
    path = `/${prefix}/${name}/${location.id}`
  } else if (location.type === 2) {
    path = `/${prefix}/${name}/${parent}/${location.id}`
  } else {
    // Suburb/region: the province segment is unknown, but the id is
    // authoritative, so a placeholder segment is corrected by the site's 301.
    path = `/${prefix}/${name}/${parent}/za/${location.id}`
  }
  const paged = page > 1 ? `${path}/p${page}` : path
  return `${PROPERTY24_ORIGIN}${paged}`
}

// Each result is a <div class="p24_tileContainer ... js_resultTile ..."
// data-listing-number="X"> block. Sponsored/branding tiles carry no price or
// detail link and are dropped.
export function parseProperty24Listings(
  html: string,
  listingType: PropertyListingType,
): PropertyListing[] {
  const tileRe =
    /<div class="p24_tileContainer[^"]*js_resultTile[^"]*"[^>]*data-listing-number="([^"]+)"/g
  const starts: Array<{ index: number; listingNumber: string }> = []
  let m: RegExpExecArray | null
  while ((m = tileRe.exec(html)) !== null) {
    starts.push({ index: m.index, listingNumber: m[1] })
  }

  const listings: PropertyListing[] = []
  const seen = new Set<string>()

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].index : html.length
    const chunk = html.slice(start.index, end)

    const listingNumber = start.listingNumber.replace(/^P/i, '')

    const hrefMatch = /href="(\/(?:for-sale|to-rent)\/[^"]*\/\d+\/\d+[^"]*)"/.exec(chunk)
    const priceMatch = /class="p24_price[^"]*"[^>]*>\s*([^<]+?)\s*</.exec(chunk)
    if (!hrefMatch || !priceMatch) continue

    const listingUrl = `${PROPERTY24_ORIGIN}${decodeEntities(hrefMatch[1]).split('?')[0]}`
    const priceText = collapseSpace(priceMatch[1])
    if (!/\d/.test(priceText)) continue

    const id = `property24:${listingNumber}`
    if (seen.has(id)) continue
    seen.add(id)

    const titleMatch = /class="p24_proTile[^"]*"[^>]*title="([^"]+)"/.exec(chunk)
    const rawTitle = titleMatch ? collapseSpace(titleMatch[1]) : ''
    const title = rawTitle.replace(/\s+for\s+(?:sale|rent)\s+in\s+.*/i, '').trim()
    const locationMatch = /class="p24_location"[^>]*>\s*([^<]+?)\s*</.exec(chunk)
    const typeMatch = /\d+\s+Bedroom\s+([A-Za-z ]+?)(?:\s+for\b|\s+in\b|$)/i.exec(rawTitle)

    const bedsMatch = /title="Bedrooms"[\s\S]{0,220}?<span>([\d.]+)<\/span>/i.exec(chunk)
    const bathsMatch = /title="Bathrooms"[\s\S]{0,220}?<span>([\d.]+)<\/span>/i.exec(chunk)
    const imgMatch =
      /(?:lazy-src|data-src|src)="(https:\/\/images\.prop24\.com\/\d+\/Crop[^"]+)"/.exec(chunk)

    listings.push({
      id,
      portal: 'property24',
      portalName: PROPERTY_PORTAL_LABELS.property24,
      title: title || rawTitle || 'Property',
      priceText,
      priceValue: parseRandValue(priceText),
      location: locationMatch ? collapseSpace(locationMatch[1]) : undefined,
      bedrooms: bedsMatch ? Number(bedsMatch[1]) : bedroomsFromTitle(rawTitle),
      bathrooms: bathsMatch ? Number(bathsMatch[1]) : undefined,
      propertyType: typeMatch ? typeMatch[1].trim() : undefined,
      imageUrl: imgMatch ? imgMatch[1] : undefined,
      listingUrl,
      listingType,
    })
  }

  return listings
}

// ---------------------------------------------------------------------------
// Private Property
// ---------------------------------------------------------------------------

export interface PrivatePropertyLocation {
  id: number
  name: string
  descriptor?: string
}

export function parsePrivatePropertyLocations(payload: unknown): PrivatePropertyLocation[] {
  if (!Array.isArray(payload)) return []
  const out: PrivatePropertyLocation[] = []
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    if (typeof e.itemId !== 'number' || typeof e.text !== 'string') continue
    out.push({
      id: e.itemId,
      name: e.text,
      descriptor: typeof e.descriptorText === 'string' ? e.descriptorText : undefined,
    })
  }
  return out
}

export function resolvePrivatePropertyLocation(
  locations: PrivatePropertyLocation[],
  query: string,
): PrivatePropertyLocation | undefined {
  if (locations.length === 0) return undefined
  const token = normalizeLocationToken(query)
  // The endpoint already ranks by relevance; still prefer an exact name match.
  return locations.find((l) => normalizeLocationToken(l.name) === token) ?? locations[0]
}

// ---------------------------------------------------------------------------
// Live location-id resolvers (pure parsers)
//
// Pam Golding, MyRoof and Private Property carry an internal numeric location id
// in their URLs. Rather than curate a table by hand, we resolve the id live from
// each portal's own data (autocomplete API / homepage index / shapes sitemap)
// and cache it. These pure functions parse the fetched payloads; propertyScout
// orchestrates the fetch + D1 cache. All three: id is required, slug cosmetic.
// ---------------------------------------------------------------------------

// Pam Golding: webapi.pamgolding.co.za/api/locations/autocomplete-alt?searchTerm=
// returns an array ranked best-first; each item has {id, path (slug), description}.
export function parsePamGoldingAutocomplete(
  payload: unknown,
  query: string,
): { id: number; path: string } | undefined {
  if (!Array.isArray(payload)) return undefined
  const token = normalizeLocationToken(query)
  const items = payload.filter(
    (x): x is Record<string, unknown> => !!x && typeof x === 'object' && typeof (x as any).id === 'number',
  )
  const exact = items.find((x) => normalizeLocationToken(String(x.description ?? '')) === token)
  const pick = exact ?? items[0]
  if (!pick) return undefined
  return { id: pick.id as number, path: typeof pick.path === 'string' ? pick.path : slug(query) }
}

export interface PortalPlace {
  name: string
  slug: string
  id: number
}

// MyRoof homepage lists place links: /property-for-sale-in-{Slug}-{id}/ . The slug
// may embed a parent ("Northern-Suburbs-in-Cape-Town"); the place name is the part
// before the first "-in-".
export function parseMyroofPlaces(html: string): PortalPlace[] {
  const out: PortalPlace[] = []
  const seen = new Set<number>()
  for (const m of html.matchAll(/property-for-sale-in-([A-Za-z0-9%'\-]+?)-(\d+)\//g)) {
    const rawSlug = m[1]
    const id = Number(m[2])
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    const namePart = rawSlug.split('-in-')[0]
    let name = namePart
    try {
      name = decodeURIComponent(namePart)
    } catch {
      // keep raw when the slug isn't valid percent-encoding
    }
    out.push({ name: name.replace(/-/g, ' '), slug: rawSlug, id })
  }
  return out
}

// Private Property shapes sitemap: every <loc> is a canonical results URL whose
// final path segment is the itemId. We keep only city-level (province/city/id)
// entries so buildPrivatePropertyUrl reproduces the exact path from name+province.
export function parsePrivatePropertyShapes(xml: string): PrivatePropertyLocation[] {
  const out: PrivatePropertyLocation[] = []
  const seen = new Set<number>()
  for (const m of xml.matchAll(
    /<loc>https?:\/\/www\.privateproperty\.co\.za\/for-sale\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d+)<\/loc>/g,
  )) {
    const province = m[1]
    const citySlug = m[2]
    const id = Number(m[3])
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name: citySlug.replace(/-/g, ' '), descriptor: province.replace(/-/g, ' ') })
  }
  return out
}

// Shared name matcher for a list of {name} places: exact-normalized first, then
// the shortest partial (prefers the higher-level location on a tie).
export function matchPlaceByName<T extends { name: string }>(places: T[], query: string): T | undefined {
  const token = normalizeLocationToken(query)
  if (!token) return undefined
  const exact = places.find((p) => normalizeLocationToken(p.name) === token)
  if (exact) return exact
  const partials = places
    .filter((p) => {
      const n = normalizeLocationToken(p.name)
      return n.includes(token) || token.includes(n)
    })
    .sort((a, b) => a.name.length - b.name.length)
  return partials[0]
}

export function buildPrivatePropertyUrl(
  location: PrivatePropertyLocation,
  listingType: PropertyListingType,
  page = 1,
): string {
  const prefix = LISTING_PREFIX[listingType]
  const province = slug(location.descriptor ?? '')
  const name = slug(location.name)
  const path = `/${prefix}/${province}/${name}/${location.id}`
  const query = page > 1 ? `?page=${page}` : ''
  return `${PRIVATEPROPERTY_ORIGIN}${path}${query}`
}

/** Bumps a Private Property image to a larger render than the card default. */
function upgradePrivatePropertyImage(url: string): string {
  // .../<id>/<hash>/600/450/contain/jpegorpng → request 1200x900.
  return url.replace(/\/(\d+)\/(\d+)\/(contain|cover)\//, '/1200/900/$3/')
}

interface ResidenceLd {
  photo?: Array<{ contentUrl?: string }>
  address?: { addressLocality?: string; addressRegion?: string }
  additionalProperty?: Array<{ name?: string; value?: string }>
  url?: string
}

function residenceNumber(residence: ResidenceLd, name: string): number | undefined {
  const found = residence.additionalProperty?.find(
    (p) => (p.name ?? '').toLowerCase() === name,
  )
  const value = found?.value ? Number(found.value) : NaN
  return Number.isFinite(value) ? value : undefined
}

// Each card is an <a title="..." class="featured-listing" href="..."> wrapping
// a JSON-LD Residence (address, beds, photo, detail url) and a price div.
export function parsePrivatePropertyListings(
  html: string,
  listingType: PropertyListingType,
): PropertyListing[] {
  const cardRe = /<a\s+title="([^"]*)"\s+class="featured-listing"\s+href="([^"]+)"/g
  const starts: Array<{ index: number; title: string; href: string }> = []
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html)) !== null) {
    starts.push({ index: m.index, title: m[1], href: m[2] })
  }

  const listings: PropertyListing[] = []
  const seen = new Set<string>()

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1].index : html.length
    const chunk = html.slice(start.index, end)

    const ldMatch =
      /<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":"Residence"[\s\S]*?\})\s*<\/script>/.exec(
        chunk,
      )
    let residence: ResidenceLd = {}
    if (ldMatch) {
      try {
        residence = JSON.parse(ldMatch[1]) as ResidenceLd
      } catch {
        residence = {}
      }
    }

    const detail = residence.url ?? `${PRIVATEPROPERTY_ORIGIN}${decodeEntities(start.href)}`
    const listingUrl = detail.startsWith('http') ? detail : `${PRIVATEPROPERTY_ORIGIN}${detail}`
    const slugId = listingUrl.split('?')[0].replace(/\/+$/, '').split('/').pop() ?? ''
    const id = `privateproperty:${slugId || i}`
    if (seen.has(id)) continue
    seen.add(id)

    const priceMatch = /class="featured-listing__price"[^>]*>\s*([^<]+?)\s*</.exec(chunk)
    const priceText = priceMatch ? collapseSpace(priceMatch[1]) : undefined
    const title = collapseSpace(start.title) || 'Property'
    const typeMatch = /\d+\s*bed(?:room)?\s+([A-Za-z ]+)/i.exec(title)
    const image = residence.photo?.[0]?.contentUrl

    listings.push({
      id,
      portal: 'privateproperty',
      portalName: PROPERTY_PORTAL_LABELS.privateproperty,
      title,
      priceText,
      priceValue: parseRandValue(priceText),
      location: residence.address?.addressLocality
        ? collapseSpace(residence.address.addressLocality)
        : undefined,
      province: residence.address?.addressRegion,
      bedrooms: residenceNumber(residence, 'bedrooms') ?? bedroomsFromTitle(title),
      bathrooms: residenceNumber(residence, 'bathrooms'),
      garages: residenceNumber(residence, 'garages'),
      propertyType: typeMatch ? typeMatch[1].trim() : undefined,
      imageUrl: image ? upgradePrivatePropertyImage(image) : undefined,
      listingUrl,
      listingType,
    })
  }

  return listings
}

// ---------------------------------------------------------------------------
// Cross-portal filtering & sorting
// ---------------------------------------------------------------------------

export type PropertySort = 'relevance' | 'price_low' | 'price_high' | 'beds'

export interface PropertyFilters {
  minPrice?: number
  maxPrice?: number
  minBeds?: number
  sort?: PropertySort
}

export function filterAndSortListings(
  listings: PropertyListing[],
  filters: PropertyFilters = {},
): PropertyListing[] {
  const { minPrice, maxPrice, minBeds, sort = 'relevance' } = filters

  const filtered = listings.filter((l) => {
    if (minBeds && (l.bedrooms ?? 0) < minBeds) return false
    if (minPrice && (l.priceValue ?? 0) < minPrice) return false
    // A listing with no numeric price is only excluded by a max filter when the
    // shopper set one, since we cannot prove it fits.
    if (maxPrice && (l.priceValue === undefined || l.priceValue > maxPrice)) return false
    return true
  })

  const byPrice = (a: PropertyListing, b: PropertyListing, dir: number) => {
    const av = a.priceValue
    const bv = b.priceValue
    if (av === undefined && bv === undefined) return 0
    if (av === undefined) return 1
    if (bv === undefined) return -1
    return (av - bv) * dir
  }

  switch (sort) {
    case 'price_low':
      return [...filtered].sort((a, b) => byPrice(a, b, 1))
    case 'price_high':
      return [...filtered].sort((a, b) => byPrice(a, b, -1))
    case 'beds':
      return [...filtered].sort((a, b) => (b.bedrooms ?? 0) - (a.bedrooms ?? 0))
    default:
      return filtered
  }
}

/** Interleaves portals so the first screen shows both sources, not one wall. */
export function interleaveByPortal(groups: PropertyListing[][]): PropertyListing[] {
  const out: PropertyListing[] = []
  const max = Math.max(0, ...groups.map((g) => g.length))
  for (let i = 0; i < max; i += 1) {
    for (const group of groups) {
      if (i < group.length) out.push(group[i])
    }
  }
  return out
}
