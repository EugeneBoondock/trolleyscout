import { describe, expect, it } from 'vitest'
import {
  SHOPIFY_RETAILERS,
  buildShopifyRetailerUrl,
  parseShopifyRetailerFeed,
} from './shopifyRetailers'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://www.bathu.co.za/',
}
const shop = SHOPIFY_RETAILERS[0]

describe('parseShopifyRetailerFeed', () => {
  it('keeps the raw product count when a page has no markdowns', () => {
    const payload = {
      products: [
        {
          handle: 'full-price-shirt',
          title: 'Full Price Shirt',
          variants: [{ available: true, compare_at_price: null, price: '399.00' }],
        },
        {
          handle: 'another-shirt',
          title: 'Another Shirt',
          variants: [{ available: true, compare_at_price: '499.00', price: '499.00' }],
        },
      ],
    }

    const page = parseShopifyRetailerFeed(payload, context, shop)

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(2)
  })

  it('maps a Shopify markdown to the named retailer', () => {
    const page = parseShopifyRetailerFeed({
      products: [{
        handle: 'marked-shirt',
        images: [{ src: 'https://www.bathu.co.za/cdn/shop/files/shirt.jpg' }],
        title: 'Marked Shirt',
        variants: [{ available: true, compare_at_price: '499.00', price: '299.00' }],
      }],
    }, context, shop)

    expect(page.candidates[0]).toMatchObject({
      previousPriceCents: 49_900,
      priceCents: 29_900,
      productId: 'marked-shirt',
      productUrl: 'https://www.bathu.co.za/products/marked-shirt',
      retailerId: 'bathu',
      savingText: '40% off',
    })
  })

  it('keeps Bathu sold-out stock state in its named feed', () => {
    const page = parseShopifyRetailerFeed({
      products: [{
        handle: 'sold-out-sneaker',
        title: 'Sold Out Sneaker',
        variants: [{
          available: false,
          compare_at_price: '1999.00',
          price: '999.00',
        }],
      }],
    }, context, shop)

    expect(page.candidates[0]).toMatchObject({
      productId: 'sold-out-sneaker',
      retailerId: 'bathu',
      soldOut: true,
    })
  })
})

describe('buildShopifyRetailerUrl', () => {
  it('requests one bounded catalogue page at a time', () => {
    expect(buildShopifyRetailerUrl(shop, 2)).toBe(
      'https://www.bathu.co.za/products.json?limit=250&page=2',
    )
  })
})
