import { describe, expect, it } from 'vitest'
import type { ProductComparisonResult, RetailerProductSearchMatch } from '../types'
import { buildTripComparison, parseTripQueries } from './tripCompare'

function match(retailerId: string, retailerName: string, priceCents?: number): RetailerProductSearchMatch {
  return {
    retailerId,
    retailerName,
    status: priceCents === undefined ? 'unavailable' : 'priced',
    ...(priceCents === undefined ? {} : { priceCents }),
  }
}

function result(query: string, matches: RetailerProductSearchMatch[]): ProductComparisonResult {
  return {
    checkedAt: '2026-08-02T12:00:00.000Z',
    country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ðŸ‡¿ðŸ‡¦', name: 'South Africa' },
    foundCount: matches.filter((entry) => entry.status !== 'unavailable').length,
    matches,
    pricedCount: matches.filter((entry) => entry.priceCents !== undefined).length,
    query,
    savingsCents: 0,
    unavailableCount: matches.filter((entry) => entry.status === 'unavailable').length,
  }
}

describe('trip comparison', () => {
  it('parses a pasted list, removes bullets and duplicate items, and applies the limit', () => {
    expect(parseTripQueries('1. Milk 2L\n- Bread 700g\nâ€¢ milk 2l\nEggs 18\nCheese', 3)).toEqual([
      'Milk 2L',
      'Bread 700g',
      'Eggs 18',
    ])
  })

  it('compares the cheapest split trip with the cheapest complete one-store trip', () => {
    const comparison = buildTripComparison([
      result('Milk 2L', [match('a', 'Store A', 3000), match('b', 'Store B', 2500)]),
      result('Bread 700g', [match('a', 'Store A', 1500), match('b', 'Store B', 2000)]),
    ])

    expect(comparison.isComplete).toBe(true)
    expect(comparison.splitTotalCents).toBe(4000)
    expect(comparison.splitStoreCount).toBe(2)
    expect(comparison.bestOneStore).toMatchObject({ retailerId: 'a', totalCents: 4500 })
    expect(comparison.convenienceCostCents).toBe(500)
  })

  it('never treats a missing price as zero or names an incomplete store as best', () => {
    const comparison = buildTripComparison([
      result('Milk 2L', [match('a', 'Store A', 3000), match('b', 'Store B', 2500)]),
      result('Bread 700g', [match('a', 'Store A'), match('b', 'Store B', 2000)]),
      result('Eggs 18', [match('a', 'Store A'), match('b', 'Store B')]),
    ])

    expect(comparison.isComplete).toBe(false)
    expect(comparison.pricedItemCount).toBe(2)
    expect(comparison.splitTotalCents).toBe(4500)
    expect(comparison.bestOneStore).toBeUndefined()
    expect(comparison.convenienceCostCents).toBeUndefined()
    expect(comparison.stores.find((store) => store.retailerId === 'a')).toMatchObject({
      missingQueries: ['Bread 700g', 'Eggs 18'],
      pricedItemCount: 1,
      totalCents: 3000,
    })
  })
})
