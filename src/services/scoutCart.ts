/**
 * The cart Mr Scout fills during a conversation.
 *
 * Deliberately separate from the app's real basket: a shopper asking "what
 * would a braai cost me" is thinking out loud, and half of what they gather
 * gets discarded before they commit to anything. They collect here, then move
 * the survivors across in one action.
 */

import type { DiscoveredDeal, ScoutChatDealCard } from '../types'

export const SCOUT_CART_STATE_KEY = 'scout_cart_v1'
export const SCOUT_CART_LOCAL_KEY = 'ts_scout_cart_v1'

const MAX_CART_ITEMS = 50

export interface ScoutCartItem {
  addedAt: string
  imageUrl?: string
  previousPriceText?: string
  priceCents?: number
  priceText: string
  productUrl: string
  retailerName: string
  savingText?: string
  title: string
}

export interface ScoutCartStoreGroup {
  itemCount: number
  items: ScoutCartItem[]
  retailerName: string
  /** Undefined when any item in the group has no readable price. */
  totalCents?: number
}

export interface ScoutCartSummary {
  groups: ScoutCartStoreGroup[]
  itemCount: number
  /** Items whose price could not be read, so a total would be a lie. */
  unpricedCount: number
  totalCents: number
}

/**
 * The product URL is the identity. The same television offered by the same
 * shop is one cart line however many times Mr Scout mentions it.
 */
export function cartItemKey(item: Pick<ScoutCartItem, 'productUrl'>): string {
  return item.productUrl
}

export function addCartItem(
  items: readonly ScoutCartItem[],
  card: ScoutChatDealCard,
  addedAt = new Date().toISOString(),
): ScoutCartItem[] {
  const item: ScoutCartItem = {
    addedAt,
    imageUrl: card.imageUrl,
    previousPriceText: card.previousPriceText,
    priceCents: parsePriceCents(card.priceText),
    priceText: card.priceText,
    productUrl: card.productUrl,
    retailerName: card.retailerName,
    savingText: card.savingText,
    title: card.title,
  }

  const existing = items.findIndex((entry) => cartItemKey(entry) === cartItemKey(item))
  if (existing >= 0) {
    // Re-adding refreshes the price rather than stacking a duplicate line.
    return items.map((entry, index) => (index === existing ? item : entry))
  }
  return [...items, item].slice(-MAX_CART_ITEMS)
}

export function removeCartItem(
  items: readonly ScoutCartItem[],
  productUrl: string,
): ScoutCartItem[] {
  return items.filter((item) => item.productUrl !== productUrl)
}

export function isInCart(items: readonly ScoutCartItem[], productUrl: string): boolean {
  return items.some((item) => item.productUrl === productUrl)
}

/**
 * Totals per shop, so a shopper can decide to take everything from Takealot
 * without committing to the Makro half of the list.
 */
export function summarizeCart(items: readonly ScoutCartItem[]): ScoutCartSummary {
  const byRetailer = new Map<string, ScoutCartItem[]>()
  for (const item of items) {
    byRetailer.set(item.retailerName, [...(byRetailer.get(item.retailerName) ?? []), item])
  }

  const groups = [...byRetailer.entries()]
    .map(([retailerName, groupItems]): ScoutCartStoreGroup => ({
      itemCount: groupItems.length,
      items: groupItems,
      retailerName,
      totalCents: groupItems.every((item) => item.priceCents !== undefined)
        ? groupItems.reduce((total, item) => total + (item.priceCents ?? 0), 0)
        : undefined,
    }))
    .sort((left, right) => left.retailerName.localeCompare(right.retailerName))

  return {
    groups,
    itemCount: items.length,
    totalCents: items.reduce((total, item) => total + (item.priceCents ?? 0), 0),
    unpricedCount: items.filter((item) => item.priceCents === undefined).length,
  }
}

/** A cart line as the saved-deal shape the real basket is built from. */
export function cartItemToDealDraft(item: ScoutCartItem): DiscoveredDeal {
  return {
    capturedAt: item.addedAt,
    evidenceText: `Added from a Mr Scout conversation. ${item.priceText}`,
    id: `scout-cart:${item.productUrl}`,
    imageUrl: item.imageUrl,
    previousPriceText: item.previousPriceText,
    priceText: item.priceText,
    productUrl: item.productUrl,
    retailerId: retailerIdFromName(item.retailerName),
    retailerName: item.retailerName,
    savingText: item.savingText,
    sourceLabel: 'Mr Scout',
    sourceUrl: item.productUrl,
    title: item.title,
  }
}

export function parseScoutCart(value: unknown): ScoutCartItem[] {
  if (!Array.isArray(value)) return []
  const items: ScoutCartItem[] = []

  for (const entry of value.slice(0, MAX_CART_ITEMS)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const productUrl = httpsUrl(record.productUrl)
    const title = text(record.title, 200)
    const priceText = text(record.priceText, 60)
    if (!productUrl || !title || !priceText) continue

    items.push({
      addedAt: text(record.addedAt, 40) ?? new Date().toISOString(),
      imageUrl: httpsUrl(record.imageUrl),
      previousPriceText: text(record.previousPriceText, 60),
      priceCents: typeof record.priceCents === 'number' && Number.isFinite(record.priceCents)
        ? record.priceCents
        : parsePriceCents(priceText),
      priceText,
      productUrl,
      retailerName: text(record.retailerName, 80) ?? 'Store',
      savingText: text(record.savingText, 120),
      title,
    })
  }

  return items
}

/** "R6 099.00" and "R6099" are the same money. */
export function parsePriceCents(priceText: string): number | undefined {
  const cleaned = priceText.replace(/[\s ]/g, '')
  const match = /(\d+(?:[.,]\d{1,2})?)/.exec(cleaned.replace(/(\d)[,.](\d{3})\b/g, '$1$2'))
  if (!match) return undefined
  const amount = Number(match[1].replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function retailerIdFromName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, limit)
  return trimmed || undefined
}

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
