import { describe, expect, it } from 'vitest'

import type { StorePromotion } from '../_shared/locationStore'
import { attachPromotionDetails, keepStoresNear } from './discovered-stores'

const promotion = (overrides: Partial<StorePromotion>): StorePromotion => ({
  id: 'promotion-1',
  kind: 'deal',
  placeId: 'store-a',
  sourceUrl: 'https://official.test/specials',
  storeName: 'Store A',
  title: 'Rice 2kg',
  ...overrides,
})

describe('attachPromotionDetails', () => {
  it('keeps each promotion attached to its own place and preserves count fields', () => {
    const result = attachPromotionDetails(
      [
        { firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'A', nextScoutAt: '2026-07-17', placeId: 'store-a' },
        { firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'B', nextScoutAt: '2026-07-17', placeId: 'store-b' },
      ],
      new Map([['store-a', 9], ['store-b', 1]]),
      [
        promotion({ id: 'a-1', placeId: 'store-a', title: 'Rice 2kg' }),
        promotion({ id: 'b-1', placeId: 'store-b', title: 'Milk 2L' }),
      ],
    )

    expect(result[0]).toMatchObject({ hasPromotions: true, promotionCount: 9 })
    expect(result[0].promotions.map((item) => item.id)).toEqual(['a-1'])
    expect(result[1].promotions.map((item) => item.id)).toEqual(['b-1'])
  })

  // A chain's feed covers the whole chain, so its deals are held against the
  // retailer and never against one address. Counting only what was scouted at
  // a branch had a Shoprite reading "no deals" on the same day the deals page
  // showed hundreds for Shoprite.
  it('credits a branch with what its chain published', () => {
    const [shoprite, independent] = attachPromotionDetails(
      [
        { firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'Shoprite Strand', nextScoutAt: '2026-07-17', placeId: 'store-a', retailerId: 'shoprite' },
        { firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'Corner Cafe', nextScoutAt: '2026-07-17', placeId: 'store-b' },
      ],
      new Map([['store-a', 2]]),
      [promotion({ id: 'a-1', placeId: 'store-a' })],
      new Map([['shoprite', 843]]),
    )

    expect(shoprite).toMatchObject({
      hasPromotions: true,
      promotionCount: 845,
      retailerDealCount: 843,
      storePromotionCount: 2,
    })
    // A shop belonging to no chain is unaffected and still counts its own.
    expect(independent).toMatchObject({ hasPromotions: false, promotionCount: 0 })
  })

  it('shows a chain branch as stocked even when nothing was scouted at it', () => {
    const [store] = attachPromotionDetails(
      [{ firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'Shoprite', nextScoutAt: '2026-07-17', placeId: 'store-a', retailerId: 'shoprite' }],
      new Map(),
      [],
      new Map([['shoprite', 843]]),
    )

    expect(store).toMatchObject({ hasPromotions: true, promotionCount: 843 })
  })

  it('bounds detailed promotions per branch without changing the accurate count', () => {
    const promotions = [
      ...Array.from({ length: 40 }, (_, index) => promotion({ id: `item-${index}` })),
      promotion({ id: 'catalogue', kind: 'catalogue', title: 'Weekly catalogue' }),
    ]
    const [result] = attachPromotionDetails(
      [{ firstSeenAt: '2026-07-01', lastSeenAt: '2026-07-16', lat: -26, lon: 28, name: 'A', nextScoutAt: '2026-07-17', placeId: 'store-a' }],
      new Map([['store-a', 41]]),
      promotions,
    )

    expect(result.promotionCount).toBe(41)
    expect(result.promotions).toHaveLength(24)
    expect(result.promotions.map((item) => item.id)).toContain('catalogue')
  })
})

describe('keepStoresNear', () => {
  const capeTown = { lat: -33.92, lon: 18.42 }
  const stores = [
    { lat: -33.93, lon: 18.46, name: 'Observatory' },
    { lat: -34.11, lon: 18.86, name: 'Somerset West' },
    { lat: -23.9, lon: 29.45, name: 'Polokwane' },
  ]

  // The directory listed every shop in the country, so a shopper in Cape Town
  // scrolled past shops fifteen hundred kilometres away.
  it('keeps only the shops a shopper could reach, nearest first', () => {
    // Observatory is a few kilometres out; Somerset West is about forty-five,
    // and Polokwane is the better part of fifteen hundred.
    expect(keepStoresNear(stores, capeTown, 20).map((store) => store.name))
      .toEqual(['Observatory'])
    expect(keepStoresNear(stores, capeTown, 60).map((store) => store.name))
      .toEqual(['Observatory', 'Somerset West'])
  })

  it('orders by distance and reports it', () => {
    const near = keepStoresNear(stores, capeTown, 100)

    expect(near.map((store) => store.name)).toEqual(['Observatory', 'Somerset West'])
    expect(near[0].distanceKm!).toBeLessThan(near[1].distanceKm!)
  })

  // Somebody who has not told us where they are still gets the directory,
  // rather than an empty page.
  it('leaves the list alone when the shopper has no saved place', () => {
    expect(keepStoresNear(stores, undefined, 60)).toEqual(stores)
  })
})
