import { describe, expect, it } from 'vitest'

import type { DiscoveryRun } from '../types'
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

  it('keeps the nearest branch distance for the store card', () => {
    const [group] = groupDiscoveredStores([
      store({ placeId: 'far', distanceM: 4000 }),
      store({ placeId: 'near', distanceM: 650 }),
      store({ placeId: 'unknown' }),
    ])

    expect(group.nearestDistanceM).toBe(650)
  })

  it('counts a shared national promotion once across several branches', () => {
    const sharedPromotion = {
      id: 'tm-rice',
      kind: 'deal' as const,
      placeId: 'online:zw:tmpnponline-co-zw',
      priceText: 'USD 4.99',
      productUrl: 'https://tmpnponline.co.zw/products/rice',
      sourceUrl: 'https://tmpnponline.co.zw/',
      storeName: 'TM Pick n Pay',
      title: 'Long grain rice',
    }
    const groups = groupDiscoveredStores([
      store({
        name: 'TM Pick n Pay Msasa',
        placeId: 'tm-msasa',
        promotionCount: 1,
        promotions: [sharedPromotion],
        website: 'https://tmpnponline.co.zw/',
      }),
      store({
        name: 'TM Pick n Pay Avondale',
        placeId: 'tm-avondale',
        promotionCount: 1,
        promotions: [sharedPromotion],
        website: 'https://tmpnponline.co.zw/',
      }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].promotionCount).toBe(1)
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

  it('uses Marketplace content when branch summaries have no loaded promotions', () => {
    const marketplace: DiscoveryRun = {
      deals: [{
        capturedAt: '2026-08-02T08:00:00.000Z',
        evidenceText: 'Official Boxer listing',
        id: 'boxer-rice',
        productUrl: 'https://www.boxer.co.za/rice',
        retailerId: 'boxer',
        retailerName: 'Boxer',
        sourceLabel: 'Boxer',
        sourceUrl: 'https://www.boxer.co.za/specials',
        title: 'Rice 10 kg',
      }],
      leaflets: [
        {
          capturedAt: '2026-08-02T08:00:00.000Z',
          id: 'boxer-weekly',
          name: 'Weekly deals',
          retailerId: 'boxer',
          retailerName: 'Boxer',
          url: 'https://www.boxer.co.za/catalogues/weekly',
        },
        {
          capturedAt: '2026-08-02T08:00:00.000Z',
          id: 'boxer-month-end',
          name: 'Month-end deals',
          retailerId: 'boxer',
          retailerName: 'Boxer',
          url: 'https://www.boxer.co.za/catalogues/month-end',
        },
      ],
      sources: [],
      summary: {
        checkedSourceCount: 1,
        dataPolicy: 'Public official sources',
        foundDealCount: 1,
        leafletCount: 2,
        unavailableSourceCount: 0,
      },
    }

    const [group] = groupDiscoveredStores([
      store({
        detailsLoaded: false,
        name: 'Boxer Johannesburg',
        placeId: 'boxer-jhb',
        promotionCount: 0,
        retailerId: 'boxer',
      }),
    ], marketplace)

    expect(group).toMatchObject({
      catalogueCount: 2,
      dealCount: 1,
      displayName: 'Boxer',
      promotionCount: 3,
    })
  })
})
