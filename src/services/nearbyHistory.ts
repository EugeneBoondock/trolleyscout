// Local, on-device history of a shopper's Near-me searches so the page is
// never blank after the first search, and each past search is labelled with
// where it was run. Stored in localStorage; nothing leaves the device.

import type { NearbyStoreResult } from './apiClient'

export interface NearbyHistoryEntry {
  id: string
  capturedAt: string
  locationLabel: string
  lat: number
  lon: number
  stores: NearbyStoreResult[]
}

const STORAGE_KEY = 'trolley_scout_nearby_history_v1'
const MAX_ENTRIES = 8

export function loadNearbyHistory(): NearbyHistoryEntry[] {
  if (typeof localStorage === 'undefined') {
    return []
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NearbyHistoryEntry[]) : []
  } catch {
    return []
  }
}

export function saveNearbyHistorySearch(
  lat: number,
  lon: number,
  stores: NearbyStoreResult[],
): NearbyHistoryEntry[] {
  if (typeof localStorage === 'undefined' || stores.length === 0) {
    return loadNearbyHistory()
  }

  const entry: NearbyHistoryEntry = {
    capturedAt: new Date().toISOString(),
    id: `${lat.toFixed(3)}:${lon.toFixed(3)}:${Date.now()}`,
    lat,
    locationLabel: deriveLocationLabel(stores, lat, lon),
    lon,
    stores,
  }

  // Collapse repeat searches from essentially the same spot into the newest.
  const sameSpot = (candidate: NearbyHistoryEntry) =>
    Math.abs(candidate.lat - lat) < 0.01 && Math.abs(candidate.lon - lon) < 0.01

  const next = [entry, ...loadNearbyHistory().filter((candidate) => !sameSpot(candidate))].slice(
    0,
    MAX_ENTRIES,
  )

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked; the in-memory list still updates.
  }

  return next
}

export function removeNearbyHistoryEntry(id: string): NearbyHistoryEntry[] {
  const next = loadNearbyHistory().filter((entry) => entry.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Best-effort.
  }
  return next
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
