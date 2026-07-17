import type { DiscoveredDeal } from '../types'

export interface DealFilterOptions {
  query?: string
  retailerId?: string
  sourceLabel?: string
  imagesOnly?: boolean
  savingsOnly?: boolean
}

export function filterDiscoveryDeals(
  deals: DiscoveredDeal[],
  options: DealFilterOptions,
): DiscoveredDeal[] {
  const query = options.query?.trim().toLowerCase() ?? ''

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

    return matchesQuery && matchesRetailer && matchesSource && matchesImage && matchesSaving
  })
}
