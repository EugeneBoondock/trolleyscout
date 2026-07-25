import { describe, expect, it } from 'vitest'

import type { StorePromotion } from '../_shared/locationStore'
import { attachPromotionDetails } from './discovered-stores'

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
