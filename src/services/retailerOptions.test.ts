import { describe, expect, it } from 'vitest'

import type { DiscoveredDeal, StoreLeaflet } from '../types'
import { buildRetailerPickerOptions } from './retailerOptions'

const deal = (overrides: Partial<DiscoveredDeal> = {}): DiscoveredDeal => ({
  capturedAt: '2026-07-27T08:00:00.000Z',
  evidenceText: 'Official source',
  id: 'deal-1',
  productUrl: 'https://boxer.test/product',
  retailerId: 'boxer',
  retailerName: 'Boxer',
  sourceLabel: 'Specials',
  sourceUrl: 'https://boxer.test/specials',
  title: 'Maize meal',
  ...overrides,
})

const leaflet = (overrides: Partial<StoreLeaflet> = {}): StoreLeaflet => ({
  capturedAt: '2026-07-27T08:00:00.000Z',
  id: 'catalogue-1',
  name: 'Boxer Gauteng',
  retailerId: 'boxer',
  retailerName: 'Boxer Superstores Gauteng',
  url: 'https://boxer.test/catalogue',
  ...overrides,
})

describe('buildRetailerPickerOptions', () => {
  it('counts deals and current catalogues under the supplied retailer id', () => {
    expect(buildRetailerPickerOptions([deal()], [leaflet(), leaflet({ id: 'catalogue-2' })]))
      .toEqual([{
        catalogueCount: 2,
        count: 1,
        id: 'boxer',
        name: 'Boxer',
      }])
  })

  it('keeps a catalogue-only store visible with an honest zero deal count', () => {
    expect(buildRetailerPickerOptions([], [
      leaflet({
        id: 'jet-catalogue',
        retailerId: 'jet',
        retailerName: 'Jet',
      }),
    ])).toEqual([{
      catalogueCount: 1,
      count: 0,
      id: 'jet',
      name: 'Jet',
    }])
  })

  it('keeps every registered store visible before its first successful fetch', () => {
    expect(buildRetailerPickerOptions(
      [deal({
        retailerId: 'store-online:zw:tmpnponline.co.zw',
        retailerName: 'TM Pick n Pay',
      })],
      [],
      [{
        id: 'country:zw:tmpnponline-co-zw',
        name: 'TM Pick n Pay',
        offerStatus: 'available',
      }, {
        id: 'country:zw:zimoco-co-zw',
        name: 'ZIMOCO',
        offerStatus: 'temporarily-unavailable',
      }],
    )).toEqual([{
      catalogueCount: 0,
      count: 1,
      id: 'country:zw:tmpnponline-co-zw',
      name: 'TM Pick n Pay',
      offerStatus: 'available',
    }, {
      catalogueCount: 0,
      count: 0,
      id: 'country:zw:zimoco-co-zw',
      name: 'ZIMOCO',
      offerStatus: 'temporarily-unavailable',
    }])
  })
})
