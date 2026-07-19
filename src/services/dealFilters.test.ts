import { describe, expect, it } from 'vitest'
import { filterDiscoveryDeals } from './dealFilters'
import type { DiscoveredDeal } from '../types'

const deals: DiscoveredDeal[] = [
  {
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Rice 2kg R29.99',
    id: 'rice',
    imageUrl: 'https://market.test/rice.jpg',
    productUrl: 'https://market.test/rice',
    retailerId: 'frontline',
    retailerName: 'Local Market',
    savingText: 'Save R10',
    sourceLabel: 'Store scout',
    sourceUrl: 'https://market.test/specials',
    title: 'Rice 2kg',
  },
  {
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Milk 2L R34.99',
    id: 'milk',
    productUrl: 'https://shoprite.test/milk',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    sourceLabel: 'Weekly specials',
    sourceUrl: 'https://shoprite.test/specials',
    title: 'Milk 2L',
  },
  {
    capturedAt: '2026-07-16T10:00:00.000Z',
    evidenceText: 'Weekly value pack',
    id: 'metadata-food',
    productUrl: 'https://market.test/value-pack',
    retailerId: 'frontline',
    retailerName: 'Local Market',
    sourceLabel: 'Food and grocery specials',
    sourceUrl: 'https://market.test/groceries',
    title: 'Weekly value pack',
  },
]

describe('filterDiscoveryDeals', () => {
  it('filters text, retailer, source, images, and savings', () => {
    expect(filterDiscoveryDeals(deals, { query: 'rice' }).map((deal) => deal.id)).toEqual(['rice'])
    expect(filterDiscoveryDeals(deals, { retailerId: 'shoprite' }).map((deal) => deal.id)).toEqual(['milk'])
    expect(filterDiscoveryDeals(deals, { sourceLabel: 'Store scout' }).map((deal) => deal.id)).toEqual(['rice'])
    expect(filterDiscoveryDeals(deals, { imagesOnly: true }).map((deal) => deal.id)).toEqual(['rice'])
    expect(filterDiscoveryDeals(deals, { savingsOnly: true }).map((deal) => deal.id)).toEqual(['rice'])
  })

  it('uses source metadata when a title has no product signal', () => {
    expect(filterDiscoveryDeals(deals, { category: 'food' }).map((deal) => deal.id)).toContain(
      'metadata-food',
    )
  })
})
