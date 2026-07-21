// Reverse geocoding for Properties Scout "near me".
//
// The old near-me path snapped the device coordinates to the closest of ~58
// hard-coded major cities, so a shopper in a suburb that isn't on that list
// (Edenvale, Bedfordview, Fourways side-streets…) was shown the nearest *city*
// instead — e.g. Edenvale coordinates resolved to Kempton Park. Instead we ask
// Geoapify what town/suburb the coordinates actually sit in, then resolve that
// name against the real Property24 catalogue (9000+ places). The Geoapify key is
// server-only, so this lives in the Worker and reaches web + mobile alike.

import type { TrolleyScoutEnv } from './env'

export interface ReversePlace {
  // Candidate place names, best-first (town/city before suburb before district),
  // so the caller can try each against the portal catalogues and take the first
  // that resolves to a real listing location.
  names: string[]
  // The province (Geoapify `state`), used to address province-scoped portals.
  province?: string
}

const REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse'
const FETCH_TIMEOUT_MS = 8_000

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

// Municipality names ("City of Johannesburg Metropolitan Municipality",
// "Ekurhuleni…") are not how property portals label a location, so strip the
// administrative suffix to leave a usable town-ish token as a last resort.
function cleanDistrict(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value
    .replace(/\b(metropolitan|local|district)\b/gi, ' ')
    .replace(/\bmunicipality\b/gi, ' ')
    .replace(/\bcity of\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || undefined
}

/**
 * Turns a Geoapify reverse-geocode payload into ordered candidate place names
 * plus the province. Pure and synchronous so it can be unit-tested against a
 * captured response. Prefers the town/city over the suburb so a shopper in a
 * neighbourhood of Edenvale resolves to "Edenvale", not the block they stand on.
 */
export function parseGeoapifyReverse(payload: unknown): ReversePlace | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const results = (payload as { results?: unknown }).results
  const first = Array.isArray(results) ? results[0] : undefined
  if (!first || typeof first !== 'object') return undefined
  const r = first as Record<string, unknown>

  const ordered = [
    str(r.city),
    str(r.town),
    str(r.village),
    str(r.suburb),
    str(r.name),
    cleanDistrict(str(r.county)),
  ]
  const seen = new Set<string>()
  const names: string[] = []
  for (const candidate of ordered) {
    if (!candidate) continue
    const key = candidate.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(candidate)
  }
  if (names.length === 0) return undefined
  return { names, province: str(r.state) ?? str(r.state_district) }
}

/** Fetches the town/suburb + province for a coordinate, or undefined on failure. */
export async function reverseGeocodePlace(
  env: TrolleyScoutEnv,
  lat: number,
  lon: number,
): Promise<ReversePlace | undefined> {
  if (!env.GEOAPIFY_API_KEY) return undefined
  const params = new URLSearchParams({
    apiKey: env.GEOAPIFY_API_KEY,
    lat: String(lat),
    lon: String(lon),
    format: 'json',
    lang: 'en',
    type: 'city',
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${REVERSE_URL}?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    return parseGeoapifyReverse(await response.json())
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
