import { describe, expect, it } from 'vitest'
import { computeLineEconomics, parseMultibuy } from './multibuy'

describe('parseMultibuy', () => {
  it('parses "N for RP" bundles', () => {
    expect(parseMultibuy('2 for R30')).toEqual({ kind: 'bundle', priceCents: 3000, quantity: 2 })
    expect(parseMultibuy('Any 3 for R50,00')).toEqual({ kind: 'bundle', priceCents: 5000, quantity: 3 })
  })

  it('parses "RP when you buy N"', () => {
    expect(parseMultibuy('R30 when you buy 2')).toEqual({ kind: 'bundle', priceCents: 3000, quantity: 2 })
  })

  it('parses buy-get-free offers', () => {
    expect(parseMultibuy('Buy 2 Get 1 Free')).toEqual({ kind: 'getFree', payFor: 2, total: 3 })
    expect(parseMultibuy('3 for 2')).toEqual({ kind: 'getFree', payFor: 2, total: 3 })
  })

  it('reads across price and saving text', () => {
    expect(parseMultibuy('R15,99 each', '2 for R28')).toEqual({
      kind: 'bundle',
      priceCents: 2800,
      quantity: 2,
    })
  })

  it('returns undefined for plain prices', () => {
    expect(parseMultibuy('R24,99')).toBeUndefined()
    expect(parseMultibuy(undefined, 'Save R5')).toBeUndefined()
  })
})

describe('computeLineEconomics', () => {
  it('prices a bundle line and saves against the was price', () => {
    // 2 for R30, was R18 each → buy 2 = R30 vs R36 regular, save R6.
    const result = computeLineEconomics({
      quantity: 2,
      unitPriceCents: 1800,
      previousUnitPriceCents: 1800,
      multibuy: { kind: 'bundle', priceCents: 3000, quantity: 2 },
    })

    expect(result.linePriceCents).toBe(3000)
    expect(result.lineSavingCents).toBe(600)
  })

  it('handles a partial bundle (3 units of a 2-for deal)', () => {
    // 2 for R30 (R15/unit), single R18. Buy 3 = one bundle (R30) + one single (R18) = R48.
    const result = computeLineEconomics({
      quantity: 3,
      unitPriceCents: 1800,
      multibuy: { kind: 'bundle', priceCents: 3000, quantity: 2 },
    })

    expect(result.linePriceCents).toBe(4800)
    // baseline is unit price 1800 (no was): 3*1800=5400 - 4800 = 600
    expect(result.lineSavingCents).toBe(600)
  })

  it('charges only paid units for buy-2-get-1-free', () => {
    // R20 each, buy 2 get 1 free, quantity 3 → pay for 2 = R40, save R20.
    const result = computeLineEconomics({
      quantity: 3,
      unitPriceCents: 2000,
      multibuy: { kind: 'getFree', payFor: 2, total: 3 },
    })

    expect(result.linePriceCents).toBe(4000)
    expect(result.lineSavingCents).toBe(2000)
  })

  it('falls back to a plain was/now delta with no multibuy', () => {
    const result = computeLineEconomics({
      quantity: 2,
      unitPriceCents: 1500,
      previousUnitPriceCents: 2000,
    })

    expect(result.linePriceCents).toBe(3000)
    expect(result.lineSavingCents).toBe(1000)
  })

  it('returns no saving when nothing is cheaper', () => {
    const result = computeLineEconomics({ quantity: 2, unitPriceCents: 1500 })

    expect(result.linePriceCents).toBe(3000)
    expect(result.lineSavingCents).toBeUndefined()
  })
})
