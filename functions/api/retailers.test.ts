import { describe, expect, it } from 'vitest'
import { addRetailerLogos, mergeCatalogueRetailers } from './retailers'

describe('addRetailerLogos', () => {
  it('adds a favicon URL based on an official source website', () => {
    const retailers = addRetailerLogos([
      {
        accentColor: '#000000',
        group: 'Supermarket',
        id: 'shoprite',
        name: 'Shoprite',
        program: 'Xtra Savings',
        shortName: 'Shoprite',
        sourceNote: 'Official',
        sources: [{ kind: 'specials', label: 'Specials', url: 'https://www.shoprite.co.za/specials.html' }],
        verifiedOn: '2026-07-16',
      },
    ])

    expect(retailers[0].logoUrl).toBe('https://icons.duckduckgo.com/ip3/shoprite.co.za.ico')
  })
})

describe('mergeCatalogueRetailers', () => {
  const existing = addRetailerLogos([
    {
      accentColor: '#000000',
      group: 'Supermarket',
      id: 'boxer',
      name: 'Boxer',
      program: 'Specials',
      shortName: 'Boxer',
      sourceNote: 'Official',
      sources: [{ kind: 'specials', label: 'Specials', url: 'https://www.boxer.co.za/' }],
      verifiedOn: '2026-07-16',
    },
  ])

  it('adds missing catalogue stores without duplicating known retailers', () => {
    const merged = mergeCatalogueRetailers(existing, [
      {
        capturedAt: '2026-07-27T10:00:00.000Z',
        countryCode: 'ZA',
        id: 'boxer-directory',
        name: 'Boxer catalogue',
        retailerId: 'boxer',
        retailerName: 'Boxer',
        url: 'https://www.cataloguespecials.co.za/view/specials/boxer-catalogue-1',
      },
      {
        capturedAt: '2026-07-27T10:00:00.000Z',
        countryCode: 'ZA',
        id: 'a5-directory',
        name: 'A5 catalogue',
        retailerId: 'a5-cash-carry',
        retailerLogoUrl: 'https://img.offers-cdn.net/a5.webp',
        retailerName: 'A5 Cash & Carry',
        retailerUrl:
          'https://www.cataloguespecials.co.za/stores/a5-cash-carry/catalogues-specials',
        url: 'https://www.cataloguespecials.co.za/view/specials/a5-catalogue-2',
      },
    ], 'ZA')

    expect(merged.map((retailer) => retailer.name)).toEqual([
      'Boxer',
      'A5 Cash & Carry',
    ])
    expect(merged[1]).toMatchObject({
      group: 'Wholesale',
      logoUrl: 'https://img.offers-cdn.net/a5.webp',
    })
  })

  it('does not add South African catalogue stores to another country', () => {
    expect(mergeCatalogueRetailers(existing, [{
      capturedAt: '2026-07-27T10:00:00.000Z',
      countryCode: 'ZA',
      id: 'a5-directory',
      name: 'A5 catalogue',
      retailerId: 'a5-cash-carry',
      retailerName: 'A5 Cash & Carry',
      url: 'https://www.cataloguespecials.co.za/view/specials/a5-catalogue-2',
    }], 'ZW')).toEqual(existing)
  })
})
