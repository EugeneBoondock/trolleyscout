import { describe, expect, it } from 'vitest'
import type { DiscoveredDeal } from '../types'
import { findSimilarDeals } from './similarDeals'

const base = {
  capturedAt: '2026-08-01T08:00:00.000Z',
  evidenceText: 'Official source',
  productUrl: 'https://shop.test/product',
  sourceLabel: 'Weekly offers',
  sourceUrl: 'https://shop.test/offers',
}

describe('findSimilarDeals', () => {
  it('ranks product alternatives ahead of broad category matches', () => {
    const target: DiscoveredDeal = {
      ...base,
      id: 'milk-one',
      retailerId: 'spar',
      retailerName: 'SPAR',
      title: 'Long life full cream milk 6 x 1L',
    }
    const candidates: DiscoveredDeal[] = [
      { ...base, id: 'bread', retailerId: 'spar', retailerName: 'SPAR', title: 'Brown bread loaf' },
      { ...base, id: 'milk-two', retailerId: 'shoprite', retailerName: 'Shoprite', title: 'Full cream long life milk 1L' },
      { ...base, id: 'milk-three', retailerId: 'pnp', retailerName: 'Pick n Pay', title: 'Fresh low fat milk 2L' },
    ]

    expect(findSimilarDeals(target, candidates).map((deal) => deal.id))
      .toEqual(['milk-two', 'milk-three'])
  })

  it('excludes the selected and sold-out deals', () => {
    const target: DiscoveredDeal = {
      ...base,
      id: 'rice-one',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      title: 'Long grain rice 2kg',
    }
    expect(findSimilarDeals(target, [
      target,
      { ...target, id: 'rice-two', retailerId: 'pnp', soldOut: true },
    ])).toEqual([])
  })
})
