import { describe, expect, it } from 'vitest'
import { buildMrPriceProductsQuery, parseMrPriceFeed } from './mrPrice'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.mrp.com/en_za/' }

function item(
  regular: number,
  final: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    name: 'Seamless Bodycon Dress',
    price_range: {
      minimum_price: {
        discount: {
          amount_off: Math.max(0, regular - final),
          percent_off: regular > 0 ? Math.round(((regular - final) / regular) * 100) : 0,
        },
        final_price: { value: final },
        regular_price: { value: regular },
      },
    },
    sku: '01_105262473',
    small_image: { url: 'https://m2prd.mrpg.com/media/catalog/product/dress.jpg' },
    url_key: 'seamless-bodycon-dress-105262473',
    ...overrides,
  }
}

const feed = (items: unknown[], totalCount = items.length) => ({
  data: { products: { items, total_count: totalCount } },
})

describe('parseMrPriceFeed', () => {
  it('yields no candidates while Mr Price runs no markdowns', () => {
    // Every item in the live catalogue has final_price === regular_price today.
    // The honest answer is an empty page, not a fabricated saving.
    const page = parseMrPriceFeed(
      feed([
        item(189.99, 189.99),
        item(249, 249, { sku: '01_105262474', url_key: 'tee-105262474' }),
      ], 494),
      context,
    )

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(494)
  })

  it('publishes a real markdown once one runs', () => {
    const page = parseMrPriceFeed(feed([item(299.99, 199.99)]), context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://m2prd.mrpg.com/media/catalog/product/dress.jpg',
      previousPriceCents: 29_999,
      priceCents: 19_999,
      productId: '01_105262473',
      productUrl: 'https://www.mrp.com/en_za/seamless-bodycon-dress-105262473.html',
      promotionId: 'mrp-markdowns',
      retailerId: 'mr-price',
      savingText: '33% off',
      scope: { type: 'online' },
      title: 'Seamless Bodycon Dress',
    })
  })

  it('never reads a regular price below the final price as a saving', () => {
    const page = parseMrPriceFeed(feed([item(99, 199)]), context)
    expect(page.candidates).toEqual([])
  })

  it('drops items missing a sku, name or url key', () => {
    const page = parseMrPriceFeed(
      feed([
        item(299, 199, { sku: '' }),
        item(299, 199, { name: '', sku: 'no-name' }),
        item(299, 199, { sku: 'no-key', url_key: '' }),
      ]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('rejects a payload that is not the products query', () => {
    expect(() => parseMrPriceFeed({ data: {} }, context))
      .toThrow('Invalid Mr Price feed payload')
    expect(() => parseMrPriceFeed({ errors: [{ message: 'Not found' }] }, context))
      .toThrow('Invalid Mr Price feed payload')
    expect(() => parseMrPriceFeed(null, context)).toThrow(TypeError)
  })
})

describe('buildMrPriceProductsQuery', () => {
  it('asks for both prices and the discount in one query', () => {
    const query = buildMrPriceProductsQuery()

    expect(query).toContain('search:"dress"')
    expect(query).toContain('pageSize:100')
    expect(query).toContain('regular_price { value }')
    expect(query).toContain('final_price { value }')
    expect(query).toContain('percent_off')
  })

  it('escapes the search term and bounds the page size', () => {
    expect(buildMrPriceProductsQuery('a"b')).toContain('search:"a\\"b"')
    expect(buildMrPriceProductsQuery('shoes', 5000)).toContain('pageSize:100')
    expect(buildMrPriceProductsQuery('shoes', 0)).toContain('pageSize:1')
  })
})
