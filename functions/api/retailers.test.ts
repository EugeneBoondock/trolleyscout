import { describe, expect, it } from 'vitest'
import {
  addRetailerLogos,
  mergeCatalogueRetailers,
  mergeRetailerScoutStatuses,
} from './retailers'

describe('addRetailerLogos', () => {
  it('adds a verified logo URL when the retailer favicon is unavailable', () => {
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

    expect(retailers[0].logoUrl).toBe(
      'https://img.offers-cdn.net/assets/uploads/stores/za/logos/200x72_webp/shoprite.webp',
    )
  })
})

describe('mergeCatalogueRetailers', () => {
  it('does not duplicate a catalogue retailer matched through a directory alias', () => {
    const existing = [{
      accentColor: '#000000',
      aliases: ['Samsung Store'],
      group: 'General retailer' as const,
      id: 'samsung-za',
      name: 'Samsung',
      program: 'Offers',
      shortName: 'Samsung',
      sourceNote: 'Official',
      sources: [{ kind: 'specials' as const, label: 'Offers', url: 'https://www.samsung.com/za/offer/' }],
      verifiedOn: '2026-08-02',
    }]
    const leaflets = [{
      capturedAt: '2026-08-02T10:00:00.000Z',
      countryCode: 'ZA',
      id: 'samsung-store-catalogue',
      name: 'Samsung catalogue',
      retailerId: 'samsung-store',
      retailerName: 'Samsung Store',
      url: 'https://www.samsung.com/za/offer/',
    }]

    expect(mergeCatalogueRetailers(existing, leaflets, 'ZA')).toHaveLength(1)
  })
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

  it('adds a Zimbabwe-only catalogue store without leaking it to South Africa', () => {
    const zimbabweCatalogue = {
      capturedAt: '2026-07-27T10:00:00.000Z',
      countryCode: 'ZW',
      id: 'tm-winter',
      name: 'Winter Warmers Promotion',
      retailerId: 'pick-n-pay',
      retailerName: 'TM Pick n Pay',
      url: 'https://tmpnponline.co.zw/catalog',
    }

    expect(
      mergeCatalogueRetailers([], [zimbabweCatalogue], 'ZW').map(
        (retailer) => retailer.name,
      ),
    ).toEqual(['TM Pick n Pay'])
    expect(mergeCatalogueRetailers([], [zimbabweCatalogue], 'ZA')).toEqual([])
  })
})

describe('mergeRetailerScoutStatuses', () => {
  it('separates unavailable, empty, and not-yet-checked stores', () => {
    const retailers = [
      {
        accentColor: '#000000',
        group: 'Supermarket' as const,
        id: 'country:zw:tmpnponline-co-zw',
        name: 'TM Pick n Pay Zimbabwe',
        program: 'Zimbabwe store',
        shortName: 'TM Pick n Pay Zimbabwe',
        sourceNote: 'Official',
        sources: [{
          kind: 'specials' as const,
          label: 'Specials',
          url: 'https://tmpnponline.co.zw/specials',
        }],
        verifiedOn: '2026-07-27',
      },
      {
        accentColor: '#111111',
        group: 'General retailer' as const,
        id: 'country:zw:zimoco-co-zw',
        name: 'ZIMOCO',
        program: 'Zimbabwe store',
        shortName: 'ZIMOCO',
        sourceNote: 'Official',
        sources: [{
          kind: 'store-finder' as const,
          label: 'Website',
          url: 'https://zimoco.co.zw/',
        }],
        verifiedOn: '2026-07-27',
      },
      {
        accentColor: '#222222',
        group: 'Supermarket' as const,
        id: 'country:zw:okonline-co-zw',
        name: 'OK Zimbabwe',
        program: 'Zimbabwe store',
        shortName: 'OK Zimbabwe',
        sourceNote: 'Official',
        sources: [{
          kind: 'specials' as const,
          label: 'Online shop',
          url: 'https://okonline.co.zw/',
        }],
        verifiedOn: '2026-07-27',
      },
    ]

    const merged = mergeRetailerScoutStatuses(retailers, [
      {
        next_scout_at: '2026-07-28T10:00:00.000Z',
        outcome_status: 'empty',
        promotion_count: 0,
        scouted_at: '2026-07-27T10:00:00.000Z',
        store_name: 'TM Pick n Pay Zimbabwe',
        website: 'https://tmpnponline.co.zw/specials',
      },
      {
        next_scout_at: '2026-07-27T11:00:00.000Z',
        outcome_status: 'transient_failure',
        promotion_count: 0,
        scouted_at: '2026-07-27T10:00:00.000Z',
        store_name: 'ZIMOCO',
        website: 'https://zimoco.co.zw/',
      },
    ], Date.parse('2026-07-27T10:30:00.000Z'))

    expect(merged.map((retailer) => retailer.offerStatus)).toEqual([
      'no-current-offers',
      'temporarily-unavailable',
      'not-checked',
    ])
  })
})
