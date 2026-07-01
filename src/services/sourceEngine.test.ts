import { describe, expect, it } from 'vitest'
import { retailers } from '../data/retailers'
import { verifiedOffers } from '../data/verifiedOffers'
import { countSources, countVerifiedOffers, filterRetailers, getSourceKinds } from './sourceEngine'

describe('sourceEngine', () => {
  it('starts with no verified offers', () => {
    expect(verifiedOffers).toEqual([])
    expect(countVerifiedOffers(verifiedOffers)).toBe(0)
  })

  it('counts official source links', () => {
    expect(countSources(retailers)).toBeGreaterThanOrEqual(20)
  })

  it('filters retailers by query and source kind', () => {
    const matches = filterRetailers(retailers, {
      query: 'clubcard',
      sourceKind: 'loyalty',
    })

    expect(matches.map((retailer) => retailer.id)).toEqual(['clicks'])
  })

  it('reports only known source kinds', () => {
    expect(getSourceKinds(retailers)).toEqual(['app', 'loyalty', 'specials', 'store-finder'])
  })
})
