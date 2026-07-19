import { describe, expect, it } from 'vitest'
import {
  decodeEntities,
  extractNextData,
  parseDaddysDeals,
  parseHyperli,
  parseMyRunway,
  parseOneDayOnly,
} from './dealSites'

describe('parseOneDayOnly', () => {
  const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        homePage: {
          items: [
            { type: 'hero', props: {} },
            {
              type: 'shop',
              props: {
                products: [
                  {
                    id: 'flatweave-rug-20260709',
                    realId: 1292923,
                    name: 'Hand Woven Flatweave Rug',
                    brand: 'Maeve Living',
                    isSoldOut: false,
                    retailPrice: { value: 5000, formattedValue: 'R5,000' },
                    price: { value: 1499, formattedValue: 'R1,499' },
                    saving: { format: 'PERCENT', percent: 70, fixed: { value: 3500, formattedValue: 'R3,500' } },
                    activeToDate: '2026-07-18 23:59:59',
                    image: { url: 'https://odo-cdn.imgix.net/x.jpeg' },
                    gallery: [
                      { type: 'IMAGE', position: 4, file: { url: 'https://odo-cdn.imgix.net/x.jpeg' } },
                      { type: 'VIDEO', file: { url: 'https://odo-cdn.imgix.net/demo.mp4' } },
                      { type: 'IMAGE', position: 2, file: { url: 'https://odo-cdn.imgix.net/side.jpeg' } },
                      { type: 'IMAGE', position: 1, file: { url: 'https://odo-cdn.imgix.net/censored.jpeg', isCensored: true } },
                    ],
                  },
                  { id: 'sold', realId: 2, name: 'Gone', isSoldOut: true, price: { formattedValue: 'R1' } },
                ],
              },
            },
          ],
        },
      },
    },
  })}</script></body></html>`

  it('extracts products with price, was-price, percentage saving and expiry', () => {
    const items = parseOneDayOnly(html)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.id).toBe('onedayonly-1292923')
    expect(item.title).toBe('Hand Woven Flatweave Rug')
    expect(item.retailerName).toBe('OneDayOnly')
    expect(item.priceText).toBe('R1,499')
    expect(item.previousPriceText).toBe('R5,000')
    expect(item.savingText).toBe('Save R3,500 (70% off)')
    expect(item.expiresAt).toBe('2026-07-18 23:59:59')
    expect(item.productUrl).toBe('https://www.onedayonly.co.za/products/flatweave-rug-20260709')
    expect(item.source).toBe('onedayonly')
    expect(item.images).toEqual([
      'https://odo-cdn.imgix.net/x.jpeg',
      'https://odo-cdn.imgix.net/side.jpeg',
    ])
  })

  it('returns empty for html without __NEXT_DATA__', () => {
    expect(parseOneDayOnly('<html></html>')).toEqual([])
  })

  it('prefers a supplied external listing link', () => {
    const externalHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          homePage: {
            items: [{
              props: {
                products: [{
                  externalListingLink: 'https://merchant.example/deal',
                  id: 'external-deal',
                  isSoldOut: false,
                  name: 'External deal',
                  price: { formattedValue: 'R99' },
                  realId: 9001,
                }],
              },
            }],
          },
        },
      },
    })}</script>`

    expect(parseOneDayOnly(externalHtml)[0].productUrl).toBe('https://merchant.example/deal')
  })

  it('rejects non-web external listing links', () => {
    const unsafeHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          homePage: {
            items: [{
              props: {
                products: [{
                  externalListingLink: 'javascript:alert(1)',
                  id: 'safe-fallback',
                  isSoldOut: false,
                  name: 'Safe fallback',
                  price: { formattedValue: 'R99' },
                  realId: 9002,
                }],
              },
            }],
          },
        },
      },
    })}</script>`

    expect(parseOneDayOnly(unsafeHtml)[0].productUrl)
      .toBe('https://www.onedayonly.co.za/products/safe-fallback')
  })
})

describe('parseHyperli', () => {
  const payload = {
    products: [
      {
        id: 555,
        title: 'UTV Adventure',
        handle: 'utv-adventure',
        vendor: 'WildX',
        product_type: 'Activities',
        variants: [{ price: '999.00', compare_at_price: '1199.00', available: true }],
        images: [
          { src: 'https://cdn.shopify.com/side.png', position: 2 },
          { src: 'https://cdn.shopify.com/x.png', position: 1 },
        ],
      },
      {
        id: 556,
        title: 'Sold out thing',
        handle: 'sold',
        variants: [{ price: '10.00', available: false }],
        images: [],
      },
    ],
  }

  it('maps Shopify products with compare-at savings', () => {
    const items = parseHyperli(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.id).toBe('hyperli-555')
    expect(item.priceText).toBe('R999')
    expect(item.previousPriceText).toBe('R1199')
    expect(item.savingText).toBe('Save R200')
    expect(item.productUrl).toBe('https://hyperli.com/products/utv-adventure')
    expect(item.sourceLabel).toBe('Hyperli · WildX')
    expect(item.images).toEqual([
      'https://cdn.shopify.com/x.png',
      'https://cdn.shopify.com/side.png',
    ])
  })
})

describe('parseDaddysDeals', () => {
  const payload = [
    {
      id: 88,
      link: 'https://daddysdeals.co.za/deals/durban/vouchers/massage/',
      title: { rendered: 'Head &amp; Back Massage for 1' },
      excerpt: { rendered: '<p>Only R199 for a relaxing hour&hellip;</p>' },
      _embedded: {
        'wp:featuredmedia': [{ source_url: 'https://daddysdeals.co.za/img.png' }],
        'wp:term': [[{ name: 'Uncategorized' }], [{ name: 'Durban' }]],
      },
    },
  ]

  it('maps WP product posts, decoding entities and pulling a rand price', () => {
    const items = parseDaddysDeals(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.title).toBe('Head & Back Massage for 1')
    expect(item.priceText).toBe('R199')
    expect(item.imageUrl).toBe('https://daddysdeals.co.za/img.png')
    expect(item.category).toBe('Durban')
    expect(item.productUrl).toContain('/vouchers/massage/')
  })
})

describe('parseMyRunway', () => {
  const payload = {
    products: [
      {
        id: 27138,
        sku: 'ROX_X',
        name: 'White & Pink Sandals',
        brand: { name: 'Roxy' },
        is_sold_out: false,
        retail_price: '330.00',
        selling_price: '89',
        discount: '73',
        image_url: 'https://s3/x.jpg',
        product_images: [
          { image_url: 'https://s3/x.jpg', position: 0, is_include: 1 },
          { image_url: 'https://s3/side.jpg', position: 1, is_include: 1 },
          { image_url: 'https://s3/hidden.jpg', position: 2, is_include: 0 },
        ],
        url_params: 'roxy-sandals-27138',
        product_category_name: 'Shoes',
      },
    ],
  }

  it('maps products with selling/retail prices and a discount', () => {
    const items = parseMyRunway(payload)
    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.title).toBe('White & Pink Sandals')
    expect(item.retailerName).toBe('Roxy')
    expect(item.priceText).toBe('R89')
    expect(item.previousPriceText).toBe('R330')
    expect(item.savingText).toBe('73% off')
    expect(item.productUrl).toBe('https://myrunway.co.za/product/ROX_X')
    expect(item.category).toBe('Shoes')
    expect(item.images).toEqual(['https://s3/x.jpg', 'https://s3/side.jpg'])
  })

  it('uses the single-product route when only url params are available', () => {
    const items = parseMyRunway({
      products: [{
        id: 99,
        is_sold_out: false,
        name: 'Fallback product',
        selling_price: '100',
        url_params: '/products/fallback-product',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/product/fallback-product')
  })

  it('encodes a SKU as one route segment', () => {
    const items = parseMyRunway({
      products: [{
        id: 100,
        is_sold_out: false,
        name: 'Encoded product',
        selling_price: '100',
        sku: 'SKU BLUE/ONE',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/product/SKU%20BLUE%2FONE')
  })

  it('falls back to MyRunway instead of making a numeric product route', () => {
    const items = parseMyRunway({
      products: [{
        id: 99,
        is_sold_out: false,
        name: 'Product without a route key',
        selling_price: '100',
      }],
    })

    expect(items[0].productUrl).toBe('https://myrunway.co.za/')
  })
})

describe('helpers', () => {
  it('decodes common WordPress entities', () => {
    expect(decodeEntities('Fish &amp; Chips &#8211; R50')).toBe('Fish & Chips – R50')
  })

  it('extractNextData returns undefined on malformed json', () => {
    expect(extractNextData('<script id="__NEXT_DATA__" type="application/json">{bad</script>')).toBeUndefined()
  })
})
