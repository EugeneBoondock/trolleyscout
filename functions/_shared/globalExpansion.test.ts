import { describe, expect, it } from 'vitest'
import { countryFromCode } from './countryContext'
import {
  applyCountryRetailerWebsites,
  buildRegisteredCountryRetailers,
  buildCountryRetailers,
  resolveCountryRetailerWebsite,
} from './countryRetailerScout'
import { emailLookup, protectEmail, revealEmail } from './emailProtection'
import { parseGenericPropertyListings } from './globalPropertyScout'
import { SADC_MARKET_SOURCES } from '../../src/services/sadcSourceRegistry'
import type { TrolleyScoutEnv } from './env'

const encryptedEnv: TrolleyScoutEnv = {
  EMAIL_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
}

describe('global country support', () => {
  it('maps Zimbabwe to its primary local currency and capital', () => {
    expect(countryFromCode('zw')).toMatchObject({
      capital: 'Harare',
      code: 'ZW',
      currencyCode: 'ZWG',
      name: 'Zimbabwe',
    })
  })

  it('registers every non-South-African SADC market audited in the browser', () => {
    expect(Object.keys(SADC_MARKET_SOURCES).sort()).toEqual([
      'AO', 'BW', 'CD', 'KM', 'LS', 'MG', 'MU', 'MW', 'MZ', 'NA', 'SC', 'SZ',
      'TZ', 'ZM', 'ZW',
    ])
    expect(
      Object.values(SADC_MARKET_SOURCES).every(
        (market) => market.propertySources.length > 0,
      ),
    ).toBe(true)
    expect(SADC_MARKET_SOURCES.KM?.retailStatus).toBe('social-only')
  })

  it('builds verified retailer entries from the audited source registry', () => {
    expect(
      buildRegisteredCountryRetailers(countryFromCode('AO')).map(
        (retailer) => retailer.name,
      ),
    ).toEqual(['AngoMart', 'Maxi'])
    expect(
      buildRegisteredCountryRetailers(countryFromCode('ZW')).map(
        (retailer) => retailer.name,
      ),
    ).toEqual(['SPAR Zimbabwe', 'TM Pick n Pay'])
  })

  it('builds a country retailer directory from likely official results', () => {
    const country = countryFromCode('ZW')
    const retailers = buildCountryRetailers(country, [
      { title: 'OK Zimbabwe | Official website', url: 'https://www.okzimbabwe.co.zw/specials' },
      { title: 'OK Zimbabwe on Facebook', url: 'https://facebook.com/okzimbabwe' },
    ])

    expect(retailers).toHaveLength(1)
    expect(retailers[0]).toMatchObject({
      id: 'country:zw:okzimbabwe-co-zw',
      name: 'OK Zimbabwe',
      program: 'Zimbabwe store',
    })
    expect(retailers[0].sources[0]).toMatchObject({ kind: 'specials' })
  })

  it('does not present catalogue aggregators as official country retailers', () => {
    const retailers = buildCountryRetailers(countryFromCode('ZW'), [
      {
        title: 'Kimbino Zimbabwe weekly catalogues',
        url: 'https://www.kimbino.co.zw/supermarkets',
      },
      {
        title: 'OK Zimbabwe | Official website',
        url: 'https://www.okzimbabwe.co.zw/specials',
      },
    ])

    expect(retailers.map((retailer) => retailer.name)).toEqual(['OK Zimbabwe'])
  })

  it('rejects search-provider navigation and results unrelated to the active country', () => {
    const retailers = buildCountryRetailers(countryFromCode('MZ'), [
      {
        title: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/',
      },
      {
        title: 'The Camellias | Luxury property',
        url: 'https://thecamellias.dlf.in/',
      },
      {
        title: 'Game Mozambique | Loja online',
        url: 'https://www.game.co.mz/',
      },
      {
        title: 'Kin Marché | Supermarché en ligne',
        url: 'https://www.kinmarche.com/',
      },
      {
        title: 'Promotions',
        url: 'https://contact@pharmacie-example.co.mz/',
      },
    ])

    expect(retailers.map((retailer) => retailer.name)).toEqual([
      'Game Mozambique',
      'Kin Marché',
    ])

    expect(buildCountryRetailers(countryFromCode('TZ'), [
      {
        title: 'Tanzania E-Immigration Online Portal',
        url: 'https://eservices.immigration.go.tz/',
      },
    ])).toEqual([])
  })

  it('derives the retailer brand from an official promotion-page host', () => {
    const retailers = buildCountryRetailers(countryFromCode('BW'), [
      {
        title: 'Promotions',
        url: 'https://choppies.co.bw/specials-promotions/',
      },
    ])

    expect(retailers).toEqual([
      expect.objectContaining({
        name: 'Choppies',
        sources: [
          expect.objectContaining({
            kind: 'specials',
            url: 'https://choppies.co.bw/specials-promotions/',
          }),
        ],
      }),
    ])
  })

  it('recognizes multilingual official promotion paths', () => {
    const retailers = buildCountryRetailers(countryFromCode('MZ'), [
      {
        title: 'Ofertas | Mercado Maputo',
        url: 'https://mercadomaputo.co.mz/promocoes/',
      },
    ])

    expect(retailers[0]?.sources[0]).toMatchObject({
      kind: 'specials',
      url: 'https://mercadomaputo.co.mz/promocoes/',
    })
  })

  it('merges official brand sites, removes title copy, and matches a nearby branch', () => {
    const retailers = buildCountryRetailers(countryFromCode('ZW'), [
      {
        title: 'SPAR Zimbabwe',
        trusted: true,
        url: 'https://www.spar.co.zw/',
      },
      {
        title: 'SPAR Zimbabwe \u2014 Fresh. Fast. Local.',
        trusted: true,
        url: 'https://online-spar.co.zw/',
      },
    ])

    expect(retailers).toHaveLength(1)
    expect(retailers[0]?.name).toBe('SPAR Zimbabwe')
    expect(retailers[0]?.sources).toHaveLength(2)
    expect(
      resolveCountryRetailerWebsite(
        'Spar Montague',
        countryFromCode('ZW'),
        retailers,
      ),
    ).toBe('https://online-spar.co.zw/')

    expect(applyCountryRetailerWebsites(
      [
        {
          countryCode: 'ZW',
          countryName: 'Zimbabwe',
          lat: -17.83,
          lon: 31.05,
          name: 'Spar Montague',
          placeId: 'spar-montague',
        },
        {
          countryCode: 'ZW',
          countryName: 'Zimbabwe',
          lat: -17.82,
          lon: 31.04,
          name: 'Independent Corner Shop',
          placeId: 'corner-shop',
        },
      ],
      countryFromCode('ZW'),
      retailers,
    )).toEqual([
      expect.objectContaining({
        name: 'Spar Montague',
        website: 'https://online-spar.co.zw/',
        websiteSource: 'country-retailer',
      }),
      expect.not.objectContaining({ website: expect.anything() }),
    ])
  })

})

describe('email protection', () => {
  it('encrypts email values with a random IV and keeps a stable keyed lookup', async () => {
    const first = await protectEmail(encryptedEnv, 'Member@Example.com')
    const second = await protectEmail(encryptedEnv, 'member@example.com')

    expect(first).toMatch(/^enc:v1:/)
    expect(first).not.toContain('member@example.com')
    expect(first).not.toBe(second)
    expect(await revealEmail(encryptedEnv, first)).toBe('member@example.com')
    expect(await emailLookup(encryptedEnv, 'Member@Example.com')).toBe(
      await emailLookup(encryptedEnv, 'member@example.com'),
    )
  })
})

describe('international property parsing', () => {
  it('reads property JSON-LD from an arbitrary platform', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'House',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Harare',
        streetAddress: '10 Samora Machel Avenue',
      },
      name: 'Three bedroom home in Harare',
      numberOfBathroomsTotal: 2,
      numberOfBedrooms: 3,
      offers: { price: 125000, priceCurrency: 'USD' },
      url: '/homes/three-bedroom-harare',
    })}</script>`

    expect(
      parseGenericPropertyListings(html, 'https://homes.example/search', 'sale', 'ZWG'),
    ).toEqual([
      expect.objectContaining({
        bathrooms: 2,
        bedrooms: 3,
        currencyCode: 'USD',
        listingUrl: 'https://homes.example/homes/three-bedroom-harare',
        location: '10 Samora Machel Avenue, Harare',
        priceValue: 125000,
        title: 'Three bedroom home in Harare',
      }),
    ])
  })

  it('reads property listings from bounded Next.js page state', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          listings: [
            {
              bathrooms: 2,
              bedrooms: 3,
              currency: 'BWP',
              imageUrl: '/images/gaborone-home.jpg',
              listingUrl: '/property/gaborone-family-home',
              location: 'Gaborone West',
              price: 1450000,
              propertyType: 'House',
              title: 'Family home in Gaborone',
            },
          ],
        },
      },
    })}</script>`

    expect(
      parseGenericPropertyListings(
        html,
        'https://property.example.bw/search/gaborone',
        'sale',
        'BWP',
      ),
    ).toEqual([
      expect.objectContaining({
        bathrooms: 2,
        bedrooms: 3,
        currencyCode: 'BWP',
        listingUrl: 'https://property.example.bw/property/gaborone-family-home',
        location: 'Gaborone West',
        priceValue: 1450000,
        propertyType: 'House',
        title: 'Family home in Gaborone',
      }),
    ])
  })

  it('reads visible property cards when a portal renders listing HTML', () => {
    const html = `
      <a href="/4-bedroom-house-for-sale-in-gaborone-117416899">
        <img src="/images/gaborone-home.jpg" alt="4 Bedroom House Gaborone">
        <h3>4 Bedroom House in Gaborone</h3>
        <div class="property-location">Gaborone North</div>
        <div class="price">P 1 100 000</div>
        <span>4 Bedrooms</span>
        <span>3 Bathrooms</span>
      </a>
    `

    expect(
      parseGenericPropertyListings(
        html,
        'https://www.property24.co.bw/houses-for-sale',
        'sale',
        'BWP',
      ),
    ).toEqual([
      expect.objectContaining({
        bathrooms: 3,
        bedrooms: 4,
        currencyCode: 'BWP',
        imageUrl: 'https://www.property24.co.bw/images/gaborone-home.jpg',
        listingUrl:
          'https://www.property24.co.bw/4-bedroom-house-for-sale-in-gaborone-117416899',
        location: 'Gaborone North',
        priceValue: 1100000,
        title: '4 Bedroom House in Gaborone',
      }),
    ])
  })

  it('rejects private-network property sources', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'House',
      address: { addressLocality: 'Internal' },
      name: 'Internal service result',
      offers: { price: 1 },
      url: '/admin',
    })}</script>`

    expect(parseGenericPropertyListings(html, 'https://127.0.0.1/search', 'sale', 'USD')).toEqual([])
  })
})
