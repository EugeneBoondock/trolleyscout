import { describe, expect, it } from 'vitest'
import {
  buildAlgoliaDealsRequest,
  buildConstructorDealsUrl,
  buildKlevuDealsUrl,
  detectDealPlatform,
  parseAlgoliaDeals,
  parseConstructorDeals,
  parseKlevuDeals,
} from './dealPlatform'

describe('detectDealPlatform', () => {
  it('detects a Klevu store from its bootstrap JS (as Dis-Chem exposes it)', () => {
    const html = `
      var klevu_userSearchDomain = 'eucs7.ksearchnet.com';
      var klevu_cmsApiKey = 'klevu-15264750100467933';
    `
    expect(detectDealPlatform(html)).toEqual({
      apiKey: 'klevu-15264750100467933',
      platform: 'klevu',
      searchDomain: 'eucs7.ksearchnet.com',
    })
  })

  it('detects a Constructor.io store and remembers its cluster host', () => {
    const html = `fetch("https://ac.cnstrc.com/search"); var k = "key_tw9hKe0fkfgEf36D";`
    expect(detectDealPlatform(html)).toEqual({
      apiKey: 'key_tw9hKe0fkfgEf36D',
      host: 'ac.cnstrc.com',
      platform: 'constructor',
    })
  })

  it('detects an Algolia store', () => {
    const html = `
      window.algoliaConfig = { applicationId: "ABCD1234EF", searchApiKey: "0123456789abcdef0123456789abcdef" };
      script src="https://ABCD1234EF-dsn.algolia.net"
    `
    const detection = detectDealPlatform(html)
    expect(detection?.platform).toBe('algolia')
    expect(detection).toMatchObject({ appId: 'ABCD1234EF' })
  })

  it('returns undefined for a plain HTML store with no known platform', () => {
    expect(detectDealPlatform('<html><body><h1>Corner Shop</h1></body></html>')).toBeUndefined()
  })

  it('detects Klevu from just the key when the domain is only in the bootstrap JS', () => {
    // Real Dis-Chem homepage exposes klevu_cmsApiKey but not the search domain.
    const html = `<script>var klevu_cmsApiKey = 'klevu-15264750100467933';</script>`
    expect(detectDealPlatform(html)).toEqual({
      apiKey: 'klevu-15264750100467933',
      platform: 'klevu',
    })
  })

  it('requires at least the Klevu key', () => {
    expect(detectDealPlatform('mentions ksearchnet.com but no key')).toBeUndefined()
  })
})

describe('Klevu bootstrap resolution', () => {
  it('builds the deterministic bootstrap URL and extracts the search domain', async () => {
    const { buildKlevuBootstrapUrl, extractKlevuSearchDomain } = await import('./dealPlatform')
    expect(buildKlevuBootstrapUrl('klevu-123')).toBe(
      'https://js.klevu.com/klevu-js-v1/klevu-js-api/klevu-123.js',
    )
    const js = "var klevu_userSearchDomain = 'eucs7.ksearchnet.com', klevu_userJavascriptDomain='js.klevu.com';"
    expect(extractKlevuSearchDomain(js)).toBe('eucs7.ksearchnet.com')
  })
})

describe('buildKlevuDealsUrl', () => {
  it('builds a wildcard search URL against the detected domain', () => {
    const url = buildKlevuDealsUrl(
      { apiKey: 'klevu-123', platform: 'klevu', searchDomain: 'eucs7.ksearchnet.com' },
      100,
    )
    expect(url).toContain('https://eucs7.ksearchnet.com/cloud-search/n-search/search')
    expect(url).toContain('ticket=klevu-123')
    expect(url).toContain('paginationStartsFrom=100')
  })
})

describe('parseKlevuDeals', () => {
  it('keeps only discounted products and computes the saving', () => {
    const deals = parseKlevuDeals({
      result: [
        {
          name: 'Sunlight Dishwash 750ml',
          salePrice: '24.99',
          oldPrice: '32.99',
          url: '/sunlight-dishwash.html',
          imageUrl: 'https://cdn.store.co.za/sunlight.jpg',
        },
        { name: 'Full price item', salePrice: '50.00', oldPrice: '50.00' },
        { name: 'No price item' },
      ],
    })

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      title: 'Sunlight Dishwash 750ml',
      priceCents: 2499,
      previousPriceCents: 3299,
      promoLabel: 'Save R8.00',
      imageUrl: 'https://cdn.store.co.za/sunlight.jpg',
    })
  })

  it('resolves relative product URLs against the store host', () => {
    const deals = parseKlevuDeals(
      {
        result: [
          { name: 'X', salePrice: '10.00', oldPrice: '15.00', url: '/products/x' },
        ],
      },
      'shop.example.co.za',
    )
    expect(deals[0].productUrl).toBe('https://shop.example.co.za/products/x')
  })

  it('returns empty for a non-Klevu payload', () => {
    expect(parseKlevuDeals({ foo: 'bar' })).toEqual([])
  })
})

describe('Constructor.io generic querying', () => {
  it('builds a search URL against the detected cluster host', () => {
    const url = buildConstructorDealsUrl({
      apiKey: 'key_abc123def456',
      host: 'xyz-zone.cnstrc.com',
      platform: 'constructor',
    })

    expect(url).toContain('https://xyz-zone.cnstrc.com/search/special?')
    expect(url).toContain('key=key_abc123def456')
  })

  it('falls back to the shared cluster when no host was detected', () => {
    const url = buildConstructorDealsUrl({ apiKey: 'key_abc123def456', platform: 'constructor' })

    expect(url).toContain('https://ac.cnstrc.com/search/special?')
  })

  it('keeps only results whose sale price undercuts the regular price', () => {
    const payload = {
      response: {
        results: [
          {
            value: 'White Bread 700g',
            data: {
              image_url: '/media/bread.jpg',
              price: 21.99,
              sale_price: 17.99,
              url: '/products/white-bread',
            },
          },
          { value: 'Full-price Milk 2L', data: { price: 39.99, url: '/products/milk' } },
        ],
      },
    }

    const deals = parseConstructorDeals(payload, 'shop.example.co.za')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      imageUrl: 'https://shop.example.co.za/media/bread.jpg',
      previousPriceCents: 2199,
      priceCents: 1799,
      promoLabel: 'Save R4.00',
      title: 'White Bread 700g',
    })
  })
})

describe('Algolia generic querying', () => {
  it('builds a POST query request only when an index name surfaced', () => {
    const request = buildAlgoliaDealsRequest({
      apiKey: '0123456789abcdef0123456789abcdef',
      appId: 'ABCD1234EF',
      index: 'prod_products',
      platform: 'algolia',
    })

    expect(request?.url).toBe(
      'https://abcd1234ef-dsn.algolia.net/1/indexes/prod_products/query',
    )
    expect(request?.init.method).toBe('POST')
    expect(request?.init.headers['x-algolia-application-id']).toBe('ABCD1234EF')

    expect(
      buildAlgoliaDealsRequest({
        apiKey: '0123456789abcdef0123456789abcdef',
        appId: 'ABCD1234EF',
        platform: 'algolia',
      }),
    ).toBeUndefined()
  })

  it('keeps only discounted hits across common price field names', () => {
    const payload = {
      hits: [
        {
          name: 'Sunflower Oil 2L',
          special_price: 89.99,
          price: 119.99,
          image: 'https://cdn.example.com/oil.jpg',
          url: 'https://shop.example.co.za/oil',
        },
        { name: 'Full-price Rice 2kg', price: 54.99 },
      ],
    }

    const deals = parseAlgoliaDeals(payload, 'shop.example.co.za')

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      previousPriceCents: 11999,
      priceCents: 8999,
      promoLabel: 'Save R30.00',
      title: 'Sunflower Oil 2L',
    })
  })
})
