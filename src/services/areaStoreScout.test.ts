import { describe, expect, it } from 'vitest'
import {
  buildAreaStoresQuery,
  buildGeoapifyGeocodeUrl,
  buildGeoapifyReverseUrl,
  candidateNameFromTitle,
  extractAreaName,
  extractCandidateStoreNames,
  mapGeocodedStore,
  mergeStores,
} from './areaStoreScout'
import type { NearbyStore } from './nearbyStores'

// Real titles returned by DuckDuckGo for "supermarkets hyper ... Edenvale".
const EDENVALE_RESULTS = [
  { title: 'Home - Devland Cash and Carry', url: 'https://www.devland.co.za/' },
  {
    title: 'Supermarkets And Hypermarkets in Edenvale, ZA',
    url: 'https://local.infobel.co.za/814/supermarkets_and_hypermarkets-edenvale/index_1.htm',
  },
  {
    title: '10 Best Supermarkets in Edenvale - NetPages',
    url: 'https://www.netpages.co.za/Edenvale/Supermarkets',
  },
  { title: 'Frontline SA', url: 'https://frontlinesa.co.za/' },
  {
    title: 'Grocery and Related Product Merchant Wholesalers Companies in Edenvale ...',
    url: 'https://www.dnb.com/business-directory/company-information.grocery.html',
  },
  { title: 'Supermarkets in Edenvale - Cylex Local Search', url: 'https://www.cylex.net.za/edenvale/supermarkets/' },
  {
    title: 'Frontline Hyper Edenvale | Supermarket & Grocery, Ekurhuleni | Destina',
    url: 'https://destinali.com/ekurhuleni/supermarket-grocery/frontline-hyper-edenvale-ekurhuleni',
  },
  { title: 'Home - Hyperland', url: 'https://hyperland.co.za/' },
]

describe('candidateNameFromTitle', () => {
  it('strips site chrome like "Home -"', () => {
    expect(candidateNameFromTitle('Home - Devland Cash and Carry')).toBe('Devland Cash and Carry')
  })

  it('takes the business name before a pipe', () => {
    expect(candidateNameFromTitle('Frontline Hyper Edenvale | Supermarket & Grocery, Ekurhuleni')).toBe(
      'Frontline Hyper Edenvale',
    )
  })

  it('rejects category listing titles', () => {
    expect(candidateNameFromTitle('Supermarkets And Hypermarkets in Edenvale, ZA')).toBeUndefined()
    expect(candidateNameFromTitle('10 Best Supermarkets in Edenvale - NetPages')).toBeUndefined()
    expect(candidateNameFromTitle('Supermarkets in Edenvale - Cylex Local Search')).toBeUndefined()
  })
})

describe('extractCandidateStoreNames', () => {
  it('finds the independents Geoapify missed in real Edenvale results', () => {
    const names = extractCandidateStoreNames(EDENVALE_RESULTS, [])

    expect(names).toContain('Devland Cash and Carry')
    expect(names).toContain('Frontline SA')
    expect(names).toContain('Hyperland')
    // Directory/category listings never become stores.
    expect(names.some((name) => /supermarkets/i.test(name))).toBe(false)
  })

  it('keeps one candidate per brand', () => {
    const names = extractCandidateStoreNames(EDENVALE_RESULTS, [])
    const frontlines = names.filter((name) => /frontline/i.test(name))

    expect(frontlines).toHaveLength(1)
  })

  it('skips stores already discovered for the tile', () => {
    const names = extractCandidateStoreNames(EDENVALE_RESULTS, ['Frontline Hyper Edenvale'])

    expect(names.some((name) => /frontline/i.test(name))).toBe(false)
  })

  it('skips known chains, which Geoapify already covers', () => {
    const names = extractCandidateStoreNames(
      [{ title: 'Checkers Edenvale', url: 'https://example.co.za/' }, ...EDENVALE_RESULTS],
      [],
    )

    expect(names.some((name) => /checkers/i.test(name))).toBe(false)
  })
})

describe('geocode URL builders', () => {
  it('builds a reverse-geocode URL for the tile centre', () => {
    const url = buildGeoapifyReverseUrl(-26.14, 28.15, 'test-key')

    expect(url).toContain('geocode/reverse')
    expect(url).toContain('lat=-26.14')
    expect(url).toContain('apiKey=test-key')
  })

  it('builds a biased, radius-filtered geocode search', () => {
    const url = buildGeoapifyGeocodeUrl('Frontline Hyper Edenvale', -26.14, 28.15, 'test-key')

    expect(url).toContain('geocode/search')
    expect(url).toContain('Frontline+Hyper+Edenvale')
    expect(url).toContain(encodeURIComponent('circle:28.15,-26.14,15000'))
  })

  it('includes the area in the search query', () => {
    expect(buildAreaStoresQuery('Edenvale')).toContain('Edenvale')
  })
})

describe('extractAreaName', () => {
  it('prefers the suburb over the city', () => {
    const payload = { features: [{ properties: { city: 'Germiston', suburb: 'Edenvale' } }] }

    expect(extractAreaName(payload)).toBe('Edenvale')
  })

  it('returns undefined for an empty response', () => {
    expect(extractAreaName({ features: [] })).toBeUndefined()
  })
})

describe('mapGeocodedStore', () => {
  const fallback = { area: 'Edenvale', lat: -26.14, lon: 28.15 }

  it('uses precise coordinates and address for a real POI hit', () => {
    const payload = {
      features: [
        {
          properties: {
            formatted: '13 Van Riebeeck Ave, Edenvale',
            lat: -26.1411,
            lon: 28.1522,
            result_type: 'amenity',
          },
        },
      ],
    }

    const store = mapGeocodedStore('Frontline Hyper', payload, fallback)

    expect(store.lat).toBe(-26.1411)
    expect(store.address).toBe('13 Van Riebeeck Ave, Edenvale')
    expect(store.placeId).toBe('area-scout:frontline-hyper:edenvale')
  })

  it('marks a locality-level hit as approximate', () => {
    const payload = {
      features: [{ properties: { formatted: 'Edenvale, Gauteng', lat: -26.13, lon: 28.16, result_type: 'suburb' } }],
    }

    const store = mapGeocodedStore('Frontline Hyper', payload, fallback)

    expect(store.address).toBe('Edenvale (location approximate)')
    expect(store.lat).toBe(-26.13)
  })

  it('falls back to the search centre when geocoding finds nothing', () => {
    const store = mapGeocodedStore('Frontline Hyper', { features: [] }, fallback)

    expect(store.lat).toBe(fallback.lat)
    expect(store.address).toBe('Edenvale (location approximate)')
  })
})

describe('mergeStores', () => {
  const existing: NearbyStore[] = [
    { lat: -26.14, lon: 28.15, name: 'SUPERSPAR Edenvale', placeId: 'geo:1' },
  ]

  it('appends genuinely new stores', () => {
    const found: NearbyStore[] = [
      { lat: -26.14, lon: 28.15, name: 'Frontline Hyper', placeId: 'area-scout:frontline-hyper:edenvale' },
    ]

    const merged = mergeStores(existing, found)

    expect(merged).toHaveLength(2)
    expect(merged[1].name).toBe('Frontline Hyper')
  })

  it('drops stores whose name is already covered', () => {
    const found: NearbyStore[] = [
      { lat: -26.14, lon: 28.15, name: 'Superspar', placeId: 'area-scout:superspar:edenvale' },
    ]

    expect(mergeStores(existing, found)).toHaveLength(1)
  })
})
