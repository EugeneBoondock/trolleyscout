import { describe, expect, it } from 'vitest'
import {
  buildMrPriceCategoriesQuery,
  buildMrPriceProductsQuery,
  decodeMrPriceCampaignCursor,
  decodeMrPriceCursor,
  encodeMrPriceCampaignCursor,
  encodeMrPriceCursor,
  buildMrPricePromotionsQuery,
  parseMrPriceCampaignFeed,
  parseMrPriceCategories,
  parseMrPriceFeed,
  parseMrPricePromotions,
} from './mrPrice'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.mrp.com/en_za/' }

/**
 * Shaped as Mr Price actually answers.
 *
 * The pair that matters is on `maximum_price`; `minimum_price` reports the
 * selling price as both its regular and its final whether the item is marked
 * down or not, which is exactly why this shop published nothing for months.
 */
function item(
  regular: number,
  final: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    name: 'Seamless Bodycon Dress',
    price_range: {
      maximum_price: {
        discount: {
          amount_off: Math.max(0, regular - final),
          percent_off: regular > final ? ((regular - final) / regular) * 100 : 0,
        },
        final_price: { value: final },
        regular_price: { value: regular },
      },
      minimum_price: {
        final_price: { value: final },
        regular_price: { value: final },
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
  it('reads the markdown out of maximum_price', () => {
    const page = parseMrPriceFeed(feed([item(299.99, 200)]), context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://m2prd.mrpg.com/media/catalog/product/dress.jpg',
      previousPriceCents: 29_999,
      priceCents: 20_000,
      productId: '01_105262473',
      promotionId: 'mrp-markdowns',
      retailerId: 'mr-price',
      savingText: '33% off',
      scope: { type: 'online' },
      title: 'Seamless Bodycon Dress',
    })
  })

  it('links to the product page that actually renders', () => {
    // The `.html` this used to append answers 200 and shows an empty shell.
    const page = parseMrPriceFeed(feed([item(299.99, 200)]), context)
    expect(page.candidates[0].productUrl).toBe(
      'https://www.mrp.com/en_za/seamless-bodycon-dress-105262473',
    )
  })

  it('replaces the catalogue placeholder with the official product image', () => {
    const page = parseMrPriceFeed(feed([item(299.99, 200, {
      small_image: {
        url: 'https://m2prd.mrpg.com/media/catalog/product/placeholder/default/no-image_1.JPG',
      },
    })]), context)

    expect(page.candidates[0].imageUrl).toBe(
      'https://cdn.media.amplience.net/i/mrpricegroup/' +
      '01_105262473_SI_00?$preset$&fmt=auto',
    )
  })

  it('derives the official product image when GraphQL omits one', () => {
    const page = parseMrPriceFeed(feed([item(299.99, 200, {
      small_image: null,
    })]), context)

    expect(page.candidates[0].imageUrl).toBe(
      'https://cdn.media.amplience.net/i/mrpricegroup/' +
      '01_105262473_SI_00?$preset$&fmt=auto',
    )
  })

  it('ignores minimum_price, which never shows a markdown', () => {
    const page = parseMrPriceFeed(
      feed([{
        ...item(299.99, 200),
        price_range: {
          maximum_price: {
            discount: { amount_off: 0, percent_off: 0 },
            final_price: { value: 200 },
            regular_price: { value: 200 },
          },
          // A tempting pair, and a lie: this shape does not occur.
          minimum_price: {
            final_price: { value: 200 },
            regular_price: { value: 299.99 },
          },
        },
      }]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('does not read a size range as a saving', () => {
    // A shirt sold from R150 to R200 has a maximum above its minimum and is
    // not marked down at all; the discount block is what separates the two.
    const page = parseMrPriceFeed(
      feed([{
        ...item(200, 200),
        price_range: {
          maximum_price: {
            discount: { amount_off: 0, percent_off: 0 },
            final_price: { value: 200 },
            regular_price: { value: 200 },
          },
          minimum_price: {
            final_price: { value: 150 },
            regular_price: { value: 150 },
          },
        },
      }]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('never reads a regular price at or below the final price as a saving', () => {
    expect(parseMrPriceFeed(feed([item(199, 199)]), context).candidates).toEqual([])
    expect(parseMrPriceFeed(feed([item(99, 199)]), context).candidates).toEqual([])
  })

  it('reports how many the aisle holds', () => {
    expect(parseMrPriceFeed(feed([item(299.99, 200)], 494), context).totalCount).toBe(494)
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

  it('keeps one row per sku when an aisle repeats it', () => {
    const page = parseMrPriceFeed(feed([item(299.99, 200), item(299.99, 200)]), context)
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload that is not the products query', () => {
    expect(() => parseMrPriceFeed({ data: {} }, context))
      .toThrow('Invalid Mr Price feed payload')
    expect(() => parseMrPriceFeed({ errors: [{ message: 'Not found' }] }, context))
      .toThrow('Invalid Mr Price feed payload')
    expect(() => parseMrPriceFeed(null, context)).toThrow(TypeError)
  })
})

describe('parseMrPricePromotions', () => {
  // Promos holds groupings, and each grouping holds the offers. The campaign's
  // own name is the offer, which is why nothing here reassembles wording.
  const tree = {
    data: {
      categoryList: [{
        name: 'Promos',
        uid: 'MjA4OQ==',
        children: [
          { name: 'View All', uid: 'VjE=', children: [] },
          {
            name: 'Ladies Real Deal',
            uid: 'NzI4Mg==',
            children: [
              {
                name: 'Selected sleepwear separates take 2 for R130',
                product_count: 4,
                uid: 'MTg1NDQ=',
                url_key: 'ladies-sleepwear-separates-buy-2-for-r130',
              },
              {
                name: 'Selected socks take 3 for 2',
                product_count: 13,
                uid: 'MTgxOTk=',
                url_key: 'lds-uw-buy-3-for-2-on-selected-fashion-anklets',
              },
            ],
          },
        ],
      }],
    },
  }

  it('reads each campaign, with the offer in Mr Price own words', () => {
    expect(parseMrPricePromotions(tree)).toEqual([
      {
        categoryUid: 'MTg1NDQ=',
        offerText: 'Selected sleepwear separates take 2 for R130',
        slug: 'ladies-sleepwear-separates-buy-2-for-r130',
      },
      {
        categoryUid: 'MTgxOTk=',
        offerText: 'Selected socks take 3 for 2',
        slug: 'lds-uw-buy-3-for-2-on-selected-fashion-anklets',
      },
    ])
  })

  it('leaves out a campaign holding nothing to buy', () => {
    const empty = structuredClone(tree)
    empty.data.categoryList[0].children[1].children[0].product_count = 0
    expect(parseMrPricePromotions(empty).map((c) => c.categoryUid)).toEqual(['MTgxOTk='])
  })

  it('leaves out a name too short to read as an offer', () => {
    const terse = structuredClone(tree)
    terse.data.categoryList[0].children[1].children[0].name = 'Sale'
    expect(parseMrPricePromotions(terse).map((c) => c.categoryUid)).toEqual(['MTgxOTk='])
  })

  it('returns nothing when no campaign is running', () => {
    expect(parseMrPricePromotions({ data: { categoryList: [] } })).toEqual([])
  })

  it('rejects a payload that is not the promotions query', () => {
    expect(() => parseMrPricePromotions({ data: {} })).toThrow(TypeError)
    expect(() => parseMrPricePromotions(null)).toThrow(TypeError)
  })
})

describe('buildMrPricePromotionsQuery', () => {
  it('asks Promos for the two levels the campaigns sit at', () => {
    const query = buildMrPricePromotionsQuery()
    expect(query).toContain('url_key:{eq:"promos"}')
    expect(query).toContain('children { uid name children {')
    expect(query).toContain('product_count')
  })
})

describe('parseMrPriceCampaignFeed', () => {
  const campaign = {
    categoryUid: 'MTg1NDQ=',
    offerText: 'Selected sleepwear separates: take 2 for R130',
    slug: 'selected-sleepwear-separates-take-2-for-r130',
  }

  it('publishes a multibuy at its real price with the offer in words', () => {
    const page = parseMrPriceCampaignFeed(feed([item(79.99, 79.99)]), context, campaign)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 7_999,
      promotionId: 'mrp-promo-selected-sleepwear-separates-take-2-for-r130',
      retailerId: 'mr-price',
      savingText: 'Selected sleepwear separates: take 2 for R130',
    })
  })

  it('claims no was-price, because a multibuy marks nothing down', () => {
    // The saving arrives at the till and only for a shopper who buys two.
    const page = parseMrPriceCampaignFeed(feed([item(79.99, 79.99)]), context, campaign)
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
  })

  it('still carries a was-price when the item is also marked down', () => {
    const page = parseMrPriceCampaignFeed(feed([item(129.99, 79.99)]), context, campaign)
    expect(page.candidates[0]).toMatchObject({
      previousPriceCents: 12_999,
      priceCents: 7_999,
      savingText: 'Selected sleepwear separates: take 2 for R130',
    })
  })

  it('drops an item with no price at all', () => {
    const page = parseMrPriceCampaignFeed(
      feed([{ ...item(79.99, 79.99), price_range: { minimum_price: {} } }]),
      context,
      campaign,
    )
    expect(page.candidates).toEqual([])
  })

  it('rejects a payload that is not the products query', () => {
    expect(() => parseMrPriceCampaignFeed({ data: {} }, context, campaign)).toThrow(TypeError)
  })
})

describe('buildMrPriceProductsQuery', () => {
  it('asks for the maximum price, where the markdown lives', () => {
    const query = buildMrPriceProductsQuery('MTc3')

    expect(query).toContain('category_uid:{eq:"MTc3"}')
    expect(query).toContain('pageSize:100')
    expect(query).toContain('maximum_price')
    expect(query).toContain('regular_price { value }')
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
  it('asks for every aisle a markdown can appear in, not just clearance', () => {
    const query = buildMrPriceCategoriesQuery()
    expect(query).toContain('url_key:{in:[')
    expect(query).toContain('"priced-to-go"')
    expect(query).toContain('"new-in"')
    expect(query).toContain('"ladies"')
  })

  it('escapes a url key rather than breaking out of the query', () => {
    expect(buildMrPriceCategoriesQuery(['a"b'])).toContain('["a\\"b"]')
  })
})

describe('parseMrPriceCategories', () => {
  it('collects each aisle once', () => {
    expect(
      parseMrPriceCategories({
        data: {
          categoryList: [
            { uid: 'MTc3', name: 'Priced To Go', url_path: 'ladies/priced-to-go' },
            { uid: 'MjAx', name: 'New In', url_path: 'mens/new-in' },
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

describe('mr price cursors', () => {
  it('walks the aisles it was given, round trip', () => {
    expect(decodeMrPriceCursor(encodeMrPriceCursor({ index: 1, uids: ['MTc3', 'MjAx'] })))
      .toEqual({ index: 1, uids: ['MTc3', 'MjAx'] })
  })

  it('refuses an aisle cursor it cannot read', () => {
    expect(decodeMrPriceCursor('category-list')).toBeUndefined()
    expect(decodeMrPriceCursor(JSON.stringify({ i: 0, uids: [] }))).toBeUndefined()
    expect(decodeMrPriceCursor(JSON.stringify({ i: -1, uids: ['MTc3'] }))).toBeUndefined()
  })

  it('walks the campaigns it was given, round trip', () => {
    const cursor = {
      campaigns: [{ categoryUid: 'MTg1NDQ=', offerText: 'Take 2 for R130', slug: 'take-2-for-r130' }],
      index: 0,
    }
    expect(decodeMrPriceCampaignCursor(encodeMrPriceCampaignCursor(cursor))).toEqual(cursor)
  })

  it('refuses a campaign cursor it cannot read', () => {
    expect(decodeMrPriceCampaignCursor('promo-list')).toBeUndefined()
    expect(decodeMrPriceCampaignCursor(JSON.stringify({ c: [], i: 0 }))).toBeUndefined()
    expect(decodeMrPriceCampaignCursor(JSON.stringify({ c: [{ categoryUid: 'x' }], i: 0 })))
      .toBeUndefined()
  })
})
