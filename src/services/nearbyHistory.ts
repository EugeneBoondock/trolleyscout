// Local, on-device history of a shopper's Near-me searches so the page is
// never blank after the first search, and each past search is labelled with
// where it was run. Stored in localStorage; nothing leaves the device.

import type { NearbyStoreResult } from './apiClient'

export interface NearbyHistoryEntry {
  id: string
  capturedAt: string
  countryCode: string
  locationLabel: string
  lat: number
  lon: number
  stores: NearbyStoreResult[]
}

const STORAGE_KEY = 'trolley_scout_nearby_history_v1'
const MAX_ENTRIES = 8

function normalizeCountryCode(countryCode: string | undefined): string {
  const normalized = countryCode?.trim().toUpperCase()
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : 'ZA'
}

function loadAllNearbyHistory(): NearbyHistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((candidate): NearbyHistoryEntry[] => {
      if (!candidate || typeof candidate !== 'object') {
        return []
      }

      const entry = candidate as Partial<NearbyHistoryEntry>
      if (
        typeof entry.id !== 'string' ||
        typeof entry.capturedAt !== 'string' ||
        typeof entry.locationLabel !== 'string' ||
        typeof entry.lat !== 'number' ||
        !Number.isFinite(entry.lat) ||
        typeof entry.lon !== 'number' ||
        !Number.isFinite(entry.lon) ||
        !Array.isArray(entry.stores)
      ) {
        return []
      }

      return [{
        capturedAt: entry.capturedAt,
        countryCode: normalizeCountryCode(entry.countryCode),
        id: entry.id,
        lat: entry.lat,
        locationLabel: entry.locationLabel,
        lon: entry.lon,
        stores: entry.stores,
      }]
    })
  } catch {
    return []
  }
}

export function loadNearbyHistory(countryCode = 'ZA'): NearbyHistoryEntry[] {
  const selectedCountry = normalizeCountryCode(countryCode)
  return loadAllNearbyHistory()
    .filter((entry) => entry.countryCode === selectedCountry)
    .slice(0, MAX_ENTRIES)
}

export function saveNearbyHistorySearch(
  lat: number,
  lon: number,
  stores: NearbyStoreResult[],
  countryCode = 'ZA',
): NearbyHistoryEntry[] {
  const selectedCountry = normalizeCountryCode(countryCode)
  if (typeof localStorage === 'undefined' || stores.length === 0) {
    return loadNearbyHistory(selectedCountry)
  }

  const entry: NearbyHistoryEntry = {
    capturedAt: new Date().toISOString(),
    countryCode: selectedCountry,
    id: `${lat.toFixed(3)}:${lon.toFixed(3)}:${Date.now()}`,
    lat,
    locationLabel: deriveLocationLabel(stores, lat, lon),
    lon,
    stores,
  }

  // Collapse repeat searches from essentially the same spot into the newest.
  const sameSpot = (candidate: NearbyHistoryEntry) =>
    candidate.countryCode === selectedCountry &&
    Math.abs(candidate.lat - lat) < 0.01 &&
    Math.abs(candidate.lon - lon) < 0.01

  const countryCounts = new Map<string, number>()
  const next = [entry, ...loadAllNearbyHistory().filter((candidate) => !sameSpot(candidate))]
    .filter((candidate) => {
      const count = countryCounts.get(candidate.countryCode) ?? 0
      countryCounts.set(candidate.countryCode, count + 1)
      return count < MAX_ENTRIES
    })

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked; the in-memory list still updates.
  }

  return next.filter((candidate) => candidate.countryCode === selectedCountry)
}

export function removeNearbyHistoryEntry(id: string, countryCode = 'ZA'): NearbyHistoryEntry[] {
  const selectedCountry = normalizeCountryCode(countryCode)
  const next = loadAllNearbyHistory().filter((entry) => entry.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best-effort.
  }
  return next.filter((entry) => entry.countryCode === selectedCountry)
}

// A human label for where the search happened, taken from the nearest store's
// address (suburb/town) so the shopper recognises it — no reverse-geocode API.
export function deriveLocationLabel(
  stores: NearbyStoreResult[],
  lat: number,
  lon: number,
): string {
  const withDistance = stores
    .filter((store) => typeof store.distanceM === 'number')
    .sort((left, right) => (left.distanceM ?? Infinity) - (right.distanceM ?? Infinity))
  const nearest = withDistance[0] ?? stores[0]
  const suburb = nearest?.address ? suburbFromAddress(nearest.address) : undefined

  return suburb ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`
}

// Addresses look like "Store, 5th Street, Edenvale, Gauteng, 1609, South
// Africa" — the suburb is usually the segment before the province/postal code.
function suburbFromAddress(address: string): string | undefined {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length < 2) {
    return undefined
  }

  // Skip a leading store-name segment and any pure street segment; prefer the
  // first segment that is not a number and not the country.
  const candidates = parts.slice(1).filter(
    (part) => !/^\d+$/.test(part) && !/south africa/i.test(part) && !/^\d+\s/.test(part),
  )

  return candidates[1] ?? candidates[0] ?? parts[1]
}
