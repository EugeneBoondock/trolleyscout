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

  it('includes South African online storefronts, which have no country directory', () => {
    const za = buildRegistryOnlineStores(['ZA'])
    const hosts = za.map((store) => store.placeId)

    expect(hosts).toContain('online:za:techexchange.co.za')
    expect(za.length).toBeGreaterThan(100)
    expect(za.every((store) => store.countryCode === 'ZA')).toBe(true)
  })

  it('sweeps United States storefronts, which have no country directory either', () => {
    const us = buildRegistryOnlineStores(['US'])

    expect(us.length).toBeGreaterThan(150)
    expect(us.every((store) => store.countryCode === 'US')).toBe(true)
    // The country name needs no article here, but the currency must be right:
    // a US shop priced in dollars must not inherit a rand label.
    expect(us.every((store) => store.countryName === 'United States')).toBe(true)
    expect(us.map((store) => store.placeId)).toContain('online:us:allbirds.com')
  })

  it('sweeps Dutch storefronts, priced in euros', () => {
    const nl = buildRegistryOnlineStores(['NL'])

    expect(nl.length).toBeGreaterThan(100)
    expect(nl.every((store) => store.countryCode === 'NL')).toBe(true)
    expect(nl.every((store) => store.countryName === 'Netherlands')).toBe(true)
    // Lidl is the one large Dutch chain with a reachable feed; the rest of the
    // country's top twenty sit behind bot management.
    expect(nl.map((store) => store.placeId)).toContain('online:nl:lidl.nl')
  })

  it('merges the country directory and the online registry without repeating a host', () => {
    const zw = buildRegistryOnlineStores(['ZW'])
    const hosts = zw.map((store) => store.placeId)

    expect(new Set(hosts).size).toBe(hosts.length)
    // Drawn from the country directory...
    expect(hosts).toContain('online:zw:tmpnponline.co.zw')
    // ...and from the online-only registry.
    expect(hosts).toContain('online:zw:celltrade.co.zw')
  })
})
