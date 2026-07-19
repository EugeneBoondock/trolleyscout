import { classifyDeal, type DealCategory, type FoodSubcategory } from './dealCategories'
import type { DiscoveredDeal } from '../types'

export interface DealFilterOptions {
  query?: string
  retailerId?: string
  sourceLabel?: string
  imagesOnly?: boolean
  savingsOnly?: boolean
  category?: DealCategory | 'all'
  foodSubcategory?: FoodSubcategory | 'all'
  // A deal ends before this ISO date (YYYY-MM-DD) is excluded; a deal with no
  // known end date is always kept.
  endsAfter?: string
}

export function filterDiscoveryDeals(
  deals: DiscoveredDeal[],
  options: DealFilterOptions,
): DiscoveredDeal[] {
  const query = options.query?.trim().toLowerCase() ?? ''
  const category = options.category ?? 'all'
  const foodSubcategory = options.foodSubcategory ?? 'all'
  const endsAfter = options.endsAfter?.slice(0, 10)

  return deals.filter((deal) => {
    const matchesQuery =
      !query ||
      deal.title.toLowerCase().includes(query) ||
      deal.retailerName.toLowerCase().includes(query) ||
      deal.sourceLabel.toLowerCase().includes(query)
    const matchesRetailer =
      !options.retailerId || options.retailerId === 'all' || deal.retailerId === options.retailerId
    const matchesSource =
      !options.sourceLabel || options.sourceLabel === 'all' || deal.sourceLabel === options.sourceLabel
    const matchesImage = !options.imagesOnly || Boolean(deal.imageUrl)
    const matchesSaving =
      !options.savingsOnly || Boolean(deal.savingText || deal.previousPriceText)

    let matchesCategory = true

    if (category !== 'all' || foodSubcategory !== 'all') {
      const classification = classifyDeal(deal.title, deal.retailerId, {
        evidenceText: deal.evidenceText,
        retailerName: deal.retailerName,
        sourceLabel: deal.sourceLabel,
        sourceUrl: deal.sourceUrl,
      })
      matchesCategory =
        (category === 'all' || classification.category === category) &&
        (foodSubcategory === 'all' || classification.foodSubcategory === foodSubcategory)
    }

    const matchesExpiry =
      !endsAfter || !deal.validTo || deal.validTo.slice(0, 10) >= endsAfter

    return (
      matchesQuery &&
      matchesRetailer &&
      matchesSource &&
      matchesImage &&
      matchesSaving &&
      matchesCategory &&
      matchesExpiry
    )
  })
}
