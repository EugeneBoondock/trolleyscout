import { describe, expect, it } from 'vitest'
import {
  buildPepCollectionProductsUrl,
  decodePepCursor,
  encodePepCursor,
  parsePepCollections,
  PEP_SHARD_COUNT,
  parsePepFeed,
  readPepSaving,
  type PepPromotion,
} from './pep'

const context = {
  capturedAt: '2026-07-25T10:00:00.000Z',
  sourceUrl: 'https://www.pepstores.com/collections/get-20-off-all-cookware',
}

const cookware: PepPromotion = {
  handle: 'get-20-off-all-cookware',
  savingText: '20% off',
  title: 'Get 20% off Cookware',
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    handle: 'non-stick-frying-pan-sku-efr40',
    images: [{ src: 'https://cdn.shopify.com/s/files/1/0918/pan.jpg' }],
    title: 'Non-Stick Frypan 28cm',
    variants: [
      { available: true, compare_at_price: '0.00', price: '199.99', sku: 'EFR40' },
    ],
    ...overrides,
  }
}

describe('readPepSaving', () => {
  it('reads the offer out of a promotion title', () => {
    expect(readPepSaving('Get 20% off Cookware')).toBe('20% off')
    expect(readPepSaving('25% Off Gifting')).toBe('25% off')
    expect(readPepSaving('Buy any 2 lined curtains and save 20%')).toBe('20% off')
    expect(readPepSaving('Buy A Medium Division Backpack And Save R30!')).toBe('Save R30')
  })

  // Most of PEP's 250 collections are plain aisles. Publishing one as a deal
  // would put a full-price shelf in front of a shopper looking for markdowns.
  it('reads no offer out of an ordinary aisle', () => {
    expect(readPepSaving('Baby Boys (0-24months) - Tops')).toBeUndefined()
    expect(readPepSaving('Affordable Rugs')).toBeUndefined()
    expect(readPepSaving('Available Online')).toBeUndefined()
    expect(readPepSaving('Apple Cellphones')).toBeUndefined()
  })
})

describe('parsePepCollections', () => {
  const collections = {
    collections: [
      { handle: 'baby-baby-boys-tops', title: 'Baby Boys (0-24months) - Tops' },
      { handle: 'get-20-off-all-cookware', title: 'Get 20% off Cookware' },
      { handle: 'buy-any-comforter-and-save-20', title: 'Buy any comforter and save 20%' },
    ],
  }

  it('keeps only the collections whose titles state a discount', () => {
    expect(parsePepCollections(collections, 0)).toEqual([
      { handle: 'get-20-off-all-cookware', savingText: '20% off', title: 'Get 20% off Cookware' },
    ])
    expect(parsePepCollections(collections, 1)).toEqual([
      {
        handle: 'buy-any-comforter-and-save-20',
        savingText: '20% off',
        title: 'Buy any comforter and save 20%',
      },
    ])
  })

  // Every promotion must land on exactly one shard: one dropped between shards
  // is a promotion no shopper ever sees.
  it('deals every promotion to exactly one shard', () => {
    const dealt = Array.from({ length: PEP_SHARD_COUNT }, (_, shard) =>
      parsePepCollections(collections, shard),
    ).flat()

    expect(dealt.map((promotion) => promotion.handle).sort()).toEqual([
      'buy-any-comforter-and-save-20',
      'get-20-off-all-cookware',
    ])
  })

  it('rejects a payload that is not a collection list', () => {
    expect(() => parsePepCollections({})).toThrow(TypeError)
  })
})

describe('parsePepFeed', () => {
  it('publishes the real price and the offer, and invents no was-price', () => {
    const page = parsePepFeed({ products: [product()] }, context, cookware)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 19999,
      productId: 'EFR40',
      productUrl: 'https://www.pepstores.com/products/non-stick-frying-pan-sku-efr40',
      promotionId: 'pep-get-20-off-all-cookware',
      savingText: '20% off',
      // The shop's own wording, so a conditional offer stays conditional.
      termsText: 'Get 20% off Cookware',
      title: 'Non-Stick Frypan 28cm',
    })
    // "0.00" is how this storefront writes "no previous price". Reading it as
    // one would claim a saving of the entire price.
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
  })

  it('honours a real markdown if PEP ever sets one', () => {
    const page = parsePepFeed(
      {
        products: [
          product({
            variants: [
              { available: true, compare_at_price: '249.99', price: '199.99', sku: 'EFR40' },
            ],
          }),
        ],
      },
      context,
      cookware,
    )

    expect(page.candidates[0]).toMatchObject({ previousPriceCents: 24999, priceCents: 19999 })
  })

  it('prices from a variant a shopper can actually buy', () => {
    const page = parsePepFeed(
      {
        products: [
          product({
            variants: [
              { available: false, compare_at_price: '0.00', price: '999.99', sku: 'SOLD' },
              { available: true, compare_at_price: '0.00', price: '199.99', sku: 'EFR40' },
            ],
          }),
        ],
      },
      context,
      cookware,
    )

    expect(page.candidates[0]).toMatchObject({ priceCents: 19999, productId: 'EFR40' })
  })

  it('skips a product with no price, title or link', () => {
    const page = parsePepFeed(
      {
        products: [
          product({ variants: [{ available: true, price: null, sku: 'NOPRICE' }] }),
          product({ handle: '', title: 'Orphan' }),
          product({ title: '' }),
        ],
      },
      context,
      cookware,
    )

    expect(page.candidates).toEqual([])
  })

  it('publishes one candidate per product even across repeated variants', () => {
    const page = parsePepFeed({ products: [product(), product()] }, context, cookware)

    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload that is not a product list', () => {
    expect(() => parsePepFeed({}, context, cookware)).toThrow(TypeError)
  })
})

describe('pep cursor', () => {
  it('walks the promotions it was given, round trip', () => {
    const token = encodePepCursor({ index: 2, promotions: [cookware] })

    expect(decodePepCursor(token)).toEqual({ index: 2, promotions: [cookware] })
  })

  it('refuses a cursor it cannot read rather than sweeping the wrong shelf', () => {
    expect(decodePepCursor('not json')).toBeUndefined()
    expect(decodePepCursor('{}')).toBeUndefined()
    expect(decodePepCursor(JSON.stringify({ i: 0, p: [] }))).toBeUndefined()
    expect(decodePepCursor(JSON.stringify({ i: -1, p: [['a', 'Get 20% off']] }))).toBeUndefined()
  })
})

describe('buildPepCollectionProductsUrl', () => {
  it('asks for a full page of one collection', () => {
    expect(buildPepCollectionProductsUrl('get-20-off-all-cookware')).toBe(
      'https://www.pepstores.com/collections/get-20-off-all-cookware/products.json?limit=250',
    )
  })
})
