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
