import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addBasketItemForMember,
  readMemberState,
  saveDealForMember,
  setMemberState,
} from '../services/apiClient'
import {
  SCOUT_CART_LOCAL_KEY,
  SCOUT_CART_STATE_KEY,
  addCartItem,
  cartItemToDealDraft,
  parseScoutCart,
  removeCartItem,
  summarizeCart,
  type ScoutCartItem,
  type ScoutCartSummary,
} from '../services/scoutCart'
import type { ScoutChatDealCard } from '../types'

export interface UseScoutCart {
  add: (card: ScoutChatDealCard) => void
  clear: () => void
  /** Moves lines into the app's real basket. Omit retailerName for all of them. */
  moveToBasket: (retailerName?: string) => Promise<{ moved: number; failed: number }>
  isMoving: boolean
  items: ScoutCartItem[]
  remove: (productUrl: string) => void
  summary: ScoutCartSummary
}

/**
 * The Mr Scout cart, persisted per shopper so a list built on the couch is
 * still there in the shop. Account state is the source of truth; local
 * storage keeps it available before that request lands and when signed out.
 */
export function useScoutCart(): UseScoutCart {
  const [items, setItems] = useState<ScoutCartItem[]>(() => readLocalCart())
  const [isMoving, setIsMoving] = useState(false)
  const hasLoaded = useRef(false)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    const controller = new AbortController()

    readMemberState<unknown>(SCOUT_CART_STATE_KEY, controller.signal)
      .then((remote) => {
        if (controller.signal.aborted) return
        const stored = parseScoutCart(remote.value)
        // An empty account cart never wipes a list built while signed out.
        if (stored.length > 0) setItems(stored)
        hasLoaded.current = true
      })
      .catch(() => {
        hasLoaded.current = true
      })

    return () => controller.abort()
  }, [])

  const persist = useCallback((next: ScoutCartItem[]) => {
    writeLocalCart(next)
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => setMemberState(SCOUT_CART_STATE_KEY, next))
      .then(() => undefined)
  }, [])

  const update = useCallback((change: (current: ScoutCartItem[]) => ScoutCartItem[]) => {
    setItems((current) => {
      const next = change(current)
      persist(next)
      return next
    })
  }, [persist])

  const add = useCallback((card: ScoutChatDealCard) => {
    update((current) => addCartItem(current, card))
  }, [update])

  const remove = useCallback((productUrl: string) => {
    update((current) => removeCartItem(current, productUrl))
  }, [update])

  const clear = useCallback(() => update(() => []), [update])

  const moveToBasket = useCallback(async (retailerName?: string) => {
    setIsMoving(true)
    const moving = retailerName
      ? items.filter((item) => item.retailerName === retailerName)
      : items
    let moved = 0
    let failed = 0

    for (const item of moving) {
      try {
        // The basket is keyed on saved deals, so each line is saved first.
        const saved = await saveDealForMember(cartItemToDealDraft(item))
        const savedDealId = savedDealIdFor(saved.data, item.productUrl)
        if (!savedDealId) {
          failed += 1
          continue
        }
        const added = await addBasketItemForMember({ savedDealId })
        if (added.status === 'ready') moved += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }

    // Only what actually landed leaves the cart, so a failure stays visible.
    if (moved > 0) {
      const movedUrls = new Set(moving.slice(0, moved).map((item) => item.productUrl))
      update((current) => current.filter((item) => !movedUrls.has(item.productUrl)))
    }
    setIsMoving(false)
    return { failed, moved }
  }, [items, update])

  const summary = useMemo(() => summarizeCart(items), [items])

  return { add, clear, isMoving, items, moveToBasket, remove, summary }
}

function savedDealIdFor(data: unknown, productUrl: string): string | undefined {
  if (data === null || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>

  const direct = record.savedDeal
  if (direct !== null && typeof direct === 'object') {
    const id = (direct as Record<string, unknown>).id
    if (typeof id === 'string') return id
  }

  const list = Array.isArray(record.savedDeals) ? record.savedDeals : []
  for (const entry of list) {
    if (entry === null || typeof entry !== 'object') continue
    const saved = entry as Record<string, unknown>
    if (saved.productUrl === productUrl && typeof saved.id === 'string') return saved.id
  }
  return undefined
}

function readLocalCart(): ScoutCartItem[] {
  try {
    const raw = globalThis.localStorage?.getItem(SCOUT_CART_LOCAL_KEY)
    return raw ? parseScoutCart(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function writeLocalCart(items: readonly ScoutCartItem[]): void {
  try {
    globalThis.localStorage?.setItem(SCOUT_CART_LOCAL_KEY, JSON.stringify(items))
  } catch {
    // A full or blocked store must never break the conversation.
  }
}
