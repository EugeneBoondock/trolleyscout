import { describe, expect, it } from 'vitest'
import { cataloguePlatformRetailers } from './cataloguePlatformRetailers'
import { getOnlineStoreSources } from '../services/onlineStoreRegistry'
import { leafletTargets } from '../services/leafletDiscovery'

const newlyVerifiedRetailers = [
  'a5-cash-and-carry',
  'advance-cash-and-carry',
  'giant-hyper',
  'ma-powertrade',
  'obc-better-butchery',
  'prestons-liquors',
  'west-pack-lifestyle',
]

describe('retailer-owned sources found from catalogue coverage gaps', () => {
  it('adds each missing retailer to the public source directory', () => {
    const retailersById = new Map(
      cataloguePlatformRetailers.map((retailer) => [retailer.id, retailer]),
    )

    expect([...newlyVerifiedRetailers].sort()).toEqual(
      newlyVerifiedRetailers.filter((id) => retailersById.has(id)).sort(),
    )
    for (const id of newlyVerifiedRetailers) {
      expect(retailersById.get(id)?.sources[0]?.url).toMatch(/^https:\/\//)
    }
  })

  it('registers live commerce feeds only for stores with public online catalogues', () => {
    const names = getOnlineStoreSources('ZA').map((source) => source.name)

    expect(names).toContain('A5 Cash & Carry')
    expect(names).toContain('M.A Powertrade')
  })

  it('registers current official brochure pages for catalogue extraction', () => {
    const officialTargets = leafletTargets.filter((target) => (
      target.kind === 'official-html-index' &&
      ['obc-better-butchery', 'prestons-liquors'].includes(target.retailerId)
    ))

    expect(officialTargets.map((target) => target.retailerId).sort()).toEqual([
      'obc-better-butchery',
      'prestons-liquors',
    ])
    expect(officialTargets.every((target) => target.countryCode === 'ZA')).toBe(true)
  })
})
