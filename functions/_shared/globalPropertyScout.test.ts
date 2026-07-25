// @vitest-environment node

import { Miniflare } from 'miniflare'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPropertySources } from '../../src/services/propertySourceRegistry'
import { countryFromCode } from './countryContext'
import type { TrolleyScoutEnv } from './env'
import {
  parseGenericPropertyListings,
  propertySourceUrlForLocation,
  searchGlobalProperties,
} from './globalPropertyScout'

describe('property platform location URLs', () => {
  it('targets the searched city on Zimbabwe property platforms', () => {
    expect(propertySourceUrlForLocation(
      'https://www.property.co.zw/houses-for-sale',
      'Bulawayo',
      'sale',
    )).toBe('https://www.property.co.zw/property-for-sale/bulawayo')
    expect(propertySourceUrlForLocation(
      'https://www.property.co.zw/',
      'Bulawayo',
      'rent',
    )).toBe('https://www.property.co.zw/property-for-rent/bulawayo')
    expect(propertySourceUrlForLocation(
      'https://www.propertybook.co.zw/',
      'Bulawayo',
      'sale',
    )).toBe('https://www.propertybook.co.zw/for-sale/bulawayo')
    expect(propertySourceUrlForLocation(
      'https://www.propertybook.co.zw/',
      'Bulawayo',
      'rent',
    )).toBe('https://www.propertybook.co.zw/to-rent/bulawayo')
  })

  it('leaves unknown platform URLs unchanged', () => {
    expect(propertySourceUrlForLocation(
      'https://example.com/listings',
      'Bulawayo',
      'sale',
    )).toBe('https://example.com/listings')
  })

  it('points templated portal URLs at the searched city', () => {
    expect(propertySourceUrlForLocation(
      'https://www.pararius.nl/huurwoningen/{location}',
      'Amsterdam',
      'rent',
    )).toBe('https://www.pararius.nl/huurwoningen/amsterdam')
    expect(propertySourceUrlForLocation(
      'https://housinganywhere.com/s/{Location}--Netherlands',
      'Amsterdam',
      'rent',
    )).toBe('https://housinganywhere.com/s/Amsterdam--Netherlands')
    expect(propertySourceUrlForLocation(
      'https://www.craigslist.org/search/area/{location}?cat=apa',
      'Austin',
      'rent',
    )).toBe('https://www.craigslist.org/search/area/austin?cat=apa')
  })
})

describe('registered property portals outside southern Africa', () => {
  it('offers United States and Netherlands portals for both listing types', () => {
    const usSale = getPropertySources('US', 'sale').map((source) => source.label)
    const usRent = getPropertySources('us', 'rent').map((source) => source.label)
    const nlRent = getPropertySources('NL', 'rent').map((source) => source.label)

    expect(usSale).toContain('Redfin')
    expect(usSale).toContain('RE/MAX')
    expect(usRent).toEqual(expect.arrayContaining(['Redfin', 'Craigslist', 'Zumper', 'ApartmentGuide']))
    expect(nlRent).toEqual(expect.arrayContaining([
      'Rentola',
      'Pararius',
      'Huurwoningen.nl',
      'Huurstunt',
      'VBO Vastgoed Nederland',
      'Kamernet',
      'HousingAnywhere',
      'Pandomo',
    ]))
  })

  it('leaves out portals that answer with a challenge instead of listings', () => {
    const registered = [
      ...getPropertySources('US', 'sale'),
      ...getPropertySources('US', 'rent'),
      ...getPropertySources('NL', 'sale'),
      ...getPropertySources('NL', 'rent'),
    ].map((source) => source.url).join(' ')

    for (const blocked of [
      'zillow.com',
      'trulia.com',
      'hotpads.com',
      'movoto.com',
      'realtor.com',
      'homes.com',
      'apartments.com',
      'loopnet.com',
      'compass.com',
      'rent.com',
      'funda.nl',
    ]) {
      expect(registered).not.toContain(blocked)
    }
  })
})

// Markup below is copied from pages fetched from each portal in July 2026.
describe('property listing pages from the United States and the Netherlands', () => {
  it('reads a euro price with Dutch thousands and decimal separators', () => {
    const html = `
      <a href="https://aanbod.vastgoednederland.nl/huurwoningen/amsterdam/woning-652492-wijsmullerstraat-26-2" class="propertyLink">
        <figure class="property">
          <img src="https://d1zsattj8yq64o.cloudfront.net/media/21724134/424x318_crop.jpg" alt="Wijsmullerstraat 26 2">
          <figcaption>
            <span class="street">Wijsmullerstraat 26 2</span><br>
            <span class="city">Amsterdam</span><br>
            <span class="price">€ 4.400,- p/m</span>
            <div class="bottom"><ul><li><span class="icon icon-meter"></span> 125 m&sup2;</li><li><span class="icon icon-bed"></span> 4</li></ul></div>
          </figcaption>
        </figure>
      </a>
      <a href="https://aanbod.vastgoednederland.nl/huurwoningen/amsterdam/woning-652484-werfkade-73" class="propertyLink">
        <figure class="property">
          <img src="https://d1zsattj8yq64o.cloudfront.net/media/21723767/424x318_crop.jpg" alt="Werfkade 73">
          <figcaption>
            <span class="street">Werfkade 73</span><br>
            <span class="city">Amsterdam</span><br>
            <span class="price">&euro; 1.250,50 p/m</span>
          </figcaption>
        </figure>
      </a>
    `

    expect(parseGenericPropertyListings(
      html,
      'https://aanbod.vastgoednederland.nl/huurwoningen/amsterdam',
      'rent',
      'EUR',
    )).toEqual([
      expect.objectContaining({
        currencyCode: 'EUR',
        priceText: '€4,400',
        priceValue: 4400,
        title: 'Wijsmullerstraat 26 2',
      }),
      expect.objectContaining({
        currencyCode: 'EUR',
        priceValue: 1250.5,
        title: 'Werfkade 73',
      }),
    ])
  })

  it('recognises a Dutch listing page and keeps square metres out of the price', () => {
    const html = `
      <a class="MuiCard-root SearchResultCard_root__hSxn3" href="/en/for-rent/room-amsterdam/le-mairekade/room-2395401">
        <div><img class="ListingCard_listingImage__5PYQU" src="https://resources.kamernet.nl/image/422dc157/resize/422-225" alt="Room for rent 1100 euro Le Mairekade, Amsterdam" loading="lazy"/></div>
        <div class="SearchResultCard_content__qyUch">
          <div class="SearchResultCard_contentRow__VZIJY"><span>Le Mairekade<!-- -->,</span><span>Amsterdam</span></div>
          <div class="SearchResultCard_contentRow__VZIJY"><p>65 m&sup2; furnished Room</p><p>From 25 Jul 2026</p><p>€1,100 /month</p></div>
        </div>
      </a>
      <a href="/nl/huurwoningen/amsterdam/appartement-prinsengracht">
        <h3>Appartement Prinsengracht</h3>
        <div class="price">&euro; 2.750 per maand</div>
      </a>
    `

    expect(parseGenericPropertyListings(
      html,
      'https://kamernet.nl/en/for-rent/properties-amsterdam',
      'rent',
      'EUR',
    )).toEqual([
      expect.objectContaining({
        currencyCode: 'EUR',
        listingUrl: 'https://kamernet.nl/en/for-rent/room-amsterdam/le-mairekade/room-2395401',
        priceValue: 1100,
        title: 'Room for rent 1100 euro Le Mairekade, Amsterdam',
      }),
      expect.objectContaining({
        listingUrl: 'https://kamernet.nl/nl/huurwoningen/amsterdam/appartement-prinsengracht',
        priceValue: 2750,
        title: 'Appartement Prinsengracht',
      }),
    ])
  })

  it('reads a priced listing whose address hangs off the offer', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: [{
          '@type': 'ListItem',
          item: {
            '@id': 'https://www.remax.com/tx/austin/home-details/6406-chimney-creek-cir-b-austin-tx-78723/3175545',
            '@type': 'RealEstateListing',
            offers: {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Apartment',
                address: {
                  '@type': 'PostalAddress',
                  addressLocality: 'AUSTIN',
                  addressRegion: 'TX',
                  postalCode: '78723',
                  streetAddress: '6406 CHIMNEY CREEK CIR # B',
                },
                numberOfBathroomsTotal: 3,
                numberOfBedrooms: 3,
              },
              price: 259000,
              priceCurrency: 'USD',
            },
            url: 'https://www.remax.com/tx/austin/home-details/6406-chimney-creek-cir-b-austin-tx-78723/3175545',
          },
          position: 1,
        }],
        numberOfItems: 7168,
      },
    })}</script>`

    expect(parseGenericPropertyListings(
      html,
      'https://www.remax.com/homes-for-sale/tx/austin',
      'sale',
      'USD',
    )).toEqual([
      expect.objectContaining({
        bathrooms: 3,
        bedrooms: 3,
        currencyCode: 'USD',
        location: '6406 CHIMNEY CREEK CIR # B, AUSTIN',
        priceValue: 259000,
        propertyType: 'Apartment',
        province: 'TX',
        title: '6406 CHIMNEY CREEK CIR # B, AUSTIN, TX',
      }),
    ])
  })

  it('takes the price from the sibling block that shares the listing URL', () => {
    const listingUrl = 'https://www.redfin.com/TX/Austin/1504-Collier-St-78704/unit-4/home/44511032'
    const html = `<script type="application/ld+json">${JSON.stringify([
      {
        '@context': 'http://schema.org',
        '@type': 'SingleFamilyResidence',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Austin',
          addressRegion: 'TX',
          streetAddress: '1504 Collier St #4',
        },
        name: '1504 Collier St #4, Austin, TX 78704',
        numberOfRooms: 3,
        url: listingUrl,
      },
      {
        '@context': 'http://schema.org',
        '@type': 'Product',
        name: '1504 Collier St #4, Austin, TX 78704',
        offers: { '@type': 'Offer', price: '799500', priceCurrency: 'USD' },
        url: listingUrl,
      },
    ])}</script>`

    expect(parseGenericPropertyListings(
      html,
      'https://www.redfin.com/city/30818/TX/Austin',
      'sale',
      'USD',
    )).toEqual([
      expect.objectContaining({
        bedrooms: 3,
        currencyCode: 'USD',
        listingUrl,
        priceText: '$799,500',
        priceValue: 799500,
        title: '1504 Collier St #4, Austin, TX 78704',
      }),
    ])
  })

  it('reads a card that names the property in a titled row', () => {
    const html = `
      <li class="cl-static-search-result" title="Amazing 2 BR 2 BA 1177 SF Must See!">
        <a href="https://www.craigslist.org/view/d/austin-amazing-br-ba-1177-sf-must-see/sRbLSqe7c9nrh6SPvLoFW8">
          <div class="title">Amazing 2 BR 2 BA 1177 SF Must See!</div>
          <div class="details">
            <div class="price">$1,704</div>
            <div class="location">Located in the Oak Hill area of Austin, Texas.</div>
          </div>
        </a>
      </li>
    `

    expect(parseGenericPropertyListings(
      html,
      'https://www.craigslist.org/search/area/austin?cat=apa',
      'rent',
      'USD',
    )).toEqual([
      expect.objectContaining({
        currencyCode: 'USD',
        listingUrl: 'https://www.craigslist.org/view/d/austin-amazing-br-ba-1177-sf-must-see/sRbLSqe7c9nrh6SPvLoFW8',
        location: 'Located in the Oak Hill area of Austin, Texas.',
        priceValue: 1704,
        title: 'Amazing 2 BR 2 BA 1177 SF Must See!',
      }),
    ])
  })

  it('reads a card whose heading wraps the link and whose price follows it', () => {
    const html = `
      <h2><a href="/detail/koop/amsterdam/appartement-van-heenvlietlaan-264-a/44448667/" data-testid="listingDetailsAddress">
        <div class="flex font-semibold"><span class="truncate">Van Heenvlietlaan 264-A </span></div>
        <div class="truncate text-neutral-80">1083 CN Amsterdam </div>
      </a></h2>
      <div class="mt-2"><div class="flex gap-2"><div class="font-semibold"><div class="truncate">€ 230.000 k.k.</div></div></div></div>
    `

    expect(parseGenericPropertyListings(
      html,
      'https://www.funda.nl/zoeken/koop?selected_area=amsterdam',
      'sale',
      'EUR',
    )).toEqual([
      expect.objectContaining({
        currencyCode: 'EUR',
        listingUrl: 'https://www.funda.nl/detail/koop/amsterdam/appartement-van-heenvlietlaan-264-a/44448667/',
        priceValue: 230000,
        title: 'Van Heenvlietlaan 264-A 1083 CN Amsterdam',
      }),
    ])
  })

  it('reads nothing from a token page that carries no listings', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title></title>
      <script type="text/javascript">
      window.awsWafCookieDomainList = ['www.rent.com','rent.com'];
      window.gokuProps = {"key":"AQIDAHjcYu","iv":"EkQcSgADjAAADsmE","context":"BCjlmyhVrokeHMBPpayxnx7"};
      </script></head><body></body></html>`

    expect(parseGenericPropertyListings(
      html,
      'https://www.rent.com/texas/austin-apartments',
      'rent',
      'USD',
    )).toEqual([])
  })
})

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
      'global:v3:ZW:sale:harare:1',
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
      `SELECT item_count FROM property_cache WHERE cache_key = 'global:v3:ZW:rent:harare:1'`,
    ).first<{ item_count: number }>()

    expect(result.listings).toEqual([])
    expect(result.sources).toEqual([])
    expect(cached).toBeNull()
  })

  it('does not count a token page served as HTTP 202 as a working source', async () => {
    // The card is here so the test fails loudly if a 202 body is ever read:
    // a page that answers 202 has not served its listings yet.
    const wafPage = `<!DOCTYPE html><html><head><script>
      window.awsWafCookieDomainList = ['www.rent.com','rent.com'];
      window.gokuProps = {"key":"AQIDAHjcYu","iv":"EkQcSgADjAAADsmE"};
    </script></head><body>
      <a href="https://www.rent.com/texas/austin/oak-hill-apartment">
        <div class="title">Two bedroom apartment in Austin</div>
        <div class="price">$1,704</div>
      </a>
    </body></html>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (isSearchProvider(url)) return htmlResponse('')
      return new Response(wafPage, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 202,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchGlobalProperties(
      env,
      { listingType: 'rent', query: 'Austin' },
      countryFromCode('US'),
    )

    expect(result.listings).toEqual([])
    expect(result.sources).toEqual([])
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input).startsWith('https://r.jina.ai/https://'))).toBe(true)
  })

  it('follows a moved search URL instead of treating the move as a failure', async () => {
    const card = `
      <li class="cl-static-search-result" title="Amazing 2 BR 2 BA 1177 SF Must See!">
        <a href="https://www.craigslist.org/view/d/austin-amazing-br-ba-1177-sf-must-see/sRbLSqe7c9nrh6SPvLoFW8">
          <div class="title">Amazing 2 BR 2 BA 1177 SF Must See!</div>
          <div class="details"><div class="price">$1,704</div></div>
        </a>
      </li>`
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (isSearchProvider(url)) return htmlResponse('')
      if (url.hostname !== 'www.craigslist.org') return htmlResponse('')
      if (!url.searchParams.has('moved')) {
        return new Response('', {
          headers: { location: `${url.toString()}&moved=1` },
          status: 301,
        })
      }
      return htmlResponse(card)
    }))

    const result = await searchGlobalProperties(
      env,
      { listingType: 'rent', query: 'Austin' },
      countryFromCode('US'),
    )

    expect(result.listings).toEqual([
      expect.objectContaining({
        priceValue: 1704,
        title: 'Amazing 2 BR 2 BA 1177 SF Must See!',
      }),
    ])
  })

  it('asks the reader for HTML even when no reader key is configured', async () => {
    const card = `
      <section class="listing-search-item">
        <h2 class="listing-search-item__title"><a href="/appartement-te-huur/amsterdam/062a56eb/keizersgracht">Keizersgracht</a></h2>
        <div class="listing-search-item__price"><span>€&nbsp;8.500 per maand</span></div>
      </section>`
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void init
      const url = new URL(String(input))
      if (isSearchProvider(url)) return htmlResponse('')
      if (url.hostname === 'r.jina.ai' && url.pathname.includes('pararius.nl')) {
        return htmlResponse(card)
      }
      if (url.hostname === 'r.jina.ai') return htmlResponse('')
      return new Response('', { status: 403 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await searchGlobalProperties(
      env,
      { listingType: 'rent', query: 'Amsterdam' },
      countryFromCode('NL'),
    )
    const readerCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('r.jina.ai/https://www.pararius.nl'))
    const headers = (readerCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>

    expect(headers['x-return-format']).toBe('html')
    expect(headers.authorization).toBeUndefined()
    expect(result.listings).toEqual([
      expect.objectContaining({
        currencyCode: 'EUR',
        listingUrl: 'https://www.pararius.nl/appartement-te-huur/amsterdam/062a56eb/keizersgracht',
        priceValue: 8500,
      }),
    ])
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

function isSearchProvider(url: URL): boolean {
  return /duckduckgo|bing|yahoo|s\.jina\.ai/.test(url.hostname) ||
    (url.hostname === 'r.jina.ai' && /duckduckgo|bing|yahoo/.test(url.pathname))
}

function htmlResponse(body: string) {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
    status: 200,
  })
}
