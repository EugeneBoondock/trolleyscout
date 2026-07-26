import { describe, expect, it } from 'vitest'
import {
  buildSuperbalistHmUrl,
  decodeSuperbalistProductList,
  parseSuperbalistHmFeed,
} from './superbalistHm'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://superbalist.com/browse?designer_s%5B0%5D=hm&min_discount=1',
}

function list() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [{
      '@type': 'ListItem',
      item: {
        '@type': 'Product',
        brand: { '@type': 'Brand', name: 'H&M' },
        image:
          'https://assets.superbalistcdn.co.za/400x600/filters:quality(75):format(jpg)/' +
          '5089279/original.jpg',
        name: 'Knitted puff-sleeved top - grey marl',
        offers: {
          '@type': 'Offer',
          availability: 'InStock',
          price: '246.00',
          priceCurrency: 'ZAR',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: '379.00',
            priceCurrency: 'ZAR',
            priceType: 'StrikethroughPrice',
          },
          url:
            'https://superbalist.com/women/tops/knitwear/' +
            'knitted-puff-sleeved-top-grey-marl-1330559001/1725955',
        },
        sku: 1725955,
        url:
          'https://superbalist.com/women/tops/knitwear/' +
          'knitted-puff-sleeved-top-grey-marl-1330559001/1725955',
      },
      position: 1,
    }],
  }
}

describe('decodeSuperbalistProductList', () => {
  it('reads the server-rendered product list', () => {
    const html = `<script type="application/ld+json" id="product-list-jsonld">${
      JSON.stringify(list())
    }</script>`
    expect(decodeSuperbalistProductList(html)).toEqual(list())
  })

  it('rejects a page without the product list', () => {
    expect(() => decodeSuperbalistProductList('<html></html>'))
      .toThrow('Invalid Superbalist product list')
  })
})

describe('parseSuperbalistHmFeed', () => {
  it('maps the official H&M partner markdown', () => {
    const page = parseSuperbalistHmFeed(list(), context)

    expect(page.totalCount).toBe(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl:
        'https://assets.superbalistcdn.co.za/400x600/' +
        'filters:quality(75):format(jpg)/5089279/original.jpg',
      previousPriceCents: 37_900,
      priceCents: 24_600,
      productId: '1725955',
      productUrl:
        'https://superbalist.com/women/tops/knitwear/' +
        'knitted-puff-sleeved-top-grey-marl-1330559001/1725955',
      retailerId: 'h-and-m',
      savingText: '35% off',
      title: 'Knitted puff-sleeved top - grey marl',
    })
  })

  it('rejects products from another brand or without a real markdown', () => {
    const wrongBrand = structuredClone(list())
    wrongBrand.itemListElement[0].item.brand.name = 'Another Brand'
    const fullPrice = structuredClone(list())
    fullPrice.itemListElement[0].item.offers.price = '379.00'

    expect(parseSuperbalistHmFeed(wrongBrand, context).candidates).toEqual([])
    expect(parseSuperbalistHmFeed(fullPrice, context).candidates).toEqual([])
  })
})

describe('buildSuperbalistHmUrl', () => {
  it('requests only discounted H&M products', () => {
    expect(buildSuperbalistHmUrl(2)).toBe(
      'https://superbalist.com/browse?designer_s%5B0%5D=hm&min_discount=1&page=2',
    )
  })
})
