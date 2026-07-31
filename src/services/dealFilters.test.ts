import { describe, expect, it } from 'vitest'
import {
  createDealSearchIndex,
  filterDiscoveryDeals,
  filterIndexedDiscoveryDeals,
  sortIndexedDiscoveryDeals,
} from './dealFilters'
import * as dealFiltersModule from './dealFilters'
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

  it('hides only deals whose source explicitly says they are sold out', () => {
    const availabilityDeals = [
      deals[0],
      { ...deals[1], id: 'sold-out-milk', soldOut: true },
      deals[2],
    ]

    expect(
      filterDiscoveryDeals(availabilityDeals, { hideSoldOut: true }).map((deal) => deal.id),
    ).toEqual(['rice', 'metadata-food'])
  })

  it('hides auction listings when the shopper does not want bids', () => {
    // BobShop labels English auctions "Current bid", so the figure shown is an
    // opening bid that climbs, not a price anyone can pay today.
    const mixed: DiscoveredDeal[] = [
      { ...deals[0], id: 'plain-rice' },
      { ...deals[1], id: 'camera-auction', unitText: 'Current bid' },
    ]

    expect(
      filterDiscoveryDeals(mixed, { hideBids: true }).map((deal) => deal.id),
    ).toEqual(['plain-rice'])
    expect(
      filterDiscoveryDeals(mixed, {}).map((deal) => deal.id),
    ).toEqual(['plain-rice', 'camera-auction'])
  })

  it('orders by when a deal was first seen, not when it was last rescanned', () => {
    // capturedAt is restamped on every rescan; ordering by it put a fortnight
    // old shelf price above something listed this morning.
    const dated: DiscoveredDeal[] = [
      {
        ...deals[0],
        addedAt: '2026-07-20T08:00:00.000Z',
        capturedAt: '2026-07-31T08:00:00.000Z',
        id: 'old-but-rescanned',
      },
      {
        ...deals[1],
        addedAt: '2026-07-29T08:00:00.000Z',
        capturedAt: '2026-07-29T08:00:00.000Z',
        id: 'genuinely-new',
      },
    ]
    const index = createDealSearchIndex(dated)

    expect(
      filterIndexedDiscoveryDeals(sortIndexedDiscoveryDeals(index, 'newest'), {})
        .map((deal) => deal.id),
    ).toEqual(['genuinely-new', 'old-but-rescanned'])
    expect(
      filterIndexedDiscoveryDeals(sortIndexedDiscoveryDeals(index, 'oldest'), {})
        .map((deal) => deal.id),
    ).toEqual(['old-but-rescanned', 'genuinely-new'])
  })

  it('leaves the incoming order alone for store order', () => {
    const index = createDealSearchIndex(deals)
    expect(sortIndexedDiscoveryDeals(index, 'store')).toBe(index)
  })

  it('reuses indexed category data when the shopper changes the search text', () => {
    const createDealSearchIndex = (
      dealFiltersModule as unknown as Record<string, unknown>
    ).createDealSearchIndex as
      | ((items: DiscoveredDeal[]) => unknown[])
      | undefined
    const filterIndexedDiscoveryDeals = (
      dealFiltersModule as unknown as Record<string, unknown>
    ).filterIndexedDiscoveryDeals as
      | ((items: unknown[], options: { category: string; query: string }) => DiscoveredDeal[])
      | undefined

    expect(createDealSearchIndex).toBeTypeOf('function')
    expect(filterIndexedDiscoveryDeals).toBeTypeOf('function')
    if (!createDealSearchIndex || !filterIndexedDiscoveryDeals) return

    const index = createDealSearchIndex(deals)
    expect(
      filterIndexedDiscoveryDeals(index, { category: 'food', query: 'rice' })
        .map((deal) => deal.id),
    ).toEqual(['rice'])
    expect(
      filterIndexedDiscoveryDeals(index, { category: 'food', query: 'milk' })
        .map((deal) => deal.id),
    ).toEqual(['milk'])
  })
})
