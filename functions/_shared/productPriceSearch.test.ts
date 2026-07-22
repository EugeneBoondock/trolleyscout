import { describe, expect, it } from 'vitest'

import {
  applyPromotionFallbackPrices,
  buildKnownProductSearchRequest,
  buildProductComparison,
  parseClicksProductResults,
  parseGameProductResults,
  parseKlevuProductResults,
  parsePnpProductResults,
  parseShopriteGroupProductResults,
  parseTakealotProductResults,
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
    // A retailer with no known product API falls back to the official-site
    // web search and reports a found-but-unpriced result honestly.
    const result = await searchRetailerProduct(
      {
        id: 'spar',
        name: 'SPAR',
        sources: [{ kind: 'specials', label: 'Specials', url: 'https://www.spar.co.za/' }],
      },
      'white bread',
      {
        fetcher: async () => Response.json({}),
        searcher: async () => [{
          title: 'Sasko White Bread 700g',
          url: 'https://www.spar.co.za/deals/white-bread',
        }],
      },
    )

    expect(result).toEqual({
      productUrl: 'https://www.spar.co.za/deals/white-bread',
      retailerId: 'spar',
      retailerName: 'SPAR',
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

  it('builds a POST search request for Pick n Pay and parses in-stock priced rows', () => {
    const request = buildKnownProductSearchRequest('pick-n-pay', 'milk 2l')
    expect(request?.init?.method).toBe('POST')
    expect(request?.url).toContain('pnphybris/v2/pnp-spa/products/search')
    expect(request?.url).toContain('storeCode=WC21')

    const products = parsePnpProductResults({
      products: [
        {
          name: 'PnP Full Cream Fresh Milk 2L',
          price: { formattedValue: 'R32.99', value: 32.99 },
          stock: { stockLevelStatus: 'inStock' },
          url: '/pnp-full-cream-fresh-milk-2l/p/000000000000357781_EA',
        },
        {
          name: 'PnP Low Fat Milk 2L',
          price: { value: 31.99 },
          stock: { stockLevelStatus: 'outOfStock' },
          url: '/pnp-low-fat-milk-2l/p/1',
        },
        {
          name: 'PnP Milk Tart',
          price: { value: 49.99 },
          stock: { stockLevelStatus: 'inStock' },
          url: '/pnp-milk-tart/p/2',
        },
      ],
    }, 'milk 2l')

    expect(products).toEqual([{
      priceCents: 3299,
      productUrl: 'https://www.pnp.co.za/pnp-full-cream-fresh-milk-2l/p/000000000000357781_EA',
      title: 'PnP Full Cream Fresh Milk 2L',
    }])
  })

  it('builds an anonymous browse-by-store POST for Shoprite and Checkers', () => {
    const shoprite = buildKnownProductSearchRequest('shoprite', 'milk 2l')
    expect(shoprite?.init?.method).toBe('POST')
    expect(shoprite?.url).toBe('https://www.shoprite.co.za/api/browse-by-store/get-products-filter')
    const body = JSON.parse(String(shoprite?.init?.body)) as {
      payload: { filter: { productListSource: { search: string } }; userContext: { storeIds: string[] } }
    }
    expect(body.payload.filter.productListSource.search).toBe('milk 2l')
    expect(body.payload.userContext.storeIds).toHaveLength(1)
    expect(new Headers(shoprite?.init?.headers)).toBeTruthy()

    const checkers = buildKnownProductSearchRequest('checkers', 'milk')
    expect(checkers?.url).toBe('https://www.checkers.co.za/api/browse-by-store/get-products-filter')
  })

  it('parses Shoprite-Group products via price and the integer price pair', () => {
    const products = parseShopriteGroupProductResults('shoprite', {
      products: [
        {
          id: '5d3af63bf434cf8420737def',
          name: 'Crystal Valley Full Cream Milk 2L',
          price: 36.99,
          priceWithoutDecimal: 3699,
          priceFactor: 100,
          discountedPrice: 36.99,
        },
        {
          // No decimal price field (the Checkers case) — reconstruct from the pair.
          id: 'abc123',
          name: 'Clover Fresh Full Cream Milk 2L',
          priceWithoutDecimal: 3799,
          priceFactor: 100,
        },
        {
          id: 'notmilk',
          name: 'Milk Tart Slice',
          price: 24.99,
        },
      ],
    }, 'milk 2l')

    expect(products).toEqual([
      {
        priceCents: 3699,
        productUrl: 'https://www.shoprite.co.za/product/5d3af63bf434cf8420737def',
        title: 'Crystal Valley Full Cream Milk 2L',
      },
      {
        priceCents: 3799,
        productUrl: 'https://www.shoprite.co.za/product/abc123',
        title: 'Clover Fresh Full Cream Milk 2L',
      },
    ])
  })

  it('parses Takealot buybox results and keeps only real product matches', () => {
    const row = (title: string, price: number, inStock = true) => ({
      product_views: {
        buybox_summary: { prices: [price] },
        core: { id: 72300062, slug: 'slug-here', title },
        stock_availability_summary: { is_in_stock: inStock },
      },
    })

    const products = parseTakealotProductResults({
      sections: {
        products: {
          results: [
            row('Clover Fresh Full Cream Milk 2L', 42),
            row('2L Square Milk Canister: 10 Pack', 199),
            row('Parmalat Fresh Milk 2 Litre', 39, false),
          ],
        },
      },
    }, 'fresh milk 2l')

    // The canister lacks the "fresh" token and the out-of-stock row is
    // dropped — only the genuine grocery survives.
    expect(products).toEqual([
      expect.objectContaining({
        priceCents: 4200,
        productUrl: 'https://www.takealot.com/slug-here/PLID72300062',
        title: 'Clover Fresh Full Cream Milk 2L',
      }),
    ])
  })

  it('matches size tokens across unit spellings', () => {
    const products = parsePnpProductResults({
      products: [{
        name: 'PnP Fresh Full Cream Milk 2 Litre',
        price: { value: 32.99 },
        stock: { stockLevelStatus: 'inStock' },
        url: '/milk/p/1',
      }],
    }, 'milk 2l')

    expect(products).toHaveLength(1)
  })

  it('keeps a catalogue price usable for its whole validity window', () => {
    const matches = applyPromotionFallbackPrices(
      [{
        retailerId: 'checkers',
        retailerName: 'Checkers',
        status: 'unavailable',
      }],
      'milk 2l',
      'ZAR',
      [{
        // Captured five days ago — outside the 72h capture gate — but the
        // catalogue is valid until Sunday, so the price is still right.
        capturedAt: '2026-07-17T08:00:00.000Z',
        evidenceText: '{}',
        expiresAt: '2026-07-27T21:59:59.000Z',
        id: 'checkers-milk',
        priceText: 'R31.99',
        productUrl: 'https://specials.checkers.co.za/current/index.html#page=2',
        retailerId: 'checkers',
        retailerName: 'Checkers',
        sourceLabel: 'Catalogue scan',
        sourceUrl: 'https://specials.checkers.co.za/current/index.html',
        title: 'Clover Fresh Milk 2L',
        validTo: '2026-07-27',
      }],
      new Date('2026-07-22T12:00:00.000Z'),
    )

    expect(matches[0]).toMatchObject({
      priceCents: 3199,
      sourceKind: 'promotion',
      status: 'priced',
    })
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
