// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { countryFromCode } from './countryContext'
import type { TrolleyScoutEnv } from './env'
import { searchGlobalProperties } from './globalPropertyScout'

describe('global property source discovery', () => {
  let miniflare: Miniflare
  let db: D1Database
  let env: TrolleyScoutEnv & { DB: D1Database }

  beforeEach(async () => {
    miniflare = new Miniflare({
      d1Databases: { DB: 'global-property-scout-test' },
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
    })
    db = await miniflare.getD1Database('DB') as unknown as D1Database
    env = { DB: db }
    await db.prepare(
      `CREATE TABLE property_cache (
        cache_key TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        item_count INTEGER NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL,
        country_code TEXT NOT NULL
      )`,
    ).run()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await miniflare.dispose()
  })

  it('ignores a fresh empty cache row and discovers property platforms again', async () => {
    await db.prepare(
      `INSERT INTO property_cache (cache_key, payload_json, item_count, fetched_at, country_code)
       VALUES (?, ?, 0, ?, 'ZW')`,
    ).bind(
      'global:v2:ZW:sale:harare:1',
      JSON.stringify({ listings: [], sources: [] }),
      new Date().toISOString(),
    ).run()

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        const target = encodeURIComponent('https://www.property.co.zw/for-sale/harare')
        return htmlResponse(
          `<a class="result__a" href="//duckduckgo.com/l/?uddg=${target}&amp;rut=x">Three bedroom house for sale in Harare</a>`,
        )
      }
      if (url.hostname === 'www.property.co.zw') {
        return htmlResponse(`<script type="application/ld+json">${JSON.stringify({
          '@type': 'House',
          address: { addressLocality: 'Harare' },
          name: 'Three bedroom house in Harare',
          numberOfBedrooms: 3,
          offers: { price: 125000, priceCurrency: 'USD' },
          url: 'https://www.property.co.zw/for-sale/harare/house-123',
        })}</script>`)
      }
      return htmlResponse('')
    }))

    const result = await searchGlobalProperties(
      env,
      { listingType: 'sale', query: 'Harare' },
      countryFromCode('ZW'),
    )

    expect(result.listings).toEqual([
      expect.objectContaining({
        listingUrl: 'https://www.property.co.zw/for-sale/harare/house-123',
        title: 'Three bedroom house in Harare',
      }),
    ])
    expect(result.sources).toEqual([
      expect.objectContaining({
        id: 'web:property-co-zw',
        label: 'Property',
        ok: true,
      }),
    ])
  })

  it('does not cache an empty result when every search provider is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    const result = await searchGlobalProperties(
      env,
      { listingType: 'rent', query: 'Harare' },
      countryFromCode('ZW'),
    )
    const cached = await db.prepare(
      `SELECT item_count FROM property_cache WHERE cache_key = 'global:v2:ZW:rent:harare:1'`,
    ).first<{ item_count: number }>()

    expect(result.listings).toEqual([])
    expect(result.sources).toEqual([])
    expect(cached).toBeNull()
  })

  it('keeps relevant French and Portuguese property portals and drops unrelated results', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'html.duckduckgo.com') {
        return htmlResponse('')
      }
      if (url.hostname === 'r.jina.ai' && url.pathname.includes('search.yahoo.com')) {
        return htmlResponse(`
          [Appartement à louer à Kinshasa](https://immobilier.example.cd/appartement-kinshasa)
          [Moradia para venda em Maputo](https://imoveis.example.mz/moradia-maputo)
          [Latest football results](https://sports.example/results)
        `)
      }
      return htmlResponse('')
    }))

    const result = await searchGlobalProperties(
      env,
      { listingType: 'rent', query: 'Kinshasa' },
      countryFromCode('CD'),
    )

    expect(result.listings.map((listing) => listing.title)).toEqual([
      'Appartement à louer à Kinshasa',
    ])
    expect(result.sources).toHaveLength(1)
    expect(result.sources.every((source) => source.label === 'Example')).toBe(true)
  })
})

function htmlResponse(body: string) {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status: 200,
  })
}
