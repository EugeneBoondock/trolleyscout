import { describe, expect, it } from 'vitest'

import type { DiscoveredDeal } from '../types'
import { topSavingsDeals } from './topSavings'

function deal(overrides: Partial<DiscoveredDeal>): DiscoveredDeal {
  return {
    capturedAt: '2026-07-22T08:00:00.000Z',
    evidenceText: '{}',
    id: 'deal',
    productUrl: 'https://retailer.test/p/1',
    retailerId: 'checkers',
    retailerName: 'Checkers',
    sourceLabel: 'Feed',
    sourceUrl: 'https://retailer.test/specials',
    title: 'Deal',
    ...overrides,
  }
}

describe('topSavingsDeals', () => {
  it('ranks by real rand saving and drops deals without a meaningful was-price', () => {
    const picks = topSavingsDeals([
      deal({ id: 'small', priceText: 'R90', previousPriceText: 'R100' }),
      deal({ id: 'none', priceText: 'R50' }),
      deal({ id: 'zero-was', priceText: 'R10.99', previousPriceText: 'R0.00' }),
      deal({ id: 'big', priceText: 'R200', previousPriceText: 'R350' }),
      deal({ id: 'medium', priceText: 'R80', previousPriceText: 'R130' }),
    ])

    expect(picks.map((pick) => pick.id)).toEqual(['big', 'medium', 'small'])
  })

  it('returns an empty list when nothing has a real saving', () => {
    expect(topSavingsDeals([deal({ priceText: 'R50' })])).toEqual([])
  })
})
