import { describe, expect, it } from 'vitest'
import {
  ORACLE_COMMERCE_SHOPS,
  buildOracleCommerceUrl,
  parseOracleCommerceFeed,
} from './oracleCommerce'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://officelondon.truworths.co.za/',
}
const shop = ORACLE_COMMERCE_SHOPS[1]

function product(overrides: Record<string, unknown> = {}) {
  return {
    childSKUs: [
      {
        active: true,
        listPrices: { zar: 2999 },
        salePrices: { zar: 2160 },
      },
      {
        active: true,
        listPrices: { zar: 2999 },
        salePrices: { zar: 2499 },
      },
    ],
    displayName: 'Pink 1000',
    id: 'prod3207997',
    route: '/pink-1000/product/prod3207997',
    ...overrides,
  }
}

describe('parseOracleCommerceFeed', () => {
  it('uses the lowest real child-SKU markdown and the official product media', () => {
    const page = parseOracleCommerceFeed({
      items: [product()],
      totalResults: 276,
    }, context, shop, 0)

    expect(page.totalCount).toBe(276)
    expect(page.nextCursor).toEqual({ kind: 'offset', offset: 1 })
    expect(page.candidates[0]).toMatchObject({
      imageUrl:
        'https://cdn.media.amplience.net/i/truworths/prod3207997_1?fmt=auto&w=800&h=800',
      previousPriceCents: 299_900,
      priceCents: 216_000,
      productId: 'prod3207997',
      productUrl:
        'https://officelondon.truworths.co.za/pink-1000/product/prod3207997',
      retailerId: 'office-london',
      savingText: '28% off',
      title: 'Pink 1000',
    })
  })

  it('does not publish equal or missing sale prices', () => {
    const page = parseOracleCommerceFeed({
      items: [
        product({ childSKUs: [{ listPrices: { zar: 2999 }, salePrices: { zar: 2999 } }] }),
        product({ id: 'missing', childSKUs: [{ listPrices: { zar: 2999 } }] }),
      ],
      totalResults: 2,
    }, context, shop, 0)

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(2)
  })

  it('rejects an unrelated payload', () => {
    expect(() => parseOracleCommerceFeed({ products: [] }, context, shop, 0))
      .toThrow('Invalid Oracle Commerce feed payload')
  })
})

describe('buildOracleCommerceUrl', () => {
  it('requests the official sale category with bounded paging', () => {
    expect(buildOracleCommerceUrl(shop, 50)).toBe(
      'https://officelondon.truworths.co.za/ccstore/v1/products?' +
      'categoryId=sale-of&limit=50&offset=50&includeChildren=true',
    )
  })
})
