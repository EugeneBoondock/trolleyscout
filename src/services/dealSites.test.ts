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
    expect(item.retailerName).toBe('Maeve Living')
    expect(item.priceText).toBe('R1,499')
    expect(item.previousPriceText).toBe('R5,000')
    expect(item.savingText).toBe('Save R3,500 (70% off)')
    expect(item.expiresAt).toBe('2026-07-18 23:59:59')
    expect(item.productUrl).toContain('/product/flatweave-rug-20260709')
    expect(item.source).toBe('onedayonly')
  })

  it('returns empty for html without __NEXT_DATA__', () => {
    expect(parseOneDayOnly('<html></html>')).toEqual([])
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
        images: [{ src: 'https://cdn.shopify.com/x.png' }],
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
    expect(item.productUrl).toBe('https://myrunway.co.za/products/roxy-sandals-27138')
    expect(item.category).toBe('Shoes')
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
