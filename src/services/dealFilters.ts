import { classifyDeal, type DealCategory, type FoodSubcategory } from './dealCategories'
import type { DiscoveredDeal } from '../types'

export interface DealFilterOptions {
  query?: string
  retailerId?: string
  sourceLabel?: string
  imagesOnly?: boolean
  savingsOnly?: boolean
  hideSoldOut?: boolean
  // Auction listings, which advertise an opening bid rather than a price.
  hideBids?: boolean
  category?: DealCategory | 'all'
  foodSubcategory?: FoodSubcategory | 'all'
  // A deal ends before this ISO date (YYYY-MM-DD) is excluded; a deal with no
  // known end date is always kept.
  endsAfter?: string
}

export type DealSortOrder = 'newest' | 'oldest' | 'store'

/**
 * An auction listing rather than a price. BobShop runs English auctions and
 * labels them "Current bid", so the figure shown is an opening bid that climbs
 * until the auction closes — not what the shopper would pay.
 */
export function isBidDeal(deal: Pick<DiscoveredDeal, 'unitText'>): boolean {
  return Boolean(deal.unitText && /bid/i.test(deal.unitText))
}

export interface IndexedDiscoveryDeal {
  addedAtMs: number
  category: DealCategory
  deal: DiscoveredDeal
  foodSubcategory?: FoodSubcategory
  searchText: string
}

export function createDealSearchIndex(
  deals: DiscoveredDeal[],
): IndexedDiscoveryDeal[] {
  return deals.map((deal) => {
    const classification = classifyDeal(deal.title, deal.retailerId, {
      evidenceText: deal.evidenceText,
      retailerName: deal.retailerName,
      sourceLabel: deal.sourceLabel,
      sourceUrl: deal.sourceUrl,
    })
    return {
      ...classification,
      addedAtMs: Date.parse(deal.addedAt ?? deal.capturedAt),
      deal,
      searchText: [
        deal.title,
        deal.retailerName,
        deal.sourceLabel,
      ].join(' ').normalize('NFKC').toLowerCase(),
    }
  })
}

export function filterIndexedDiscoveryDeals(
  indexedDeals: IndexedDiscoveryDeal[],
  options: DealFilterOptions,
): DiscoveredDeal[] {
  const query = options.query?.normalize('NFKC').trim().toLowerCase() ?? ''
  const category = options.category ?? 'all'
  const foodSubcategory = options.foodSubcategory ?? 'all'
  const endsAfter = options.endsAfter?.slice(0, 10)

  return indexedDeals
    .filter(({
      category: dealCategory,
      deal,
      foodSubcategory: dealFoodSubcategory,
      searchText,
    }) => {
      const matchesQuery = !query || searchText.includes(query)
      const matchesRetailer =
        !options.retailerId ||
        options.retailerId === 'all' ||
        deal.retailerId === options.retailerId
      const matchesSource =
        !options.sourceLabel ||
        options.sourceLabel === 'all' ||
        deal.sourceLabel === options.sourceLabel
      const matchesImage = !options.imagesOnly || Boolean(deal.imageUrl)
      const matchesSaving =
        !options.savingsOnly || Boolean(deal.savingText || deal.previousPriceText)
      const matchesAvailability = !options.hideSoldOut || !deal.soldOut
      const matchesBidPreference = !options.hideBids || !isBidDeal(deal)
      const matchesCategory =
        (category === 'all' || dealCategory === category) &&
        (foodSubcategory === 'all' || dealFoodSubcategory === foodSubcategory)
      const matchesExpiry =
        !endsAfter || !deal.validTo || deal.validTo.slice(0, 10) >= endsAfter
      return (
        matchesQuery &&
        matchesRetailer &&
        matchesSource &&
        matchesImage &&
        matchesSaving &&
        matchesAvailability &&
        matchesBidPreference &&
        matchesCategory &&
        matchesExpiry
      )
    })
    .map(({ deal }) => deal)
}

/**
 * Orders deals by when we first saw them. `capturedAt` is restamped on every
 * rescan, so it says when we last looked rather than when the deal appeared —
 * the index keeps `addedAt` for exactly this.
 */
export function sortIndexedDiscoveryDeals(
  indexedDeals: IndexedDiscoveryDeal[],
  order: DealSortOrder,
): IndexedDiscoveryDeal[] {
  if (order === 'store') return indexedDeals

  return [...indexedDeals].sort((left, right) => {
    const leftAt = Number.isFinite(left.addedAtMs) ? left.addedAtMs : undefined
    const rightAt = Number.isFinite(right.addedAtMs) ? right.addedAtMs : undefined
    // A deal with no date is neither newest nor oldest — it sorts last either
    // way rather than winning by absence.
    if (leftAt === undefined && rightAt === undefined) return 0
    if (leftAt === undefined) return 1
    if (rightAt === undefined) return -1
    return order === 'newest' ? rightAt - leftAt : leftAt - rightAt
  })
}

export function filterDiscoveryDeals(
  deals: DiscoveredDeal[],
  options: DealFilterOptions,
): DiscoveredDeal[] {
  return filterIndexedDiscoveryDeals(createDealSearchIndex(deals), options)
}
