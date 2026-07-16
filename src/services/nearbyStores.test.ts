import { describe, expect, test } from 'vitest'
import {
  buildGeoapifyNearbyUrl,
  isValidCoordinate,
  locationTileKey,
  mapGeoapifyStores,
  matchKnownRetailer,
} from './nearbyStores'

describe('buildGeoapifyNearbyUrl', () => {
  test('builds a places URL with a proximity circle filter', () => {
    const url = new URL(buildGeoapifyNearbyUrl(-26.1076, 28.0567, 3000, 'test-key'))

    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v2/places')
    expect(url.searchParams.get('filter')).toBe('circle:28.0567,-26.1076,3000')
    expect(url.searchParams.get('apiKey')).toBe('test-key')
    expect(url.searchParams.get('categories')).toContain('commercial.supermarket')
  })
})

describe('locationTileKey', () => {
  test('groups nearby coordinates into the same tile', () => {
    const a = locationTileKey(-26.1076, 28.0567)
    const b = locationTileKey(-26.115, 28.06) // ~1 km away
    const far = locationTileKey(-29.85, 31.02) // Durban

    expect(a).toBe(b)
    expect(a).not.toBe(far)
  })
})

describe('isValidCoordinate', () => {
  test('accepts real coordinates and rejects junk', () => {
    expect(isValidCoordinate(-26.1, 28.0)).toBe(true)
    expect(isValidCoordinate(NaN, 28)).toBe(false)
    expect(isValidCoordinate(200, 28)).toBe(false)
  })
})

describe('matchKnownRetailer', () => {
  test('maps store signage to known chains', () => {
    expect(matchKnownRetailer('Pick n Pay Sandton City')).toBe('pick-n-pay')
    expect(matchKnownRetailer('SUPERSPAR Bryanston')).toBe('spar')
    expect(matchKnownRetailer('Checkers Hyper Fourways')).toBe('checkers')
    expect(matchKnownRetailer('Usave Diepsloot')).toBe('usave')
    expect(matchKnownRetailer('Boxer Superstore')).toBe('boxer')
  })

  test('returns undefined for an unknown independent store', () => {
    expect(matchKnownRetailer("Thabo's Corner Store")).toBeUndefined()
  })
})

describe('mapGeoapifyStores', () => {
  test('maps features, dedupes, and orders known chains first then by distance', () => {
    const payload = {
      features: [
        {
          properties: {
            place_id: 'p1',
            name: "Ma's Spaza",
            formatted: '12 Main Rd',
            lat: -26.11,
            lon: 28.06,
            distance: 900,
          },
        },
        {
          properties: {
            place_id: 'p2',
            name: 'Pick n Pay',
            formatted: 'Sandton City',
            lat: -26.108,
            lon: 28.057,
            website: 'www.pnp.co.za',
            distance: 1500,
          },
        },
        {
          // Duplicate of p1 (same name + coords) should be dropped.
          properties: { place_id: 'p1b', name: "Ma's Spaza", lat: -26.11, lon: 28.06 },
        },
        {
          // No name → skipped.
          properties: { place_id: 'p3', lat: -26.1, lon: 28.05 },
        },
      ],
    }

    const stores = mapGeoapifyStores(payload)

    expect(stores).toHaveLength(2)
    expect(stores[0]).toMatchObject({ name: 'Pick n Pay', retailerId: 'pick-n-pay' })
    expect(stores[0].website).toBe('https://www.pnp.co.za/')
    expect(stores[1]).toMatchObject({ name: "Ma's Spaza", retailerId: undefined })
  })

  test('returns empty for a non-feature payload', () => {
    expect(mapGeoapifyStores({ error: 'nope' })).toEqual([])
  })

  test('filters out non-store commercial places like SARS and banks', () => {
    const payload = {
      features: [
        { properties: { place_id: 's', name: 'SARS', lat: -26.13, lon: 28.14 } },
        { properties: { place_id: 'b', name: 'Absa Bank', lat: -26.13, lon: 28.14 } },
        { properties: { place_id: 'f', name: 'Frontline Hyper', lat: -26.13, lon: 28.15 } },
      ],
    }

    const stores = mapGeoapifyStores(payload)

    expect(stores.map((store) => store.name)).toEqual(['Frontline Hyper'])
  })
})
