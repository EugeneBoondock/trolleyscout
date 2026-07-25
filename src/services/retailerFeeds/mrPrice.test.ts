import { describe, expect, it } from 'vitest'
import {
  buildMrPriceCategoriesQuery,
  buildMrPriceProductsQuery,
  decodeMrPriceCursor,
  encodeMrPriceCursor,
  parseMrPriceCategories,
  parseMrPriceFeed,
} from './mrPrice'

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
  it('asks one markdown aisle for both prices and the discount', () => {
    const query = buildMrPriceProductsQuery('MTc3')

    expect(query).toContain('category_uid:{eq:"MTc3"}')
    expect(query).toContain('pageSize:100')
    expect(query).toContain('regular_price { value }')
    expect(query).toContain('final_price { value }')
    expect(query).toContain('percent_off')
  })

  it('escapes the category and bounds the page size', () => {
    expect(buildMrPriceProductsQuery('a"b')).toContain('eq:"a\\"b"')
    expect(buildMrPriceProductsQuery('MTc3', 5000)).toContain('pageSize:100')
    expect(buildMrPriceProductsQuery('MTc3', 0)).toContain('pageSize:1')
  })
})

describe('buildMrPriceCategoriesQuery', () => {
  // Looked up by url key each run: a stored id would silently stop the sweep
  // the day Mr Price rebuilds its category tree.
  it('asks for the markdown aisle by its url key', () => {
    expect(buildMrPriceCategoriesQuery()).toContain('url_key:{eq:"priced-to-go"}')
    expect(buildMrPriceCategoriesQuery('a"b')).toContain('eq:"a\\"b"')
  })
})

describe('parseMrPriceCategories', () => {
  it('collects one aisle per department, without repeats', () => {
    expect(
      parseMrPriceCategories({
        data: {
          categoryList: [
            { uid: 'MTc3', name: 'Priced To Go', url_path: 'ladies/priced-to-go' },
            { uid: 'MjAx', name: 'Priced To Go', url_path: 'mens/priced-to-go' },
            { uid: 'MTc3', name: 'Priced To Go', url_path: 'ladies/priced-to-go' },
          ],
        },
      }),
    ).toEqual(['MTc3', 'MjAx'])
  })

  it('rejects a payload that carries no category list', () => {
    expect(() => parseMrPriceCategories({ data: {} })).toThrow(TypeError)
    expect(() => parseMrPriceCategories(null)).toThrow(TypeError)
  })
})

describe('mr price cursor', () => {
  it('walks the aisles it was given, round trip', () => {
    expect(decodeMrPriceCursor(encodeMrPriceCursor({ index: 1, uids: ['MTc3', 'MjAx'] })))
      .toEqual({ index: 1, uids: ['MTc3', 'MjAx'] })
  })

  it('refuses a cursor it cannot read', () => {
    expect(decodeMrPriceCursor('category-list')).toBeUndefined()
    expect(decodeMrPriceCursor(JSON.stringify({ i: 0, uids: [] }))).toBeUndefined()
    expect(decodeMrPriceCursor(JSON.stringify({ i: -1, uids: ['MTc3'] }))).toBeUndefined()
  })
})
