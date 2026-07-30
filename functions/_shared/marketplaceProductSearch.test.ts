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

  it.each([
    [
      'Ok find some chicken for me',
      { productTerms: ['chicken'], sort: 'relevance' },
    ],
    [
      'Find me some cheap spaghetti',
      { productTerms: ['spaghetti'], sort: 'price-asc' },
    ],
    [
      'Could you please show me affordable chicken deals under R100?',
      { productTerms: ['chicken'], sort: 'price-asc' },
    ],
    [
      'I would like the lowest priced fresh chicken',
      { productTerms: ['fresh', 'chicken'], sort: 'price-asc' },
    ],
    [
      'Do you have any spaghetti specials?',
      { productTerms: ['spaghetti'], sort: 'relevance' },
    ],
    [
      'Show me some baked beans',
      { productTerms: ['baked', 'beans'], sort: 'relevance' },
    ],
  ])('extracts product intent from “%s”', (message, expected) => {
    expect(parseMarketplaceProductQuery(message)).toEqual(expected)
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

  it('keeps food spaghetti ahead of non-food Marketplace title matches', () => {
    const query = parseMarketplaceProductQuery('Find me some cheap spaghetti')
    expect(query).toBeDefined()

    const result = rankMarketplaceProductDeals([
      deal('spaghetti-expensive', 'Fatti’s & Moni’s Spaghetti 500g', 'R24.99'),
      deal('spoon', 'Stainless Steel Spaghetti Spoon', 'R19.99'),
      deal('sports-bra', 'Sports Bra Spaghetti Strap', 'R9.99'),
      deal('spaghetti-cheap', 'No Name Pasta Spaghetti 500g', 'R18.99'),
      deal('shirt', 'Men’s Graphics Spaghetti T-shirt', 'R14.99'),
    ], query!)

    expect(result.deals.map((item) => item.id)).toEqual([
      'spaghetti-cheap',
      'spaghetti-expensive',
    ])
  })

  it('keeps chicken food and removes pet or toy title matches', () => {
    const query = parseMarketplaceProductQuery('Ok find some chicken for me')
    expect(query).toBeDefined()

    const result = rankMarketplaceProductDeals([
      deal('pet-food', 'Chicken Flavour Adult Dog Food 8kg', 'R99.99'),
      deal('whole-chicken', 'Fresh Whole Chicken 1.4kg', 'R89.99'),
      deal('toy', 'Plush Chicken Toy', 'R49.99'),
      deal('drumsticks', 'Fresh Chicken Drumsticks 1kg', 'R69.99'),
    ], query!)

    expect(result.deals.map((item) => item.id)).toEqual([
      'whole-chicken',
      'drumsticks',
    ])
  })

  it('does not block an accessory when the shopper explicitly requests it', () => {
    const query = parseMarketplaceProductQuery('Show me a rice cooker')
    expect(query).toBeDefined()

    const result = rankMarketplaceProductDeals([
      deal('cooker', 'Digital Rice Cooker 1.8L', 'R499.99'),
      deal('rice', 'Long Grain Rice 2kg', 'R39.99'),
    ], query!)

    expect(result.deals.map((item) => item.id)).toEqual(['cooker'])
  })
})
