import { describe, expect, it } from 'vitest'
import { logoUrlForWebsite, nearbyStoreLogoUrl, retailerLogoMap } from './storeLogos'

describe('logoUrlForWebsite', () => {
  it('builds a favicon URL from the site hostname', () => {
    expect(logoUrlForWebsite('https://www.frontlinesa.co.za/specials')).toBe(
      'https://icons.duckduckgo.com/ip3/frontlinesa.co.za.ico',
    )
  })

  it('returns undefined for missing or invalid websites', () => {
    expect(logoUrlForWebsite(undefined)).toBeUndefined()
    expect(logoUrlForWebsite('not a url')).toBeUndefined()
  })
})

describe('nearbyStoreLogoUrl', () => {
  it('prefers the store website', () => {
    expect(
      nearbyStoreLogoUrl({ retailerId: 'pick-n-pay', website: 'https://frontlinesa.co.za' }),
    ).toContain('frontlinesa.co.za')
  })

  it('falls back to the matched chain logo', () => {
    const logo = nearbyStoreLogoUrl({ retailerId: 'pick-n-pay', website: undefined })

    expect(logo).toContain('icons.duckduckgo.com')
    expect(logo).toContain('pnp')
  })

  it('returns undefined for independents without a website', () => {
    expect(nearbyStoreLogoUrl({ retailerId: undefined, website: undefined })).toBeUndefined()
  })
})

describe('retailerLogoMap', () => {
  it('covers every retailer that has at least one source', () => {
    const map = retailerLogoMap()

    expect(Object.keys(map).length).toBeGreaterThan(10)
    expect(map['clicks']).toContain('clicks.co.za')
  })
})
