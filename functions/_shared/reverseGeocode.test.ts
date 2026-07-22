// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { buildReverseGeocodeUrl, parseGeoapifyReverse } from './reverseGeocode'

describe('parseGeoapifyReverse', () => {
  it('prefers the closest suburb before a neighbouring administrative city', () => {
    const payload = {
      results: [
        {
          suburb: 'Edenvale',
          city: 'Germiston',
          county: 'Ekurhuleni Metropolitan Municipality',
          state: 'Gauteng',
          formatted: 'Edenvale, 1609, South Africa',
        },
      ],
    }
    const place = parseGeoapifyReverse(payload)
    expect(place?.names[0]).toBe('Edenvale')
    expect(place?.names).toContain('Germiston')
    expect(place?.province).toBe('Gauteng')
  })

  it('requests the full address result rather than snapping to the nearest city', () => {
    const url = buildReverseGeocodeUrl(-26.1417, 28.1528, 'geo-key')

    expect(url).not.toContain('type=city')
    expect(url).toContain('lat=-26.1417')
    expect(url).toContain('lon=28.1528')
  })

  it('falls back to town then suburb then a cleaned district', () => {
    const payload = {
      results: [
        { suburb: 'Sea Point', county: 'City of Cape Town Metropolitan Municipality', state: 'Western Cape' },
      ],
    }
    const place = parseGeoapifyReverse(payload)
    // No city/town, so the suburb leads; the municipality is cleaned to a token.
    expect(place?.names[0]).toBe('Sea Point')
    expect(place?.names).toContain('Cape Town')
    expect(place?.province).toBe('Western Cape')
  })

  it('de-duplicates repeated names case-insensitively', () => {
    const payload = { results: [{ city: 'Sandton', town: 'sandton', state: 'Gauteng' }] }
    const place = parseGeoapifyReverse(payload)
    expect(place?.names).toEqual(['Sandton'])
  })

  it('returns undefined for an empty or malformed payload', () => {
    expect(parseGeoapifyReverse({ results: [] })).toBeUndefined()
    expect(parseGeoapifyReverse({})).toBeUndefined()
    expect(parseGeoapifyReverse(null)).toBeUndefined()
    expect(parseGeoapifyReverse({ results: [{ state: 'Gauteng' }] })).toBeUndefined()
  })
})
