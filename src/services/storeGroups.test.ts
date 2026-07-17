import { describe, expect, it } from 'vitest'

import type { NearbyStoreResult } from './apiClient'
import { groupDiscoveredStores } from './storeGroups'

function store(overrides: Partial<NearbyStoreResult> = {}): NearbyStoreResult {
  return {
    deals: [],
    lat: -26.2,
    leaflets: [],
    lon: 28.04,
    name: 'Neighbourhood Market',
    placeId: 'store-1',
    promotions: [],
    ...overrides,
  }
}

describe('groupDiscoveredStores', () => {
  it('groups every known chain branch by retailer and totals its live promotions', () => {
    const branches = Array.from({ length: 10 }, (_, index) => store({
      name: `Pick n Pay ${index + 1}`,
      placeId: `pnp-${index + 1}`,
      promotionCount: index + 1,
      retailerId: 'pick-n-pay',
    }))

    const groups = groupDiscoveredStores(branches)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      branchCount: 10,
      displayName: 'Pick n Pay',
      id: 'retailer:pick-n-pay',
      promotionCount: 55,
      retailerId: 'pick-n-pay',
    })
    expect(groups[0].branches.map((branch) => branch.placeId)).toEqual(
      branches.map((branch) => branch.placeId),
    )
  })

  it('groups unknown branches when their verified website host matches', () => {
    const groups = groupDiscoveredStores([
      store({ name: 'Family Foods Central', placeId: 'a', website: 'https://www.familyfoods.test/central' }),
      store({ name: 'Family Foods North', placeId: 'b', website: 'https://familyfoods.test/north' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].branchCount).toBe(2)
  })

  it('groups unknown stores only on an exact conservative brand-name normalization', () => {
    const groups = groupDiscoveredStores([
      store({ name: '  Valley   Grocer ', placeId: 'a' }),
      store({ name: 'Valley Grocer', placeId: 'b' }),
      store({ name: 'Valley Grocer Durban', placeId: 'c' }),
      store({ name: 'Valley Grocery', placeId: 'd' }),
    ])

    expect(groups).toHaveLength(3)
    expect(groups.find((group) => group.displayName === 'Valley Grocer')?.branchCount).toBe(2)
    expect(groups.flatMap((group) => group.branches)).toHaveLength(4)
  })

  it('never treats invalid or non-web URLs as verified shared hosts', () => {
    const groups = groupDiscoveredStores([
      store({ name: 'Alpha Market', placeId: 'a', website: 'javascript:alert(1)' }),
      store({ name: 'Beta Market', placeId: 'b', website: 'javascript:alert(2)' }),
    ])

    expect(groups).toHaveLength(2)
  })

  it('does not merge stores whose shared name is only a generic category', () => {
    const groups = groupDiscoveredStores([
      store({ name: 'Supermarket', placeId: 'generic-a' }),
      store({ name: 'Supermarket', placeId: 'generic-b' }),
    ])

    expect(groups).toHaveLength(2)
  })
})
