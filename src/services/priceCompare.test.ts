import { describe, expect, test } from 'vitest'
import {
  autoComparePrices,
  dealMatchesQuery,
  defaultStoreIds,
  extractPriceCents,
  findBestDealForQuery,
  storeOptionsFromDeals,
} from './priceCompare'
import type { DiscoveredDeal } from '../types'

function deal(overrides: Partial<DiscoveredDeal> & { title: string; retailerId: string }): DiscoveredDeal {
  return {
    capturedAt: '2026-07-17T10:00:00.000Z',
    evidenceText: '',
    id: `${overrides.retailerId}-${overrides.title}`,
    productUrl: 'https://example.co.za/p',
    retailerName: overrides.retailerId,
    sourceLabel: 'Test',
    sourceUrl: 'https://example.co.za',
    ...overrides,
  } as DiscoveredDeal
}

const RETAILERS = [
  { id: 'checkers', name: 'Checkers' },
  { id: 'shoprite', name: 'Shoprite' },
  { id: 'woolworths', name: 'Woolworths' },
]

describe('store options', () => {
  const deals = [
    deal({ retailerId: 'woolworths', retailerName: 'Woolworths', title: 'Bread' }),
    deal({ retailerId: 'checkers', retailerName: 'Checkers', title: 'Bread' }),
    deal({ retailerId: 'checkers', retailerName: 'Checkers', title: 'Milk' }),
    deal({ retailerId: 'boxer', retailerName: 'Boxer', title: 'Rice' }),
  ]

  test('lists each store we hold deals for once, sorted by name', () => {
    expect(storeOptionsFromDeals(deals)).toEqual([
      { id: 'boxer', name: 'Boxer' },
      { id: 'checkers', name: 'Checkers' },
      { id: 'woolworths', name: 'Woolworths' },
    ])
  })

  test('defaults to the first two stores', () => {
    expect(defaultStoreIds(deals)).toEqual(['boxer', 'checkers'])
  })

  test('has no defaults when we hold no deals', () => {
    expect(defaultStoreIds([])).toEqual([])
    expect(storeOptionsFromDeals([])).toEqual([])
  })
})

describe('extractPriceCents', () => {
  test('reads rand amounts out of free text', () => {
    expect(extractPriceCents('R24.99')).toBe(2499)
    expect(extractPriceCents('R 24,99 each')).toBe(2499)
    expect(extractPriceCents('Now R19')).toBe(1900)
    expect(extractPriceCents('19.50')).toBe(1950)
  })

  test('returns undefined when there is no usable price', () => {
    expect(extractPriceCents(undefined)).toBeUndefined()
    expect(extractPriceCents('Buy one get one free')).toBeUndefined()
    expect(extractPriceCents('R0')).toBeUndefined()
  })
})

describe('dealMatchesQuery', () => {
  test('requires every meaningful word of the query', () => {
    const white = deal({ retailerId: 'checkers', title: 'Albany White Bread 700g' })

    expect(dealMatchesQuery(white, 'white bread')).toBe(true)
    expect(dealMatchesQuery(white, 'brown bread')).toBe(false)
  })

  test('ignores punctuation and casing, and matches evidence text', () => {
    const milk = deal({
      evidenceText: 'Clover Full Cream',
      retailerId: 'shoprite',
      title: 'Milk 2L',
    })

    expect(dealMatchesQuery(milk, 'MILK, 2L')).toBe(true)
    expect(dealMatchesQuery(milk, 'clover milk')).toBe(true)
  })

  test('an empty query matches nothing', () => {
    expect(dealMatchesQuery(deal({ retailerId: 'checkers', title: 'Bread' }), '  ')).toBe(false)
  })
})

describe('findBestDealForQuery', () => {
  test('picks the cheapest priced match at that retailer only', () => {
    const deals = [
      deal({ priceText: 'R21.99', retailerId: 'checkers', title: 'White Bread 700g' }),
      deal({ priceText: 'R17.99', retailerId: 'checkers', title: 'White Bread 700g value' }),
      deal({ priceText: 'R12.99', retailerId: 'shoprite', title: 'White Bread 700g' }),
    ]

    const best = findBestDealForQuery(deals, 'white bread', 'checkers')

    expect(best?.priceCents).toBe(1799)
  })

  test('skips matches that carry no readable price', () => {
    const deals = [
      deal({ retailerId: 'checkers', savingText: 'Free', title: 'White Bread 700g' }),
      deal({ priceText: 'R21.99', retailerId: 'checkers', title: 'White Bread loaf' }),
    ]

    expect(findBestDealForQuery(deals, 'white bread', 'checkers')?.priceCents).toBe(2199)
  })
})

describe('autoComparePrices', () => {
  const deals = [
    deal({ priceText: 'R21.99', retailerId: 'checkers', title: 'White Bread 700g' }),
    deal({ priceText: 'R17.99', retailerId: 'shoprite', title: 'White Bread 700g' }),
    deal({ priceText: 'R25.99', retailerId: 'woolworths', title: 'White Bread 700g' }),
  ]

  test('compares three or more stores and flags the cheapest', () => {
    const result = autoComparePrices(deals, 'white bread', RETAILERS)

    expect(result.foundCount).toBe(3)
    expect(result.missingCount).toBe(0)
    expect(result.cheapestRetailerId).toBe('shoprite')
    // Dearest (Woolworths R25.99) minus cheapest (Shoprite R17.99).
    expect(result.savingsCents).toBe(800)
    expect(result.matches.find((m) => m.retailerId === 'shoprite')?.isCheapest).toBe(true)
    expect(result.matches.find((m) => m.retailerId === 'checkers')?.isCheapest).toBe(false)
  })

  test('reports a store with no match as missing, never as free', () => {
    const result = autoComparePrices(deals, 'white bread', [
      ...RETAILERS,
      { id: 'boxer', name: 'Boxer' },
    ])

    const boxer = result.matches.find((match) => match.retailerId === 'boxer')

    expect(boxer?.priceCents).toBeUndefined()
    expect(boxer?.deal).toBeUndefined()
    expect(boxer?.isCheapest).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.foundCount).toBe(3)
  })

  test('defaults gracefully when nothing matches anywhere', () => {
    const result = autoComparePrices(deals, 'caviar', RETAILERS)

    expect(result.foundCount).toBe(0)
    expect(result.missingCount).toBe(3)
    expect(result.cheapestRetailerId).toBeUndefined()
    expect(result.savingsCents).toBe(0)
  })

  test('marks both stores cheapest when they tie', () => {
    const tied = [
      deal({ priceText: 'R15.00', retailerId: 'checkers', title: 'Eggs 6s' }),
      deal({ priceText: 'R15.00', retailerId: 'shoprite', title: 'Eggs 6s' }),
    ]

    const result = autoComparePrices(tied, 'eggs', RETAILERS)

    expect(result.savingsCents).toBe(0)
    expect(result.matches.filter((match) => match.isCheapest)).toHaveLength(2)
  })
})
