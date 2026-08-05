import { describe, expect, it } from 'vitest'
import type { StoreLeaflet } from '../types'
import { groupLeafletsByRetailer } from './catalogueOrdering'
import * as catalogueOrderingModule from './catalogueOrdering'

function leaflet(overrides: Partial<StoreLeaflet>): StoreLeaflet {
  return {
    capturedAt: '2026-07-01T10:00:00.000Z',
    id: String(overrides.id ?? 'leaflet'),
    name: String(overrides.name ?? 'Weekly catalogue'),
    retailerId: overrides.retailerId ?? 'shoprite',
    retailerName: overrides.retailerName ?? 'Shoprite',
    url: String(overrides.url ?? 'https://retailer.example/catalogue'),
    ...overrides,
  }
}

describe('groupLeafletsByRetailer', () => {
  it('orders retailer groups and their catalogues by the newest start date', () => {
    const groups = groupLeafletsByRetailer([
      leaflet({
        capturedAt: '2026-07-19T12:00:00.000Z',
        id: 'alpha-old',
        retailerId: 'alpha',
        retailerName: 'Alpha',
        validFrom: '2026-07-01',
      }),
      leaflet({
        capturedAt: '2026-07-18T12:00:00.000Z',
        id: 'zulu-new',
        retailerId: 'zulu',
        retailerName: 'Zulu',
        validFrom: '2026-07-19',
      }),
      leaflet({
        capturedAt: '2026-07-17T12:00:00.000Z',
        id: 'alpha-new',
        retailerId: 'alpha',
        retailerName: 'Alpha',
        validFrom: '2026-07-18',
      }),
    ])

    expect(groups.map((group) => group.retailerName)).toEqual(['Zulu', 'Alpha'])
    expect(groups[1].leaflets.map((item) => item.id)).toEqual(['alpha-new', 'alpha-old'])
  })

  it('uses capture time when a start date is unavailable', () => {
    const groups = groupLeafletsByRetailer([
      leaflet({ id: 'older', retailerId: 'older', retailerName: 'Older' }),
      leaflet({
        capturedAt: '2026-07-19T12:00:00.000Z',
        id: 'newer',
        retailerId: 'newer',
        retailerName: 'Newer',
        validFrom: undefined,
      }),
    ])

    expect(groups.map((group) => group.retailerName)).toEqual(['Newer', 'Older'])
  })

  it('uses capture time when start dates match', () => {
    const groups = groupLeafletsByRetailer([
      leaflet({
        capturedAt: '2026-07-18T08:00:00.000Z',
        id: 'captured-old',
        validFrom: '2026-07-18',
      }),
      leaflet({
        capturedAt: '2026-07-18T12:00:00.000Z',
        id: 'captured-new',
        validFrom: '2026-07-18',
      }),
    ])

    expect(groups[0].leaflets.map((item) => item.id)).toEqual([
      'captured-new',
      'captured-old',
    ])
  })

  it('keeps the first available retailer logo for catalogue shelves', () => {
    const groups = groupLeafletsByRetailer([
      leaflet({ id: 'no-logo', retailerLogoUrl: undefined }),
      leaflet({
        id: 'with-logo',
        retailerLogoUrl: 'https://images.example.test/shoprite.webp',
      }),
    ])

    expect(groups[0].retailerLogoUrl).toBe(
      'https://images.example.test/shoprite.webp',
    )
  })
})

describe('sortLeaflets', () => {
  it('supports latest, oldest, and store-name order', () => {
    const sortLeaflets = (
      catalogueOrderingModule as unknown as Record<string, unknown>
    ).sortLeaflets as
      | ((leaflets: StoreLeaflet[], sort: string) => StoreLeaflet[])
      | undefined
    expect(sortLeaflets).toBeTypeOf('function')
    if (!sortLeaflets) return

    const values = [
      leaflet({
        id: 'zulu-new',
        retailerId: 'zulu',
        retailerName: 'Zulu',
        validFrom: '2026-07-19',
      }),
      leaflet({
        id: 'alpha-old',
        retailerId: 'alpha',
        retailerName: 'Alpha',
        validFrom: '2026-07-01',
      }),
    ]

    expect(sortLeaflets(values, 'latest').map((item) => item.id)).toEqual([
      'zulu-new',
      'alpha-old',
    ])
    expect(sortLeaflets(values, 'oldest').map((item) => item.id)).toEqual([
      'alpha-old',
      'zulu-new',
    ])
    expect(sortLeaflets(values, 'store').map((item) => item.id)).toEqual([
      'alpha-old',
      'zulu-new',
    ])
  })
})
