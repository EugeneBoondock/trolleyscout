// Pure "which shop is cheapest for my list" comparison. The shopper types a
// few items and each shop's price for them; this works out each shop's total,
// flags the cheapest per item, and the cheapest shop overall. No promotions
// required — it is a plain price comparison the shopper discards afterwards.

export interface CompareItemDraft {
  id: string
  name: string
  // Aligned to the shops array; undefined means "not priced at that shop".
  priceCents: Array<number | undefined>
}

export interface ShopTotal {
  shopIndex: number
  totalCents: number
  pricedItemCount: number
  missingItemCount: number
}

export interface ShopComparison {
  shopTotals: ShopTotal[]
  // Index into shops of the cheapest complete basket, or the cheapest overall
  // when no shop has priced every item.
  cheapestShopIndex?: number
  // Best - cheapest total across the compared shops, in cents.
  savingsCents: number
  // For each item (by draft order): the shop index with the lowest price, or
  // undefined if the item is priced nowhere or tied everywhere.
  cheapestShopByItem: Array<number | undefined>
  hasCompleteShop: boolean
}

export function compareShops(items: CompareItemDraft[], shopCount: number): ShopComparison {
  const priced = items.filter((item) => item.priceCents.some((cents) => cents !== undefined))

  const shopTotals: ShopTotal[] = Array.from({ length: shopCount }, (_, shopIndex) => {
    let totalCents = 0
    let pricedItemCount = 0

    for (const item of priced) {
      const cents = item.priceCents[shopIndex]
      if (cents !== undefined) {
        totalCents += cents
        pricedItemCount += 1
      }
    }

    return {
      missingItemCount: priced.length - pricedItemCount,
      pricedItemCount,
      shopIndex,
      totalCents,
    }
  })

  const cheapestShopByItem = priced.map((item) => cheapestIndex(item.priceCents))

  // A shop is "complete" when it has a price for every priced item.
  const completeShops = shopTotals.filter(
    (shop) => priced.length > 0 && shop.missingItemCount === 0,
  )
  const hasCompleteShop = completeShops.length > 0
  const candidates = hasCompleteShop
    ? completeShops
    : shopTotals.filter((shop) => shop.pricedItemCount > 0)

  if (candidates.length === 0) {
    return {
      cheapestShopByItem,
      hasCompleteShop: false,
      savingsCents: 0,
      shopTotals,
    }
  }

  const cheapest = candidates.reduce((best, shop) => (shop.totalCents < best.totalCents ? shop : best))
  const dearest = candidates.reduce((worst, shop) => (shop.totalCents > worst.totalCents ? shop : worst))

  return {
    cheapestShopByItem,
    cheapestShopIndex: cheapest.shopIndex,
    hasCompleteShop,
    savingsCents: dearest.totalCents - cheapest.totalCents,
    shopTotals,
  }
}

function cheapestIndex(prices: Array<number | undefined>): number | undefined {
  let bestIndex: number | undefined
  let bestValue = Infinity
  let tie = false

  prices.forEach((cents, index) => {
    if (cents === undefined) {
      return
    }
    if (cents < bestValue) {
      bestValue = cents
      bestIndex = index
      tie = false
    } else if (cents === bestValue) {
      tie = true
    }
  })

  return tie ? undefined : bestIndex
}

// Parses "R24,99" / "24.99" / "19" into whole cents; empty/invalid → undefined.
export function parsePriceInput(text: string): number | undefined {
  const cleaned = text.replace(/[rR\s]/g, '').replace(',', '.').trim()

  if (!cleaned || !/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return undefined
  }

  const rands = Number.parseFloat(cleaned)
  return Number.isFinite(rands) && rands > 0 ? Math.round(rands * 100) : undefined
}

export function formatCents(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`
}
