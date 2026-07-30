import { describe, expect, it } from 'vitest'

import type { DiscoveredDeal } from '../../src/types'
import {
  extractPackSizeGrams,
  parseMarketplaceProductQuery,
  rankMarketplaceProductDeals,
} from './marketplaceProductSearch'

function deal(
  id: string,
  title: string,
  priceText: string,
  overrides: Partial<DiscoveredDeal> = {},
): DiscoveredDeal {
  return {
    capturedAt: '2026-07-30T08:00:00.000Z',
    evidenceText: 'Current public Marketplace product.',
    id,
    priceText,
    productUrl: `https://retailer.test/${id}`,
    retailerId: 'food-market',
    retailerName: 'Food Market',
    sourceLabel: 'Food and grocery specials',
    sourceUrl: 'https://retailer.test/specials',
    title,
    ...overrides,
  }
}

describe('parseMarketplaceProductQuery', () => {
  it('understands a cheapest ten-kilo rice request without searching instruction words', () => {
    expect(parseMarketplaceProductQuery('show me the cheapest ten-kilo rice'))
      .toEqual({
        productTerms: ['rice'],
        requestedPackGrams: 10_000,
        requestedPackText: '10 kg',
        sort: 'price-asc',
      })
  })
})

describe('extractPackSizeGrams', () => {
  it.each([
    ['Tastic long grain rice 10kg', 10_000],
    ['Basmati rice 10 kg', 10_000],
    ['Rice ten kilograms', 10_000],
    ['Rice 2 x 5kg value pack', 10_000],
    ['Brown rice 500g', 500],
  ])('reads %s as %i grams', (value, expected) => {
    expect(extractPackSizeGrams(value)).toBe(expected)
  })
})

describe('rankMarketplaceProductDeals', () => {
  it('keeps grocery rice only, prefers exact 10 kg packs, and orders comparable prices', () => {
    const query = parseMarketplaceProductQuery('show me the cheapest ten-kilo rice')
    expect(query).toBeDefined()

    const result = rankMarketplaceProductDeals([
      deal('shoes', 'Ladies fashion shoes', 'R19.99'),
      deal('cooker', 'Digital rice cooker 10kg', 'R99.99'),
      deal('cereal', 'Rice Krispies cereal 600g', 'R59.99'),
      deal('rice-ten-expensive', 'Premium rice 10 kg', 'R229.99'),
      deal('rice-five', 'Long grain rice 5kg', 'R89.99'),
      deal('rice-ten-cheap', 'Parboiled rice 10kg', 'R179.99'),
      deal('sold-out-rice', 'White rice 10kg', 'R149.99', { soldOut: true }),
      deal('unpriced-rice', 'Basmati rice 10kg', 'See retailer'),
    ], query!)

    expect(result.exactPackAvailable).toBe(true)
    expect(result.deals.map((item) => item.id)).toEqual([
      'rice-ten-cheap',
      'rice-ten-expensive',
      'rice-five',
    ])
  })

  it('returns the closest priced rice packs when 10 kg is unavailable', () => {
    const query = parseMarketplaceProductQuery('show me the cheapest ten-kilo rice')
    expect(query).toBeDefined()

    const result = rankMarketplaceProductDeals([
      deal('rice-two', 'Long grain rice 2kg', 'R44.99'),
      deal('rice-five', 'White rice 5kg', 'R94.99'),
      deal('rice-twelve', 'Basmati rice 12.5kg', 'R299.99'),
    ], query!)

    expect(result.exactPackAvailable).toBe(false)
    expect(result.deals.map((item) => item.id)).toEqual([
      'rice-twelve',
      'rice-five',
      'rice-two',
    ])
  })
})
