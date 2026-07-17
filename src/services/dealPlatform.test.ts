import { describe, expect, it } from 'vitest'
import {
  buildKlevuDealsUrl,
  detectDealPlatform,
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

  it('detects a Constructor.io store', () => {
    const html = `fetch("https://ac.cnstrc.com/search"); var k = "key_tw9hKe0fkfgEf36D";`
    expect(detectDealPlatform(html)).toEqual({
      apiKey: 'key_tw9hKe0fkfgEf36D',
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
