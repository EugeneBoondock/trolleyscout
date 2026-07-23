import { describe, expect, it } from 'vitest'
import { buildGeoapifyGeocodeUrl } from './geocode'

describe('buildGeoapifyGeocodeUrl', () => {
  it('filters and biases typed locations to the active country', () => {
    const url = new URL(buildGeoapifyGeocodeUrl('Avondale', 'ZW', 'geo-key'))

    expect(url.searchParams.get('bias')).toBe('countrycode:zw')
    expect(url.searchParams.get('filter')).toBe('countrycode:zw')
    expect(url.searchParams.get('text')).toBe('Avondale')
  })
})
