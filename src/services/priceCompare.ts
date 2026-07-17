// Automatic "what does this item cost at each of these stores" comparison.
// The shopper picks stores we already hold deals for, types an item, and we
// search our own deal database for the cheapest match at each store — no
// typing prices in by hand. Honest about misses: a store with no match is
// reported as "not found", never as free or zero.

import type { DiscoveredDeal } from '../types'

export interface StorePriceMatch {
  retailerId: string
  retailerName: string
  // Undefined when we hold no matching deal for this store right now.
  deal?: DiscoveredDeal
  priceCents?: number
  isCheapest: boolean
}

// Two stores by default because "here or there?" is the common question; the
// shopper can pick a third and beyond.
export const DEFAULT_STORE_COUNT = 2

// Only stores we can actually price against right now, named and sorted.
export function storeOptionsFromDeals(
  deals: DiscoveredDeal[],
): Array<{ id: string; name: string }> {
  const byId = new Map<string, string>()

  for (const deal of deals) {
    if (!byId.has(deal.retailerId)) {
      byId.set(deal.retailerId, deal.retailerName)
    }
  }

  return Array.from(byId.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function defaultStoreIds(deals: DiscoveredDeal[]): string[] {
  return storeOptionsFromDeals(deals)
    .slice(0, DEFAULT_STORE_COUNT)
    .map((store) => store.id)
}

export interface AutoComparison {
  query: string
  matches: StorePriceMatch[]
  cheapestRetailerId?: string
  // Dearest minus cheapest across the stores we actually priced.
  savingsCents: number
  foundCount: number
  missingCount: number
}

// Pulls the first rand amount out of free text: "R24.99", "R 24,99 each",
// "Now R19" all yield cents. Returns undefined when there is no price.
export function extractPriceCents(text: string | undefined): number | undefined {
  if (!text) {
    return undefined
  }

  const match = /R\s*(\d+(?:[.,]\d{1,2})?)/i.exec(text) ?? /(\d+[.,]\d{2})/.exec(text)

  if (!match) {
    return undefined
  }

  const rands = Number.parseFloat(match[1].replace(',', '.'))
  return Number.isFinite(rands) && rands > 0 ? Math.round(rands * 100) : undefined
}

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

// A deal matches when its title carries every meaningful word of the query, so
// "white bread" does not match "bread rolls" but does match "White Bread 700g".
export function dealMatchesQuery(deal: DiscoveredDeal, query: string): boolean {
  const tokens = queryTokens(query)

  if (tokens.length === 0) {
    return false
  }

  const haystack = `${deal.title} ${deal.evidenceText ?? ''}`.toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

// The cheapest priced deal for this query at this retailer, if we hold one.
export function findBestDealForQuery(
  deals: DiscoveredDeal[],
  query: string,
  retailerId: string,
): { deal: DiscoveredDeal; priceCents: number } | undefined {
  let best: { deal: DiscoveredDeal; priceCents: number } | undefined

  for (const deal of deals) {
    if (deal.retailerId !== retailerId || !dealMatchesQuery(deal, query)) {
      continue
    }

    const priceCents = extractPriceCents(deal.priceText)

    if (priceCents === undefined) {
      continue
    }

    if (!best || priceCents < best.priceCents) {
      best = { deal, priceCents }
    }
  }

  return best
}

export function autoComparePrices(
  deals: DiscoveredDeal[],
  query: string,
  retailers: Array<{ id: string; name: string }>,
): AutoComparison {
  const matches: StorePriceMatch[] = retailers.map((retailer) => {
    const best = findBestDealForQuery(deals, query, retailer.id)

    return {
      deal: best?.deal,
      isCheapest: false,
      priceCents: best?.priceCents,
      retailerId: retailer.id,
      retailerName: retailer.name,
    }
  })

  const priced = matches.filter((match) => match.priceCents !== undefined)

  if (priced.length === 0) {
    return {
      cheapestRetailerId: undefined,
      foundCount: 0,
      matches,
      missingCount: matches.length,
      query,
      savingsCents: 0,
    }
  }

  const cheapest = priced.reduce((best, match) =>
    (match.priceCents ?? 0) < (best.priceCents ?? 0) ? match : best,
  )
  const dearest = priced.reduce((worst, match) =>
    (match.priceCents ?? 0) > (worst.priceCents ?? 0) ? match : worst,
  )

  // A lone tie for cheapest is still the cheapest; ties simply both show.
  const cheapestCents = cheapest.priceCents ?? 0

  return {
    cheapestRetailerId: cheapest.retailerId,
    foundCount: priced.length,
    matches: matches.map((match) => ({
      ...match,
      isCheapest: match.priceCents !== undefined && match.priceCents === cheapestCents,
    })),
    missingCount: matches.length - priced.length,
    query,
    savingsCents: (dearest.priceCents ?? 0) - cheapestCents,
  }
}
