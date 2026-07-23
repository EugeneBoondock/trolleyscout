import { beforeEach, describe, expect, it } from 'vitest'
import {
  deriveLocationLabel,
  loadNearbyHistory,
  removeNearbyHistoryEntry,
  saveNearbyHistorySearch,
} from './nearbyHistory'
import type { NearbyStoreResult } from './apiClient'

function store(overrides: Partial<NearbyStoreResult>): NearbyStoreResult {
  return {
    deals: [],
    lat: -26.14,
    leaflets: [],
    lon: 28.15,
    name: 'Shop',
    placeId: overrides.placeId ?? 'p1',
    promotions: [],
    ...overrides,
  } as NearbyStoreResult
}

describe('deriveLocationLabel', () => {
  it('uses the nearest store suburb', () => {
    const label = deriveLocationLabel(
      [
        store({ address: 'Far Store, Main Rd, Sandton, Gauteng, 2196, South Africa', distanceM: 5000 }),
        store({ address: 'Near Store, 5th St, Edenvale, Gauteng, 1609, South Africa', distanceM: 200 }),
      ],
      -26.14,
      28.15,
    )
    expect(label).toBe('Edenvale')
  })

  it('falls back to coordinates when no address', () => {
    expect(deriveLocationLabel([store({ distanceM: 100 })], -26.14, 28.15)).toBe('-26.140, 28.150')
  })
})

describe('nearby history storage', () => {
  beforeEach(() => localStorage.clear())

  it('saves a search and reloads it', () => {
    const saved = saveNearbyHistorySearch(-26.14, 28.15, [
      store({ address: 'A, B, Edenvale, Gauteng, 1609, South Africa', distanceM: 100 }),
    ])
    expect(saved).toHaveLength(1)
    expect(saved[0].countryCode).toBe('ZA')
    expect(saved[0].locationLabel).toBe('Edenvale')
    expect(loadNearbyHistory()).toHaveLength(1)
  })

  it('collapses repeat searches from the same spot', () => {
    saveNearbyHistorySearch(-26.14, 28.15, [store({ distanceM: 100 })])
    const second = saveNearbyHistorySearch(-26.1401, 28.1502, [store({ distanceM: 120 })])
    expect(second).toHaveLength(1)
  })

  it('keeps distinct locations and removes by id', () => {
    saveNearbyHistorySearch(-26.14, 28.15, [store({ distanceM: 100 })])
    const two = saveNearbyHistorySearch(-33.92, 18.42, [store({ distanceM: 90 })])
    expect(two).toHaveLength(2)
    const after = removeNearbyHistoryEntry(two[0].id)
    expect(after).toHaveLength(1)
  })

  it('ignores empty searches', () => {
    expect(saveNearbyHistorySearch(-26.14, 28.15, [])).toHaveLength(0)
  })

  it('keeps each country history isolated', () => {
    saveNearbyHistorySearch(-26.14, 28.15, [
      store({ address: 'A, B, Edenvale, Gauteng, 1609, South Africa', distanceM: 100 }),
    ])
    saveNearbyHistorySearch(-20.16, 28.58, [
      store({
        address: 'A, B, Bulawayo, Zimbabwe',
        distanceM: 100,
        lat: -20.16,
        lon: 28.58,
        placeId: 'zw-1',
      }),
    ], 'zw')

    expect(loadNearbyHistory('ZA').map((entry) => entry.locationLabel)).toEqual(['Edenvale'])
    expect(loadNearbyHistory('ZW').map((entry) => entry.locationLabel)).toEqual(['Bulawayo'])

    const zimbabweEntry = loadNearbyHistory('ZW')[0]
    expect(removeNearbyHistoryEntry(zimbabweEntry.id, 'ZW')).toHaveLength(0)
    expect(loadNearbyHistory('ZA')).toHaveLength(1)
  })

  it('treats history written before country support as South African', () => {
    localStorage.setItem('trolley_scout_nearby_history_v1', JSON.stringify([{
      capturedAt: '2026-07-23T08:00:00.000Z',
      id: 'legacy',
      lat: -26.14,
      locationLabel: 'Edenvale',
      lon: 28.15,
      stores: [store({ distanceM: 100 })],
    }]))

    expect(loadNearbyHistory('ZA')).toHaveLength(1)
    expect(loadNearbyHistory('ZW')).toHaveLength(0)
  })
})
