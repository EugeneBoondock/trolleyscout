import { describe, expect, it } from 'vitest'

import {
  SHOPRITE_GROUP_CHAINS,
  onPromotionRequest,
  parseShopriteGroupPromotions,
  selectNearestBranchId,
  storesByLocationRequest,
} from './shopriteGroupDeals'

const NOW = Date.parse('2026-07-22T12:00:00.000Z')

describe('selectNearestBranchId', () => {
  it('picks the first branch of the chain and skips LiquorShops', () => {
    const payload = {
      stores: [
        { id: 'liq1', brand: 'Checkers LiquorShop', name: 'Checkers LiquorShop CBD' },
        { id: 'ck1', brand: 'Checkers', name: 'Checkers The Mutual CBD' },
      ],
    }
    expect(selectNearestBranchId(payload, SHOPRITE_GROUP_CHAINS.checkers)).toBe('ck1')
  })

  it('returns undefined when no branch of the chain is nearby', () => {
    const payload = { stores: [{ id: 'x', brand: 'Shoprite', name: 'Shoprite Foo' }] }
    expect(selectNearestBranchId(payload, SHOPRITE_GROUP_CHAINS.checkers)).toBeUndefined()
  })
})

describe('request builders', () => {
  it('build anonymous browse-by-store POST bodies', () => {
    const loc = storesByLocationRequest('www.shoprite.co.za', -33.9, 18.4)
    expect(loc.url).toContain('/api/browse-by-store/get-stores-by-location')
    expect(JSON.parse(loc.body)).toEqual({ payload: { latitude: -33.9, longitude: 18.4 } })

    const promo = onPromotionRequest('www.checkers.co.za', 'store-1', 40)
    const body = JSON.parse(promo.body)
    expect(body.payload.filter.productListSource).toEqual({ onPromotion: true })
    expect(body.payload.userContext.storeIds).toEqual(['store-1'])
  })
})

describe('parseShopriteGroupPromotions', () => {
  const product = (over: Record<string, unknown>) => ({
    id: 'p1',
    name: 'Niveen Medley Bar 40g',
    price: 9.99,
    priceFactor: 100,
    priceWithoutDecimal: 999,
    imagePDPURL: 'https://catalog.sixty60.co.za/v2/files/abc',
    ...over,
  })

  const bonusBuy = (over: Record<string, unknown> = {}) => ({
    active: true,
    shortDescription: 'Buy 2 For R16',
    Name: 'Buy 2 For R16',
    startDate: Date.parse('2026-07-20T00:00:00.000Z'),
    endDate: Date.parse('2026-07-28T21:59:59.000Z'),
    browseStoreIds: ['store-1', 'store-9'],
    ...over,
  })

  it('emits a dated in-branch special from an active bonus buy', () => {
    const result = parseShopriteGroupPromotions('www.shoprite.co.za', 'store-1', {
      products: [product({ bonusBuys: [bonusBuy()] })],
    }, NOW)

    expect(result).toEqual([{
      imageUrl: 'https://catalog.sixty60.co.za/v2/files/abc',
      priceText: 'R9.99',
      previousPriceText: undefined,
      productUrl: 'https://www.shoprite.co.za/product/p1',
      savingText: 'Buy 2 For R16',
      title: 'Niveen Medley Bar 40g',
      validFrom: '2026-07-20',
      validTo: '2026-07-28',
    }])
  })

  it('skips products with no bonus buy, an expired one, or one scoped to other stores', () => {
    const result = parseShopriteGroupPromotions('www.shoprite.co.za', 'store-1', {
      products: [
        product({ id: 'none', bonusBuys: [] }),
        product({ id: 'expired', bonusBuys: [bonusBuy({ endDate: Date.parse('2026-07-01T00:00:00Z') })] }),
        product({ id: 'elsewhere', bonusBuys: [bonusBuy({ browseStoreIds: ['store-99'] })] }),
      ],
    }, NOW)

    expect(result).toEqual([])
  })

  it('reconstructs the price from the integer pair when no decimal price exists', () => {
    const result = parseShopriteGroupPromotions('www.checkers.co.za', 'store-1', {
      products: [{
        id: 'ck1',
        name: 'Albany White Bread 700g',
        priceWithoutDecimal: 1898,
        priceFactor: 100,
        bonusBuys: [bonusBuy({ shortDescription: 'Save R2' })],
      }],
    }, NOW)

    expect(result[0]).toMatchObject({ priceText: 'R18.98', savingText: 'Save R2' })
  })
})
