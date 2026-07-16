import { retailers } from '../data/retailers'
import type { RetailerId } from '../types'

// Grocery-ish Geoapify categories. Supermarkets first, then value grocers,
// wholesalers, and marketplaces that also run specials.
export const STORE_CATEGORIES =
  'commercial.supermarket,commercial.marketplace,commercial.convenience,commercial.department_store'

export interface NearbyStore {
  placeId: string
  name: string
  address?: string
  lat: number
  lon: number
  website?: string
  distanceM?: number
  // Set when the store name maps to a chain Trolley Scout already scouts, so
  // we can attach that chain's deals and leaflets straight away.
  retailerId?: RetailerId
}

export function buildGeoapifyNearbyUrl(
  lat: number,
  lon: number,
  radiusM: number,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    apiKey,
    bias: `proximity:${lon},${lat}`,
    categories: STORE_CATEGORIES,
    filter: `circle:${lon},${lat},${Math.round(radiusM)}`,
    limit: '40',
  })

  return `https://api.geoapify.com/v2/places?${params.toString()}`
}

// ~5.5 km grid. Users within the same tile share a cached store list and the
// deals found for it — the whole point of caching discovery globally.
export function locationTileKey(lat: number, lon: number): string {
  const grid = 0.05
  const gridLat = Math.round(lat / grid)
  const gridLon = Math.round(lon / grid)

  return `${gridLat}:${gridLon}`
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

interface GeoapifyFeature {
  properties?: {
    place_id?: unknown
    name?: unknown
    formatted?: unknown
    address_line2?: unknown
    lat?: unknown
    lon?: unknown
    website?: unknown
    distance?: unknown
    datasource?: { raw?: Record<string, unknown> }
  }
}

export function mapGeoapifyStores(payload: unknown, limit = 24): NearbyStore[] {
  const features = (payload as { features?: unknown })?.features

  if (!Array.isArray(features)) {
    return []
  }

  const stores: NearbyStore[] = []
  const seen = new Set<string>()

  for (const feature of features as GeoapifyFeature[]) {
    if (stores.length >= limit) {
      break
    }

    const props = feature?.properties ?? {}
    const raw = props.datasource?.raw ?? {}
    const name = typeof props.name === 'string' ? props.name.trim() : ''
    const lat = Number(props.lat)
    const lon = Number(props.lon)

    if (!name || !isValidCoordinate(lat, lon)) {
      continue
    }

    const key = `${name.toLowerCase()}::${lat.toFixed(4)}::${lon.toFixed(4)}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)

    const website =
      firstString(props.website) ??
      firstString(raw.website) ??
      firstString(raw['contact:website'])

    stores.push({
      address: firstString(props.formatted) ?? firstString(props.address_line2),
      distanceM: Number.isFinite(Number(props.distance)) ? Number(props.distance) : undefined,
      lat,
      lon,
      name,
      placeId: firstString(props.place_id) ?? key,
      retailerId: matchKnownRetailer(name),
      website: website ? normalizeWebsite(website) : undefined,
    })
  }

  // Known chains first (we have deals for them), then by distance.
  return stores.sort((left, right) => {
    if (Boolean(left.retailerId) !== Boolean(right.retailerId)) {
      return left.retailerId ? -1 : 1
    }

    return (left.distanceM ?? Infinity) - (right.distanceM ?? Infinity)
  })
}

// Extra spellings that appear on shopfront signage / OSM data but do not match
// the retailer's canonical name closely enough for the generic matcher.
const RETAILER_NAME_ALIASES: Array<{ id: RetailerId; patterns: RegExp[] }> = [
  { id: 'pick-n-pay', patterns: [/pick\s*n\s*pay/i, /\bpnp\b/i, /pick and pay/i] },
  { id: 'shoprite', patterns: [/shoprite/i] },
  { id: 'checkers', patterns: [/checkers/i] },
  { id: 'woolworths', patterns: [/woolworths/i, /\bwoolies\b/i] },
  { id: 'spar', patterns: [/\bspar\b/i, /superspar/i, /kwikspar/i, /savemor/i] },
  { id: 'boxer', patterns: [/\bboxer\b/i] },
  { id: 'usave', patterns: [/\busave\b/i, /u-save/i] },
  { id: 'food-lovers', patterns: [/food\s*lover/i, /freshstop/i] },
  { id: 'makro', patterns: [/\bmakro\b/i] },
  { id: 'ok-foods', patterns: [/\bok\s*foods?\b/i, /ok grocer/i, /ok mini/i] },
  { id: 'dis-chem', patterns: [/dis[\s-]?chem/i] },
  { id: 'clicks', patterns: [/\bclicks\b/i] },
  { id: 'game', patterns: [/\bgame\b/i] },
  { id: 'builders', patterns: [/builders warehouse/i, /builders express/i] },
]

export function matchKnownRetailer(storeName: string): RetailerId | undefined {
  const name = storeName.toLowerCase()

  for (const alias of RETAILER_NAME_ALIASES) {
    if (alias.patterns.some((pattern) => pattern.test(name))) {
      return alias.id
    }
  }

  // Fall back to a direct contains-match against the retailer directory.
  const direct = retailers.find(
    (retailer) =>
      name.includes(retailer.name.toLowerCase()) ||
      name.includes(retailer.shortName.toLowerCase()),
  )

  return direct?.id
}

function normalizeWebsite(value: string): string {
  const trimmed = value.trim()

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
