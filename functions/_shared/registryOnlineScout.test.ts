import { describe, expect, it } from 'vitest'
import { buildRegistryOnlineStores } from './registryOnlineScout'

describe('buildRegistryOnlineStores', () => {
  it('turns Zimbabwe registry sources into national online stores', () => {
    const zw = buildRegistryOnlineStores(['ZW'])
    const tm = zw.find((store) => store.placeId === 'online:zw:tmpnponline.co.zw')

    expect(tm).toMatchObject({
      countryCode: 'ZW',
      countryName: 'Zimbabwe',
      lat: 0,
      lon: 0,
      name: 'TM Pick n Pay',
      website: 'https://tmpnponline.co.zw/',
      websiteSource: 'country-retailer',
    })
    // The large verified Zimbabwe list should be well represented.
    expect(zw.length).toBeGreaterThan(50)
  })

  it('deduplicates a retailer that has several sources on one host', () => {
    const zw = buildRegistryOnlineStores(['ZW'])
    const tmHosts = zw.filter((store) => store.placeId === 'online:zw:tmpnponline.co.zw')
    // TM Pick n Pay has both a specials and a store source on the same host.
    expect(tmHosts).toHaveLength(1)
  })

  it('interleaves countries so a per-run cap never starves the last country', () => {
    const stores = buildRegistryOnlineStores(['AO', 'ZW'])
    // Round-robin: the first two entries come from different countries.
    expect(stores[0]?.countryCode).toBe('AO')
    expect(stores[1]?.countryCode).toBe('ZW')
  })

  it('defaults to every registered country', () => {
    const all = buildRegistryOnlineStores()
    const countries = new Set(all.map((store) => store.countryCode))
    expect(countries.has('ZW')).toBe(true)
    expect(countries.size).toBeGreaterThan(5)
  })
})
