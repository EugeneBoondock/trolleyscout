import { describe, expect, it } from 'vitest'

import {
  NETWORK_PROVIDER_SOURCES,
  getNetworkProviderCountryCodes,
  getNetworkProviderSources,
} from './networkProviderRegistry'

describe('global mobile-network provider registry', () => {
  it('covers the five requested South African networks from official sources', () => {
    const providers = getNetworkProviderSources('ZA')

    expect(providers.map((provider) => provider.name)).toEqual([
      'Cell C',
      'MTN',
      'rain',
      'Telkom',
      'Vodacom',
    ])
    expect(providers.every((provider) => new URL(provider.url).protocol === 'https:'))
      .toBe(true)
  })

  it('is country-aware across regions instead of applying South African offers globally', () => {
    expect(getNetworkProviderSources('US').map((provider) => provider.name))
      .toEqual(expect.arrayContaining(['AT&T', 'T-Mobile', 'Verizon']))
    expect(getNetworkProviderSources('GB').map((provider) => provider.name))
      .toEqual(expect.arrayContaining(['EE', 'O2', 'Three', 'Vodafone']))
    expect(getNetworkProviderSources('IN').map((provider) => provider.name))
      .toEqual(expect.arrayContaining(['Airtel', 'Jio', 'Vi']))
    expect(getNetworkProviderSources('NG').map((provider) => provider.name))
      .toEqual(expect.arrayContaining(['Airtel Nigeria', 'Glo', 'MTN Nigeria']))
    expect(getNetworkProviderSources('ZA')).not.toEqual(
      getNetworkProviderSources('US'),
    )
  })

  it('keeps every provider ID, country, and official host valid', () => {
    const entries = Object.entries(NETWORK_PROVIDER_SOURCES)

    expect(getNetworkProviderCountryCodes().length).toBeGreaterThanOrEqual(30)
    for (const [countryCode, providers] of entries) {
      expect(countryCode).toMatch(/^[A-Z]{2}$/)
      expect(providers.length).toBeGreaterThanOrEqual(2)
      expect(new Set(providers.map((provider) => provider.retailerId)).size)
        .toBe(providers.length)
      for (const provider of providers) {
        expect(provider.retailerId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        const url = new URL(provider.url)
        expect(url.protocol).toBe('https:')
        expect(url.hostname).not.toBe('')
      }
    }
  })
})
