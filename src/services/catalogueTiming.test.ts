import { describe, expect, it } from 'vitest'

import { catalogueTiming, filterCataloguesByTiming } from './catalogueTiming'
import type { StoreLeaflet } from '../types'

const leaflets: StoreLeaflet[] = [
  {
    capturedAt: '2026-08-02T08:00:00.000Z',
    id: 'current',
    name: 'Current',
    retailerId: 'store',
    retailerName: 'Store',
    url: 'https://example.test/current',
    validFrom: '2026-07-30',
    validTo: '2026-08-20',
  },
  {
    capturedAt: '2026-08-02T08:00:00.000Z',
    id: 'ending',
    name: 'Ending',
    retailerId: 'store',
    retailerName: 'Store',
    url: 'https://example.test/ending',
    validFrom: '2026-07-30',
    validTo: '2026-08-03',
  },
  {
    capturedAt: '2026-08-02T08:00:00.000Z',
    id: 'upcoming',
    name: 'Upcoming',
    retailerId: 'store',
    retailerName: 'Store',
    url: 'https://example.test/upcoming',
    validFrom: '2026-08-05',
    validTo: '2026-08-18',
  },
]

describe('catalogue timing', () => {
  const now = new Date('2026-08-02T12:00:00.000Z')

  it('labels future and nearly finished catalogues accurately', () => {
    expect(catalogueTiming(leaflets[0], now)).toBe('current')
    expect(catalogueTiming(leaflets[1], now)).toBe('endingSoon')
    expect(catalogueTiming(leaflets[2], now)).toBe('upcoming')
  })

  it('keeps ending-soon catalogues in the current view', () => {
    expect(filterCataloguesByTiming(leaflets, 'current', now).map((item) => item.id))
      .toEqual(['current', 'ending'])
    expect(filterCataloguesByTiming(leaflets, 'endingSoon', now).map((item) => item.id))
      .toEqual(['ending'])
    expect(filterCataloguesByTiming(leaflets, 'upcoming', now).map((item) => item.id))
      .toEqual(['upcoming'])
  })
})
