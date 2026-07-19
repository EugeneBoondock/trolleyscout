import { useCallback, useEffect, useRef, useState } from 'react'
import { getMemberState, setMemberState } from '../services/apiClient'
import type { PropertyListing } from '../types'

// A favourited listing is just the listing snapshot plus when it was saved, so
// the Saved view keeps working even after the deal disappears from the portals.
export type SavedProperty = PropertyListing & { savedAt: number }

const LOCAL_KEY = 'ts_saved_properties_v1'
const REMOTE_KEY = 'saved_properties_v1' // must match /api/member-state key rule
const MAX_SAVED = 120

function keyOf(listing: Pick<PropertyListing, 'portal' | 'id'>): string {
  return `${listing.portal}:${listing.id}`
}

function readLocal(): SavedProperty[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedProperty[]) : []
  } catch {
    return []
  }
}

function writeLocal(items: SavedProperty[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
  } catch {
    // storage full / disabled — the in-memory copy still works this session.
  }
}

function mergeByKey(a: SavedProperty[], b: SavedProperty[]): SavedProperty[] {
  const map = new Map<string, SavedProperty>()
  for (const item of [...a, ...b]) {
    if (!item || !item.portal || !item.id) continue
    const k = keyOf(item)
    const existing = map.get(k)
    // Keep the most recently saved snapshot.
    if (!existing || (item.savedAt ?? 0) > (existing.savedAt ?? 0)) map.set(k, item)
  }
  return [...map.values()].sort((x, y) => (y.savedAt ?? 0) - (x.savedAt ?? 0)).slice(0, MAX_SAVED)
}

/**
 * Saved / favourited properties. localStorage is the instant source of truth;
 * when the shopper is signed in we merge with and push to their account state so
 * favourites follow them across devices.
 */
export function useSavedProperties(isAuthenticated: boolean) {
  const [saved, setSaved] = useState<SavedProperty[]>(() =>
    typeof window === 'undefined' ? [] : readLocal(),
  )
  const savedKeys = new Set(saved.map(keyOf))
  // Keep the latest list in a ref so the debounced remote push isn't stale.
  const latest = useRef(saved)
  latest.current = saved

  // On login, pull the account's saved list and merge it in (server + local).
  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    const controller = new AbortController()
    getMemberState<SavedProperty[]>(REMOTE_KEY, controller.signal).then((remote) => {
      if (cancelled || !Array.isArray(remote) || remote.length === 0) return
      setSaved((current) => {
        const merged = mergeByKey(current, remote)
        writeLocal(merged)
        return merged
      })
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [isAuthenticated])

  const persist = useCallback(
    (next: SavedProperty[]) => {
      writeLocal(next)
      if (isAuthenticated) void setMemberState(REMOTE_KEY, next)
    },
    [isAuthenticated],
  )

  const toggle = useCallback(
    (listing: PropertyListing) => {
      setSaved((current) => {
        const k = keyOf(listing)
        const exists = current.some((item) => keyOf(item) === k)
        const next = exists
          ? current.filter((item) => keyOf(item) !== k)
          : [{ ...listing, savedAt: Date.now() }, ...current].slice(0, MAX_SAVED)
        persist(next)
        return next
      })
    },
    [persist],
  )

  const isSaved = useCallback((listing: Pick<PropertyListing, 'portal' | 'id'>) => savedKeys.has(keyOf(listing)), [savedKeys])

  return { saved, savedCount: saved.length, isSaved, toggle }
}
