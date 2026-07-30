import { classifyDeal, type DealCategory, type FoodSubcategory } from './dealCategories'
import type { DiscoveredDeal } from '../types'

export interface DealFilterOptions {
  query?: string
  retailerId?: string
  sourceLabel?: string
  imagesOnly?: boolean
  savingsOnly?: boolean
  hideSoldOut?: boolean
  category?: DealCategory | 'all'
  foodSubcategory?: FoodSubcategory | 'all'
  // A deal first seen before this ISO timestamp is excluded. Legacy deals
  // without addedAt fall back to their capture time.
  recentlyAddedAfter?: string
  // A deal ends before this ISO date (YYYY-MM-DD) is excluded; a deal with no
  // known end date is always kept.
  endsAfter?: string
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
  const recentlyAddedAfter = options.recentlyAddedAfter
    ? Date.parse(options.recentlyAddedAfter)
    : undefined

  return indexedDeals
    .filter(({
      addedAtMs,
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
      const matchesCategory =
        (category === 'all' || dealCategory === category) &&
        (foodSubcategory === 'all' || dealFoodSubcategory === foodSubcategory)
      const matchesExpiry =
        !endsAfter || !deal.validTo || deal.validTo.slice(0, 10) >= endsAfter
      const matchesRecentlyAdded =
        recentlyAddedAfter === undefined ||
        (
          Number.isFinite(recentlyAddedAfter) &&
          Number.isFinite(addedAtMs) &&
          addedAtMs >= recentlyAddedAfter
        )

      return (
        matchesQuery &&
        matchesRetailer &&
        matchesSource &&
        matchesImage &&
        matchesSaving &&
        matchesAvailability &&
        matchesCategory &&
        matchesExpiry &&
        matchesRecentlyAdded
      )
    })
    .map(({ deal }) => deal)
}

export function filterDiscoveryDeals(
  deals: DiscoveredDeal[],
  options: DealFilterOptions,
): DiscoveredDeal[] {
  return filterIndexedDiscoveryDeals(createDealSearchIndex(deals), options)
}
