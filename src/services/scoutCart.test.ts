import { describe, expect, it } from 'vitest'
import {
  addCartItem,
  cartItemToDealDraft,
  isInCart,
  parsePriceCents,
  parseScoutCart,
  removeCartItem,
  summarizeCart,
  type ScoutCartItem,
} from './scoutCart'
import type { ScoutChatDealCard } from '../types'

const ADDED_AT = '2026-07-31T08:00:00.000Z'

function card(overrides: Partial<ScoutChatDealCard> = {}): ScoutChatDealCard {
  return {
    id: 'live:0:takealot',
    priceText: 'R6099.00',
    productUrl: 'https://www.takealot.com/hisense-50/PLID1',
    retailerName: 'Takealot',
    title: 'Hisense 50 Inch QLED Smart TV',
    ...overrides,
  }
}

describe('adding to the Mr Scout cart', () => {
  it('keeps the price so a total can be shown', () => {
    const [item] = addCartItem([], card(), ADDED_AT)

    expect(item).toMatchObject({
      priceCents: 609_900,
      priceText: 'R6099.00',
      retailerName: 'Takealot',
      title: 'Hisense 50 Inch QLED Smart TV',
    })
  })

  it('refreshes an existing line instead of stacking a duplicate', () => {
    const first = addCartItem([], card(), ADDED_AT)
    const second = addCartItem(first, card({ priceText: 'R5799.00' }), ADDED_AT)

    expect(second).toHaveLength(1)
    expect(second[0].priceCents).toBe(579_900)
  })

  it('never mutates the list it was given', () => {
    const original: ScoutCartItem[] = []
    addCartItem(original, card(), ADDED_AT)
    expect(original).toEqual([])
  })

  it('treats the product URL as the identity', () => {
    const items = addCartItem([], card(), ADDED_AT)
    expect(isInCart(items, 'https://www.takealot.com/hisense-50/PLID1')).toBe(true)
    expect(removeCartItem(items, 'https://www.takealot.com/hisense-50/PLID1')).toEqual([])
  })
})

describe('cart totals', () => {
  const items = [
    ...addCartItem([], card(), ADDED_AT),
    ...addCartItem([], card({
      priceText: 'R4999.00',
      productUrl: 'https://www.game.co.za/tcl-50/p/1',
      retailerName: 'Game',
      title: 'TCL QD Google TV 50S5K',
    }), ADDED_AT),
  ]

  it('breaks the total down per store so a shopper can split the trip', () => {
    const summary = summarizeCart(items)

    expect(summary.itemCount).toBe(2)
    expect(summary.totalCents).toBe(1_109_800)
    expect(summary.groups.map((group) => group.retailerName)).toEqual(['Game', 'Takealot'])
    expect(summary.groups[0]).toMatchObject({ itemCount: 1, totalCents: 499_900 })
  })

  it('withholds a store total when a price could not be read', () => {
    const summary = summarizeCart([
      ...items,
      ...addCartItem([], card({
        priceText: 'See current price',
        productUrl: 'https://www.game.co.za/unknown/p/2',
        retailerName: 'Game',
      }), ADDED_AT),
    ])

    expect(summary.unpricedCount).toBe(1)
    expect(summary.groups.find((group) => group.retailerName === 'Game')?.totalCents)
      .toBeUndefined()
  })
})

describe('parsePriceCents', () => {
  it.each([
    ['R32.99', 3_299],
    ['R6 099.00', 609_900],
    ['R1,575.00', 157_500],
    ['R699', 69_900],
  ])('reads %j', (input, expected) => {
    expect(parsePriceCents(input)).toBe(expected)
  })

  it('returns nothing when there is no price to read', () => {
    expect(parsePriceCents('See current price')).toBeUndefined()
  })
})

describe('moving the cart into the real basket', () => {
  it('maps a cart line onto the saved-deal shape the basket needs', () => {
    const [item] = addCartItem([], card(), ADDED_AT)
    const draft = cartItemToDealDraft(item)

    expect(draft).toMatchObject({
      priceText: 'R6099.00',
      productUrl: 'https://www.takealot.com/hisense-50/PLID1',
      retailerId: 'takealot',
      retailerName: 'Takealot',
      sourceLabel: 'Mr Scout',
    })
  })
})

describe('restoring a persisted cart', () => {
  it('keeps sound lines and drops damaged ones', () => {
    const restored = parseScoutCart([
      {
        addedAt: ADDED_AT,
        priceText: 'R32.99',
        productUrl: 'https://www.pnp.co.za/milk/p/1',
        retailerName: 'Pick n Pay',
        title: 'PnP Full Cream Fresh Milk 2L',
      },
      { title: 'No URL and no price' },
      { productUrl: 'javascript:alert(1)', priceText: 'R1', title: 'Unsafe' },
    ])

    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({ priceCents: 3_299, retailerName: 'Pick n Pay' })
  })

  it('survives anything that is not a list', () => {
    expect(parseScoutCart(undefined)).toEqual([])
    expect(parseScoutCart({ items: [] })).toEqual([])
  })
})
