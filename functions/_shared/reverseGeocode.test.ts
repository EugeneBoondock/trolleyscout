// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseGeoapifyReverse } from './reverseGeocode'

describe('parseGeoapifyReverse', () => {
  it('prefers the town/city over the suburb and captures the province', () => {
    // A shopper standing in a neighbourhood of Edenvale: the reverse result's
    // suburb is the block ("Dowerglen"), but the city is the town we want.
    const payload = {
      results: [
        {
          suburb: 'Dowerglen',
          city: 'Edenvale',
          county: 'Ekurhuleni Metropolitan Municipality',
          state: 'Gauteng',
          formatted: 'Edenvale, 1609, South Africa',
        },
      ],
    }
    const place = parseGeoapifyReverse(payload)
    expect(place?.names[0]).toBe('Edenvale')
    expect(place?.names).toContain('Dowerglen')
    expect(place?.province).toBe('Gauteng')
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
