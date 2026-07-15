import { describe, expect, test } from 'vitest'
import { compareUnitPrices, formatUnitPrice, parseRandsToCents, type PackDraft } from './unitPrice'

function draft(overrides: Partial<PackDraft>): PackDraft {
  return {
    id: 'pack-1',
    priceText: '',
    quantityText: '',
    unit: 'kg',
    ...overrides,
  }
}

describe('parseRandsToCents', () => {
  test('parses plain rand amounts', () => {
    expect(parseRandsToCents('12.99')).toBe(1299)
  })

  test('parses amounts with an R prefix and comma decimals', () => {
    expect(parseRandsToCents('R12,99')).toBe(1299)
  })

  test('parses thousands with spaces', () => {
    expect(parseRandsToCents('1 299')).toBe(129900)
  })

  test('returns undefined for empty or junk input', () => {
    expect(parseRandsToCents('')).toBeUndefined()
    expect(parseRandsToCents('free')).toBeUndefined()
    expect(parseRandsToCents('-5')).toBeUndefined()
  })
})

describe('compareUnitPrices', () => {
  test('finds the cheaper pack per kilogram across gram and kilogram packs', () => {
    const comparison = compareUnitPrices([
      draft({ id: 'small', priceText: 'R24,99', quantityText: '500', unit: 'g' }),
      draft({ id: 'big', priceText: 'R89,99', quantityText: '2', unit: 'kg' }),
    ])

    expect(comparison.results).toHaveLength(2)
    const small = comparison.results.find((result) => result.id === 'small')
    const big = comparison.results.find((result) => result.id === 'big')

    // R24,99 for 500 g = R49,98 per kg. R89,99 for 2 kg = R45,00 per kg.
    expect(small?.unitPriceCents).toBe(4998)
    expect(big?.unitPriceCents).toBe(4500)
    expect(comparison.bestId).toBe('big')
  })

  test('compares millilitres against litres', () => {
    const comparison = compareUnitPrices([
      draft({ id: 'sachet', priceText: '9.99', quantityText: '250', unit: 'ml' }),
      draft({ id: 'bottle', priceText: '31.99', quantityText: '1', unit: 'l' }),
    ])

    expect(comparison.bestId).toBe('bottle')
    expect(comparison.results[0]?.baseUnit).toBe('L')
  })

  test('supports per-item comparisons', () => {
    const comparison = compareUnitPrices([
      draft({ id: 'six', priceText: '21', quantityText: '6', unit: 'each' }),
      draft({ id: 'thirty', priceText: '89.99', quantityText: '30', unit: 'each' }),
    ])

    expect(comparison.bestId).toBe('thirty')
    expect(comparison.results.find((result) => result.id === 'six')?.unitPriceCents).toBe(350)
  })

  test('flags mixed units instead of comparing apples with oil', () => {
    const comparison = compareUnitPrices([
      draft({ id: 'a', priceText: '10', quantityText: '1', unit: 'kg' }),
      draft({ id: 'b', priceText: '10', quantityText: '1', unit: 'l' }),
    ])

    expect(comparison.hasMixedUnits).toBe(true)
    expect(comparison.bestId).toBeUndefined()
  })

  test('ignores incomplete rows and reports how much more the loser costs', () => {
    const comparison = compareUnitPrices([
      draft({ id: 'complete', priceText: '20', quantityText: '1', unit: 'kg' }),
      draft({ id: 'pricier', priceText: '30', quantityText: '1', unit: 'kg' }),
      draft({ id: 'blank' }),
    ])

    expect(comparison.results).toHaveLength(2)
    expect(comparison.bestId).toBe('complete')
    const pricier = comparison.results.find((result) => result.id === 'pricier')
    expect(pricier?.percentMoreThanBest).toBe(50)
  })
})

describe('formatUnitPrice', () => {
  test('formats cents per base unit as rand text', () => {
    expect(formatUnitPrice(4500, 'kg')).toBe('R45.00 / kg')
    expect(formatUnitPrice(350, 'each')).toBe('R3.50 each')
  })
})
