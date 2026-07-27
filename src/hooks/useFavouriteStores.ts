import { useCallback, useEffect, useMemo, useState } from 'react'

import { getMemberState, setMemberState } from '../services/apiClient'
import type { DiscoveredStoreGroup } from '../services/storeGroups'

export interface FavouriteStore {
  displayName: string
  id: string
  savedAt: number
}

const LOCAL_KEY = 'ts_favourite_stores_v1'
const REMOTE_KEY = 'favourite_stores_v1'
const MAX_FAVOURITES = 100

function isFavouriteStore(value: unknown): value is FavouriteStore {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FavouriteStore>
  return typeof candidate.id === 'string'
    && candidate.id.length > 0
    && typeof candidate.displayName === 'string'
    && candidate.displayName.length > 0
    && typeof candidate.savedAt === 'number'
}

function readLocal(): FavouriteStore[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter(isFavouriteStore).slice(0, MAX_FAVOURITES) : []
  } catch {
    return []
  }
}

function writeLocal(items: FavouriteStore[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items))
  } catch {
    // The current session keeps its in-memory copy when device storage is unavailable.
  }
}

function mergeFavourites(local: FavouriteStore[], remote: FavouriteStore[]) {
  const merged = new Map<string, FavouriteStore>()
  for (const item of [...local, ...remote]) {
    if (!isFavouriteStore(item)) continue
    const current = merged.get(item.id)
    if (!current || item.savedAt > current.savedAt) merged.set(item.id, item)
  }
  return [...merged.values()]
    .sort((left, right) => right.savedAt - left.savedAt)
    .slice(0, MAX_FAVOURITES)
}

export function useFavouriteStores(isAuthenticated: boolean) {
  const [favourites, setFavourites] = useState<FavouriteStore[]>(() =>
    typeof window === 'undefined' ? [] : readLocal(),
  )
  const favouriteIds = useMemo(
    () => new Set(favourites.map((favourite) => favourite.id)),
    [favourites],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    getMemberState<FavouriteStore[]>(REMOTE_KEY, controller.signal).then((remote) => {
      if (controller.signal.aborted || !Array.isArray(remote)) return
      setFavourites((current) => {
        const merged = mergeFavourites(current, remote)
        writeLocal(merged)
        return merged
      })
    })
    return () => controller.abort()
  }, [isAuthenticated])

  const toggle = useCallback((group: Pick<DiscoveredStoreGroup, 'displayName' | 'id'>) => {
    setFavourites((current) => {
      const exists = current.some((item) => item.id === group.id)
      const next = exists
        ? current.filter((item) => item.id !== group.id)
        : [{
            displayName: group.displayName,
            id: group.id,
            savedAt: Date.now(),
          }, ...current].slice(0, MAX_FAVOURITES)
      writeLocal(next)
      if (isAuthenticated) void setMemberState(REMOTE_KEY, next)
      return next
    })
  }, [isAuthenticated])

  return {
    favouriteCount: favourites.length,
    favouriteIds,
    favourites,
    isFavourite: (id: string) => favouriteIds.has(id),
    toggle,
  }
}
