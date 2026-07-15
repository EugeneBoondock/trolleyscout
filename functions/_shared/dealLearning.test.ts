import { describe, expect, it } from 'vitest'
import type { DiscoveredDeal } from '../../src/types'
import {
  buildActivitySignals,
  normalizeSearchTerm,
  rankDealsForMember,
} from './dealLearning'

const deals: DiscoveredDeal[] = [
  {
    capturedAt: '2026-07-15T00:00:00.000Z',
    evidenceText: 'Official product price.',
    id: 'tea-deal',
    priceText: 'R39.99',
    productUrl: 'https://example.com/tea',
    retailerId: 'checkers',
    retailerName: 'Checkers',
    sourceLabel: 'Specials',
    sourceUrl: 'https://example.com/specials',
    title: 'Five Roses Tea 100 bags',
  },
  {
    capturedAt: '2026-07-15T00:00:00.000Z',
    evidenceText: 'Official product price.',
    id: 'coffee-deal',
    priceText: 'R89.99',
    productUrl: 'https://example.com/coffee',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    sourceLabel: 'Specials',
    sourceUrl: 'https://example.com/specials',
    title: 'Ricoffy Instant Coffee 750g',
  },
]

describe('dealLearning', () => {
  it('normalizes a submitted search into safe compact text', () => {
    expect(normalizeSearchTerm('  COFFEE!!!   750g ')).toBe('coffee 750g')
    expect(normalizeSearchTerm('ab')).toBeUndefined()
    expect(normalizeSearchTerm('x'.repeat(120))).toHaveLength(80)
  })

  it('gives saved and basket actions more weight than a search', () => {
    const search = buildActivitySignals({ eventType: 'search_submitted', term: 'instant coffee' })
    const saved = buildActivitySignals({
      eventType: 'deal_saved',
      retailerId: 'shoprite',
      title: 'Ricoffy Instant Coffee 750g',
    })
    const basket = buildActivitySignals({
      eventType: 'basket_added',
      retailerId: 'shoprite',
      title: 'Ricoffy Instant Coffee 750g',
    })

    expect(Math.max(...search.map((signal) => signal.weight))).toBeLessThan(
      Math.max(...saved.map((signal) => signal.weight)),
    )
    expect(Math.max(...saved.map((signal) => signal.weight))).toBeLessThan(
      Math.max(...basket.map((signal) => signal.weight)),
    )
  })

  it('moves matching deals first and explains the strongest reason', () => {
    const ranked = rankDealsForMember(deals, [
      { interestKey: 'coffee', interestType: 'term', weight: 8 },
      { interestKey: 'shoprite', interestType: 'retailer', weight: 3 },
    ])

    expect(ranked.map((deal) => deal.id)).toEqual(['coffee-deal', 'tea-deal'])
    expect(ranked[0].personalizationReason).toBe('Based on your coffee interest')
    expect(ranked[1].personalizationReason).toBeUndefined()
  })

  it('keeps the source order when no interests match', () => {
    expect(rankDealsForMember(deals, [])).toEqual(deals)
  })
})
