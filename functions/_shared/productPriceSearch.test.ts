import { describe, expect, it } from 'vitest'

import {
  applyPromotionFallbackPrices,
  buildKnownProductSearchRequest,
  buildProductComparison,
  parseClicksProductResults,
  parseGameProductResults,
  parseKlevuProductResults,
  parseWoolworthsProductResults,
  normalizeProductSearchInput,
  searchRetailerProduct,
  selectOfficialSearchCandidate,
} from './productPriceSearch'

describe('on-demand retailer product results', () => {
  it('normalizes a bounded query and a unique selected-store list', () => {
    expect(normalizeProductSearchInput({
      query: '  white bread  ',
      retailerIds: ['checkers', 'shoprite', 'checkers'],
    })).toEqual({ query: 'white bread', retailerIds: ['checkers', 'shoprite'] })
  })

  it('requires a real query and at least two selected stores', () => {
    expect(() => normalizeProductSearchInput({ query: 'x', retailerIds: ['checkers'] }))
      .toThrow('Enter at least two characters and pick at least two stores.')
    expect(() => normalizeProductSearchInput({
      query: 'white bread',
      retailerIds: Array.from({ length: 17 }, (_, index) => `store-${index}`),
    })).toThrow('Compare no more than 16 stores at once.')
  })

  it('puts the shopper query into Woolworths product search instead of a promotions browse', () => {
    const request = buildKnownProductSearchRequest('woolworths', 'white bread')

    expect(request?.url).toContain('/search/white%20bread')
    expect(request?.url).not.toContain('/browse/')
  })

  it('keeps regular Woolworths products even when they are not promotions', () => {
    const products = parseWoolworthsProductResults({
      response: {
        results: [{
          data: {
            description: 'White Thick Slice Bread 700 g',
            id: '20018702',
            p10: 21.99,
            promo: null,
            url: 'prod/Food/Bakery/White-Thick-Slice-Bread-700-g/_/A-20018702',
          },
        }],
      },
    }, 'white bread')

    expect(products).toEqual([{
      priceCents: 2199,
      productUrl: 'https://www.woolworths.co.za/prod/Food/Bakery/White-Thick-Slice-Bread-700-g/_/A-20018702',
      title: 'White Thick Slice Bread 700 g',
    }])
  })

  it('keeps a regular-price Klevu product that matches every search word', () => {
    const products = parseKlevuProductResults({
      result: [
        {
          name: 'White Bread Mix 400g',
          salePrice: '62.99',
          url: 'https://www.dischem.co.za/white-bread-mix-400g',
        },
        {
          name: 'White Roll-on 50ml',
          salePrice: '29.99',
          url: 'https://www.dischem.co.za/white-roll-on-50ml',
        },
      ],
    }, 'white bread')

    expect(products).toEqual([{
      priceCents: 6299,
      productUrl: 'https://www.dischem.co.za/white-bread-mix-400g',
      title: 'White Bread Mix 400g',
    }])
  })

  it('reads regular Clicks product prices without requiring a promotion', () => {
    const products = parseClicksProductResults({
      results: [{
        brand: 'Test Bakery',
        code: 'bread-1',
        name: 'White Bread 700g',
        price: { value: 24.99 },
        stock: { stockLevelStatus: { code: 'inStock' } },
        url: '/white-bread-700g/p/bread-1',
      }],
    }, 'white bread')

    expect(products).toEqual([{
      priceCents: 2499,
      productUrl: 'https://clicks.co.za/white-bread-700g/p/bread-1',
      title: 'Test Bakery White Bread 700g',
    }])
  })

  it('filters Game search noise that does not contain every query word', () => {
    const products = parseGameProductResults({
      products: [
        {
          name: 'Bread Bin White 1 Each',
          price: { value: 299 },
          url: '/bread-bin-white/p/1',
        },
        {
          name: 'Ice Cube Tray White',
          price: { value: 21.7 },
          url: '/ice-tray/p/2',
        },
      ],
    }, 'white bread')

    expect(products).toEqual([{
      priceCents: 29900,
      productUrl: 'https://www.game.co.za/bread-bin-white/p/1',
      title: 'Bread Bin White 1 Each',
    }])
  })

  it('uses a matching official subdomain result and rejects an aggregator', () => {
    const candidate = selectOfficialSearchCandidate(
      {
        id: 'checkers',
        name: 'Checkers',
        sources: [{ kind: 'specials', label: 'Offers', url: 'https://www.checkers.co.za/specials' }],
      },
      'white bread',
      [
        {
          title: 'White Bread price comparison',
          url: 'https://prices.example/checkers-white-bread',
        },
        {
          title: 'Sasko More Slices White Bread 700g R16.99',
          url: 'https://specials.checkers.co.za/deals/white-bread',
        },
      ],
    )

    expect(candidate).toEqual({
      priceCents: 1699,
      productUrl: 'https://specials.checkers.co.za/deals/white-bread',
      title: 'Sasko More Slices White Bread 700g R16.99',
    })
  })

  it('only treats a result price as live when it uses the selected country currency', () => {
    const retailer = {
      id: 'ok-zimbabwe',
      name: 'OK Zimbabwe',
      sources: [{ kind: 'store-finder' as const, label: 'Website', url: 'https://www.okzimbabwe.co.zw' }],
    }

    expect(selectOfficialSearchCandidate(retailer, 'white bread', [{
      title: 'White Bread 700g R19.99',
      url: 'https://shop.okzimbabwe.co.zw/white-bread',
    }], 'ZWG')?.priceCents).toBeUndefined()
    expect(selectOfficialSearchCandidate(retailer, 'white bread', [{
      title: 'White Bread 700g ZiG 25.50',
      url: 'https://shop.okzimbabwe.co.zw/white-bread',
    }], 'ZWG')?.priceCents).toBe(2550)
  })

  it('returns a priced result from a retailer product API', async () => {
    const result = await searchRetailerProduct(
      {
        id: 'woolworths',
        name: 'Woolworths',
        sources: [{ kind: 'specials', label: 'Savings', url: 'https://www.woolworths.co.za/' }],
      },
      'white bread',
      {
        fetcher: async () => Response.json({
          response: {
            results: [{
              data: {
                description: 'White Thick Slice Bread 700 g',
                id: '20018702',
                p10: 21.99,
                promo: null,
                url: 'prod/Food/Bakery/White-Thick-Slice-Bread-700-g/_/A-20018702',
              },
            }],
          },
        }),
        searcher: async () => [],
      },
    )

    expect(result).toMatchObject({
      priceCents: 2199,
      retailerId: 'woolworths',
      sourceKind: 'retailer-api',
      status: 'priced',
      title: 'White Thick Slice Bread 700 g',
    })
  })

  it('reports an official product result without pretending a missing price means no product', async () => {
    const result = await searchRetailerProduct(
      {
        id: 'checkers',
        name: 'Checkers',
        sources: [{ kind: 'specials', label: 'Offers', url: 'https://www.checkers.co.za/' }],
      },
      'white bread',
      {
        fetcher: async () => Response.json({}),
        searcher: async () => [{
          title: 'Sasko White Bread 700g',
          url: 'https://specials.checkers.co.za/deals/white-bread',
        }],
      },
    )

    expect(result).toEqual({
      productUrl: 'https://specials.checkers.co.za/deals/white-bread',
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceKind: 'official-site',
      status: 'found',
      title: 'Sasko White Bread 700g',
    })
  })

  it('reads a live price from structured data on a verified official product page', async () => {
    const result = await searchRetailerProduct(
      {
        id: 'checkers',
        name: 'Checkers',
        sources: [{ kind: 'specials', label: 'Offers', url: 'https://www.checkers.co.za/' }],
      },
      'milk 2l',
      {
        fetcher: async () => new Response(`
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Clover Fresh Full Cream Milk 2L",
              "offers": {
                "@type": "Offer",
                "price": "34.99",
                "priceCurrency": "ZAR"
              }
            }
          </script>
        `, { headers: { 'content-type': 'text/html' } }),
        searcher: async () => [{
          title: 'Checkers Sixty60 | Clover Fresh Full Cream Milk 2L',
          url: 'https://www.checkers.co.za/product/clover-fresh-full-cream-milk-2l',
        }],
      },
    )

    expect(result).toEqual({
      priceCents: 3499,
      productUrl: 'https://www.checkers.co.za/product/clover-fresh-full-cream-milk-2l',
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceKind: 'official-site',
      status: 'priced',
      title: 'Checkers Sixty60 | Clover Fresh Full Cream Milk 2L',
    })
  })

  it('needs two live prices before naming a cheapest store', () => {
    const comparison = buildProductComparison(
      { code: 'ZA', currencyCode: 'ZAR', flag: '🇿🇦', name: 'South Africa' },
      'white bread',
      [
        {
          priceCents: 1799,
          productUrl: 'https://www.pnp.co.za/white-bread',
          retailerId: 'pick-n-pay',
          retailerName: 'Pick n Pay',
          sourceKind: 'official-site',
          status: 'priced',
          title: 'White Bread 700g',
        },
        {
          retailerId: 'shoprite',
          retailerName: 'Shoprite',
          status: 'unavailable',
        },
      ],
      '2026-07-21T12:00:00.000Z',
    )

    expect(comparison.pricedCount).toBe(1)
    expect(comparison.cheapestRetailerId).toBeUndefined()
    expect(comparison.savingsCents).toBe(0)
  })

  it('uses a current promotion price when an official product page hides its price', () => {
    const matches = applyPromotionFallbackPrices(
      [{
        productUrl: 'https://www.pnp.co.za/pnp-full-cream-fresh-milk-2l',
        retailerId: 'pick-n-pay',
        retailerName: 'Pick n Pay',
        sourceKind: 'official-site',
        status: 'found',
        title: 'PnP Full Cream Fresh Milk 2L',
      }],
      'milk 2l',
      'ZAR',
      [{
        capturedAt: '2026-07-22T00:00:00.000Z',
        evidenceText: 'Official Pick n Pay promotion feed',
        expiresAt: '2026-07-24T21:59:59.000Z',
        id: 'pnp-milk-2l',
        priceText: 'R32.99',
        productUrl: 'https://www.pnp.co.za/pnp-full-cream-fresh-milk-2l/p/357781',
        retailerId: 'pick-n-pay',
        retailerName: 'Pick n Pay',
        sourceLabel: 'Pick n Pay',
        sourceUrl: 'https://www.pnp.co.za',
        title: 'PnP Full Cream Fresh Milk 2L',
      }],
      new Date('2026-07-22T12:00:00.000Z'),
    )

    expect(matches[0]).toMatchObject({
      priceCents: 3299,
      sourceKind: 'promotion',
      status: 'priced',
      title: 'PnP Full Cream Fresh Milk 2L',
    })
  })
})
