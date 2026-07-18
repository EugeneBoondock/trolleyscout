import { describe, expect, it } from 'vitest'
import {
  adRateCard,
  clampReach,
  computeAdPriceCents,
  formatRandFromCents,
  isValidAdPlacement,
  isValidAdProvince,
} from './adPricing'

describe('computeAdPriceCents', () => {
  it('charges 8c per person for a feed placement above the minimum', () => {
    // 25000 * 8c = R2000
    expect(computeAdPriceCents({ placement: 'feed', reach: 25_000 })).toBe(200_000)
  })

  it('applies the near-me premium (20%)', () => {
    // 25000 * 8c * 1.2 = R2400
    expect(computeAdPriceCents({ placement: 'near_me', reach: 25_000 })).toBe(240_000)
  })

  it('never charges below the R100 minimum', () => {
    // 500 * 8c = R40 -> floored to R100
    expect(computeAdPriceCents({ placement: 'feed', reach: 500 })).toBe(10_000)
  })

  it('clamps an absurd reach to the maximum before pricing', () => {
    const price = computeAdPriceCents({ placement: 'feed', reach: 10_000_000 })
    expect(price).toBe(computeAdPriceCents({ placement: 'feed', reach: adRateCard.maxReach }))
  })

  it('is deterministic and integer-valued', () => {
    const price = computeAdPriceCents({ placement: 'near_me', reach: 3_333 })
    expect(Number.isInteger(price)).toBe(true)
    expect(price).toBe(computeAdPriceCents({ placement: 'near_me', reach: 3_333 }))
  })
})

describe('clampReach', () => {
  it('pins below the floor and above the ceiling', () => {
    expect(clampReach(10)).toBe(adRateCard.minReach)
    expect(clampReach(9_999_999)).toBe(adRateCard.maxReach)
  })

  it('rounds a fractional reach', () => {
    expect(clampReach(1234.6)).toBe(1_235)
  })

  it('falls back to the floor for non-finite input', () => {
    expect(clampReach(Number.NaN)).toBe(adRateCard.minReach)
  })
})

describe('validators', () => {
  it('accepts only known placements', () => {
    expect(isValidAdPlacement('feed')).toBe(true)
    expect(isValidAdPlacement('near_me')).toBe(true)
    expect(isValidAdPlacement('billboard')).toBe(false)
  })

  it('accepts only real SA provinces', () => {
    expect(isValidAdProvince('Gauteng')).toBe(true)
    expect(isValidAdProvince('Atlantis')).toBe(false)
    expect(isValidAdProvince(42)).toBe(false)
  })
})

describe('formatRandFromCents', () => {
  it('drops the decimals on whole rand', () => {
    expect(formatRandFromCents(200_000)).toBe('R2000')
  })

  it('keeps cents when present', () => {
    expect(formatRandFromCents(10_050)).toBe('R100.50')
  })
})
