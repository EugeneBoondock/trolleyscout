import { describe, expect, it } from 'vitest'
import { compareShops, formatCents, parsePriceInput } from './shopCompare'

describe('parsePriceInput', () => {
  it('parses rand text into cents', () => {
    expect(parsePriceInput('R24,99')).toBe(2499)
    expect(parsePriceInput('19')).toBe(1900)
    expect(parsePriceInput('12.50')).toBe(1250)
  })

  it('rejects empty and invalid input', () => {
    expect(parsePriceInput('')).toBeUndefined()
    expect(parsePriceInput('abc')).toBeUndefined()
    expect(parsePriceInput('0')).toBeUndefined()
  })
})

describe('compareShops', () => {
  const items = [
    { id: 'a', name: 'Milk 2L', priceCents: [3299, 3499] },
    { id: 'b', name: 'Bread', priceCents: [1599, 1499] },
    { id: 'c', name: 'Eggs 18', priceCents: [4999, 4799] },
  ]

  it('totals each shop and picks the cheapest complete basket', () => {
    const result = compareShops(items, 2)

    expect(result.shopTotals[0].totalCents).toBe(3299 + 1599 + 4999)
    expect(result.shopTotals[1].totalCents).toBe(3499 + 1499 + 4799)
    // Shop 0: 9897, Shop 1: 9797 → shop 1 cheaper.
    expect(result.cheapestShopIndex).toBe(1)
    expect(result.savingsCents).toBe(9897 - 9797)
    expect(result.hasCompleteShop).toBe(true)
  })

  it('flags the cheapest shop per item', () => {
    const result = compareShops(items, 2)

    expect(result.cheapestShopByItem).toEqual([0, 1, 1])
  })

  it('prefers a complete basket over a cheaper-but-incomplete one', () => {
    const mixed = [
      { id: 'a', name: 'Milk', priceCents: [3000, 2500] },
      { id: 'b', name: 'Bread', priceCents: [1500, undefined] },
    ]
    const result = compareShops(mixed, 2)

    // Shop 1 is missing bread, so shop 0 is the only complete basket.
    expect(result.hasCompleteShop).toBe(true)
    expect(result.cheapestShopIndex).toBe(0)
  })

  it('falls back to cheapest partial when no shop is complete', () => {
    const partial = [
      { id: 'a', name: 'Milk', priceCents: [3000, undefined] },
      { id: 'b', name: 'Bread', priceCents: [undefined, 1200] },
    ]
    const result = compareShops(partial, 2)

    expect(result.hasCompleteShop).toBe(false)
    expect(result.cheapestShopIndex).toBe(1) // 1200 < 3000
  })

  it('handles an empty list', () => {
    const result = compareShops([], 2)

    expect(result.cheapestShopIndex).toBeUndefined()
    expect(result.savingsCents).toBe(0)
  })
})

describe('formatCents', () => {
  it('formats cents as rands', () => {
    expect(formatCents(9797)).toBe('R97.97')
  })
})
