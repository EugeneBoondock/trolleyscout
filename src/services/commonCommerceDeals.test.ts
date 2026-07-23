import { describe, expect, it } from 'vitest'

import {
  COMMON_COMMERCE_DEAL_SCOPE,
  DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  MAX_COMMON_COMMERCE_DEALS,
  MAX_COMMON_COMMERCE_PAGES,
  MAX_COMMON_COMMERCE_PAGE_SIZE,
  buildCommonCommerceDealsRequest,
  buildMagentoDealsRequest,
  buildShopifyDealsRequest,
  buildVtexDealsRequest,
  buildWooCommerceDealsRequest,
  commonCommercePayloadItemCount,
  detectCommonCommercePlatform,
  parseCommonCommerceDeals,
  parseMagentoDeals,
  parseShopifyDeals,
  parseVtexDeals,
  parseWooCommerceDeals,
} from './commonCommerceDeals'

const STORE_ORIGIN = 'https://corner.example.co.za'

describe('detectCommonCommercePlatform', () => {
  it('detects Shopify from its storefront asset signature', () => {
    const html = '<script src="https://cdn.shopify.com/shopifycloud/storefront.js"></script>'

    expect(detectCommonCommercePlatform(html)).toEqual({
      platform: 'shopify',
      scope: COMMON_COMMERCE_DEAL_SCOPE,
    })
  })

  it('detects WooCommerce from its official plugin asset path', () => {
    const html = '<link href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css">'

    expect(detectCommonCommercePlatform(html)?.platform).toBe('woocommerce')
  })

  it('detects Magento from its page bootstrap marker', () => {
    const html = '<script type="text/x-magento-init">{"*":{"Magento_Ui/js/core/app":{}}}</script>'

    expect(detectCommonCommercePlatform(html)?.platform).toBe('magento')
  })

  it('detects VTEX from its storefront asset signature', () => {
    const html = '<script src="/_v/public/assets/v1/published/vtex.store@2.0.0/public/react/app.js"></script>'

    expect(detectCommonCommercePlatform(html)?.platform).toBe('vtex')
  })

  it('does not classify a plain store page', () => {
    expect(detectCommonCommercePlatform('<h1>Corner Grocer</h1>')).toBeUndefined()
  })
})

describe('public request descriptors', () => {
  it('builds a bounded Shopify products request on the verified store origin', () => {
    const request = buildShopifyDealsRequest(`${STORE_ORIGIN}/specials`, 5_000)

    expect(request).toMatchObject({
      init: { method: 'GET' },
      platform: 'shopify',
      scope: 'online-catalogue',
      url: `${STORE_ORIGIN}/products.json?limit=${MAX_COMMON_COMMERCE_PAGE_SIZE}&page=1`,
    })
  })

  it('builds a bounded WooCommerce on-sale Store API request', () => {
    const request = buildWooCommerceDealsRequest(STORE_ORIGIN, 24)
    const url = new URL(request?.url ?? '')

    expect(url.origin + url.pathname).toBe(
      `${STORE_ORIGIN}/wp-json/wc/store/v1/products`,
    )
    expect(url.searchParams.get('on_sale')).toBe('true')
    expect(url.searchParams.get('per_page')).toBe('24')
    expect(url.searchParams.get('page')).toBe('1')
  })

  it('builds a bounded Magento GraphQL POST request', () => {
    const request = buildMagentoDealsRequest(STORE_ORIGIN, 999, 999)
    const body = JSON.parse(request?.init.body ?? '{}')

    expect(request?.url).toBe(`${STORE_ORIGIN}/graphql`)
    expect(request?.init).toMatchObject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(body.variables.pageSize).toBe(MAX_COMMON_COMMERCE_PAGE_SIZE)
    expect(body.variables.currentPage).toBe(MAX_COMMON_COMMERCE_PAGES)
    expect(body.query).toContain('filter: { price: { from: "0.01" } }')
    expect(body.query).toContain('price_range')
  })

  it('builds a bounded VTEX catalogue request ordered by the best discount', () => {
    const request = buildVtexDealsRequest(`${STORE_ORIGIN}/sale`, 24, 2)
    const url = new URL(request?.url ?? '')

    expect(url.origin + url.pathname).toBe(
      `${STORE_ORIGIN}/api/catalog_system/pub/products/search`,
    )
    expect(url.searchParams.get('_from')).toBe('24')
    expect(url.searchParams.get('_to')).toBe('47')
    expect(url.searchParams.get('O')).toBe('OrderByBestDiscountDESC')
  })

  it('builds later bounded pages for each supported store platform', () => {
    expect(buildShopifyDealsRequest(STORE_ORIGIN, 20, 2)?.url).toBe(
      `${STORE_ORIGIN}/products.json?limit=20&page=2`,
    )
    const woo = new URL(buildWooCommerceDealsRequest(STORE_ORIGIN, 20, 2)?.url ?? '')
    expect(woo.searchParams.get('page')).toBe('2')
    expect(buildShopifyDealsRequest(STORE_ORIGIN, 20, 999)?.url).toContain(
      `page=${MAX_COMMON_COMMERCE_PAGES}`,
    )
  })

  it('dispatches by platform and rejects an untrusted origin shape', () => {
    expect(
      buildCommonCommerceDealsRequest('woocommerce', STORE_ORIGIN, 10)?.platform,
    ).toBe('woocommerce')
    expect(buildCommonCommerceDealsRequest('shopify', 'javascript:alert(1)')).toBeUndefined()
    expect(buildCommonCommerceDealsRequest('magento', 'https://user:pass@example.com')).toBeUndefined()
  })
})

describe('parseShopifyDeals', () => {
  it('keeps only a compare-at discount and parses common money formats safely', () => {
    const payload = {
      products: [
        {
          handle: 'family-rice-10kg',
          images: [{ src: '/cdn/shop/files/rice.jpg' }],
          title: 'Family Rice 10kg',
          variants: [{ compare_at_price: 'R 1.599,99', price: 'R\u00a01 299,99' }],
        },
        {
          handle: 'same-price',
          title: 'Same price',
          variants: [{ compare_at_price: '25.00', price: '25.00' }],
        },
        {
          handle: 'bulk-coffee',
          title: 'Bulk coffee',
          variants: [{ compare_at_price: '$1,499.99', price: '$1,299.99' }],
        },
        {
          handle: 'fake-discount',
          title: 'Reversed prices',
          variants: [{ compare_at_price: '19.99', price: '29.99' }],
        },
        {
          handle: 'bad-money',
          title: 'Malformed amount',
          variants: [{ compare_at_price: 'R ninety', price: 'R50' }],
        },
      ],
    }

    expect(parseShopifyDeals(payload, STORE_ORIGIN)).toEqual([
      {
        imageUrl: `${STORE_ORIGIN}/cdn/shop/files/rice.jpg`,
        previousPriceCents: 159_999,
        priceCents: 129_999,
        productUrl: `${STORE_ORIGIN}/products/family-rice-10kg`,
        title: 'Family Rice 10kg',
      },
      {
        imageUrl: undefined,
        previousPriceCents: 149_999,
        priceCents: 129_999,
        productUrl: `${STORE_ORIGIN}/products/bulk-coffee`,
        title: 'Bulk coffee',
      },
    ])
  })

  it('uses a discounted variant and rejects unsafe response URLs', () => {
    const result = parseShopifyDeals(
      {
        products: [{
          image: { src: 'javascript:alert(1)' },
          title: 'Soap refill',
          url: 'https://attacker.example/product',
          variants: [
            { compare_at_price: null, price: '20.00' },
            { compare_at_price: { amount: '24.99' }, price: { amount: '19.99' } },
          ],
        }],
      },
      STORE_ORIGIN,
    )

    expect(result).toEqual([{
      imageUrl: undefined,
      previousPriceCents: 2_499,
      priceCents: 1_999,
      productUrl: undefined,
      title: 'Soap refill',
    }])
  })
})

describe('parseWooCommerceDeals', () => {
  it('reads Store API minor-unit prices and resolves relative URLs', () => {
    const payload = [
      {
        images: [{ src: '/wp-content/uploads/bread.jpg' }],
        name: 'White Bread 700g',
        permalink: '/product/white-bread/',
        prices: {
          currency_minor_unit: 2,
          price: '1799',
          regular_price: '2199',
          sale_price: '1799',
        },
      },
      {
        name: 'Full-price Milk',
        prices: { currency_minor_unit: 2, price: '3999', regular_price: '3999' },
      },
    ]

    expect(parseWooCommerceDeals(payload, STORE_ORIGIN)).toEqual([{
      imageUrl: `${STORE_ORIGIN}/wp-content/uploads/bread.jpg`,
      previousPriceCents: 2_199,
      priceCents: 1_799,
      productUrl: `${STORE_ORIGIN}/product/white-bread/`,
      title: 'White Bread 700g',
    }])
  })

  it('converts non-standard currency minor units into cents', () => {
    const payload = [{
      name: 'Imported pantry item',
      prices: {
        currency_minor_unit: 3,
        regular_price: '12500',
        sale_price: '10000',
      },
    }]

    expect(parseWooCommerceDeals(payload, STORE_ORIGIN)[0]).toMatchObject({
      previousPriceCents: 1_250,
      priceCents: 1_000,
    })
  })
})

describe('parseMagentoDeals', () => {
  it('reads Magento price ranges and resolves its product and image paths', () => {
    const payload = {
      data: {
        products: {
          items: [
            {
              name: 'Sunflower Oil 2L',
              small_image: { url: '/media/catalog/product/oil.jpg' },
              url_key: 'sunflower-oil-2l',
              url_suffix: '.html',
              price_range: {
                minimum_price: {
                  final_price: { value: 89.99 },
                  regular_price: { value: 119.99 },
                },
              },
            },
            {
              name: 'Full-price Flour',
              price_range: {
                minimum_price: {
                  final_price: { value: 24.99 },
                  regular_price: { value: 24.99 },
                },
              },
            },
          ],
        },
      },
    }

    expect(parseMagentoDeals(payload, STORE_ORIGIN)).toEqual([{
      imageUrl: `${STORE_ORIGIN}/media/catalog/product/oil.jpg`,
      previousPriceCents: 11_999,
      priceCents: 8_999,
      productUrl: `${STORE_ORIGIN}/sunflower-oil-2l.html`,
      title: 'Sunflower Oil 2L',
    }])
  })
})

describe('parseVtexDeals', () => {
  it('keeps available VTEX offers with a real list-price discount', () => {
    const payload = [
      {
        items: [{
          images: [{ imageUrl: '/arquivos/sneaker.jpg' }],
          sellers: [{
            commertialOffer: {
              AvailableQuantity: 8,
              ListPrice: 1_299,
              Price: 779,
            },
          }],
        }],
        link: '/mens-home-replica/p',
        productName: 'MSFC Mens Home Replica',
      },
      {
        items: [{
          sellers: [{
            commertialOffer: {
              AvailableQuantity: 4,
              ListPrice: 399,
              Price: 399,
            },
          }],
        }],
        link: '/full-price/p',
        productName: 'Full price item',
      },
      {
        items: [{
          sellers: [{
            commertialOffer: {
              AvailableQuantity: 0,
              ListPrice: 799,
              Price: 499,
            },
          }],
        }],
        link: '/sold-out/p',
        productName: 'Sold out item',
      },
    ]

    expect(parseVtexDeals(payload, STORE_ORIGIN)).toEqual([{
      imageUrl: `${STORE_ORIGIN}/arquivos/sneaker.jpg`,
      previousPriceCents: 129_900,
      priceCents: 77_900,
      productUrl: `${STORE_ORIGIN}/mens-home-replica/p`,
      title: 'MSFC Mens Home Replica',
    }])
  })
})

describe('parser bounds and dispatch', () => {
  it('caps parser output even when a public feed returns more products', () => {
    const products = Array.from({ length: MAX_COMMON_COMMERCE_DEALS + 20 }, (_, index) => ({
      handle: `deal-${index}`,
      title: `Deal ${index}`,
      variants: [{ compare_at_price: '20.00', price: '10.00' }],
    }))

    expect(parseShopifyDeals({ products }, STORE_ORIGIN)).toHaveLength(
      MAX_COMMON_COMMERCE_DEALS,
    )
    expect(parseShopifyDeals({ products }, STORE_ORIGIN, 2)).toHaveLength(2)
    expect(parseShopifyDeals({ products }, STORE_ORIGIN, 0)).toEqual([])
  })

  it('dispatches parser work without network access', () => {
    const payload = [{
      name: 'Discounted tea',
      prices: { currency_minor_unit: 2, regular_price: '5000', sale_price: '4000' },
    }]

    expect(parseCommonCommerceDeals('woocommerce', payload, STORE_ORIGIN)[0]).toMatchObject({
      previousPriceCents: 5_000,
      priceCents: 4_000,
      title: 'Discounted tea',
    })
    expect(commonCommercePayloadItemCount('woocommerce', payload)).toBe(1)
    expect(commonCommercePayloadItemCount('shopify', { products: payload })).toBe(1)
    expect(commonCommercePayloadItemCount('magento', {
      data: { products: { items: payload } },
    })).toBe(1)
    expect(commonCommercePayloadItemCount('vtex', payload)).toBe(1)
    expect(DEFAULT_COMMON_COMMERCE_PAGE_SIZE).toBeGreaterThan(0)
  })
})
