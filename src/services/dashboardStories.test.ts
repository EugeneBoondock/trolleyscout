import { describe, expect, it } from 'vitest'

import type { DiscoveredDeal, Retailer, StoreLeaflet } from '../types'
import { buildDashboardStories } from './dashboardStories'

const retailer: Retailer = {
  accentColor: '#d71920',
  group: 'Supermarket',
  id: 'pick-n-pay',
  logoUrl: 'https://images.test/pnp-logo.png',
  name: 'Pick n Pay',
  program: 'Smart Shopper',
  shortName: 'PnP',
  sourceNote: 'Official sources',
  sources: [],
  verifiedOn: '2026-07-26',
}

const catalogue: StoreLeaflet = {
  capturedAt: '2026-07-26T10:00:00.000Z',
  id: 'weekly',
  name: 'Weekly catalogue',
  pages: [
    { height: 2899, imageUrl: 'https://images.test/page-1.webp', pageNumber: 1, width: 2050 },
    { height: 2899, imageUrl: 'https://images.test/page-2.webp', pageNumber: 2, width: 2050 },
  ],
  retailerId: 'pick-n-pay',
  retailerName: 'Pick n Pay',
  url: 'https://retailer.test/catalogue',
}

const deal: DiscoveredDeal = {
  capturedAt: '2026-07-26T10:00:00.000Z',
  evidenceText: 'Coffee R79.99',
  id: 'coffee',
  imageUrl: 'https://images.test/coffee.png',
  priceText: 'R79.99',
  productUrl: 'https://retailer.test/coffee',
  retailerId: 'pick-n-pay',
  retailerName: 'Pick n Pay',
  sourceLabel: 'Official deal',
  sourceUrl: 'https://retailer.test/deals',
  title: 'Coffee 200g',
}

describe('buildDashboardStories', () => {
  it('puts every catalogue page before the retailer deals', () => {
    const stories = buildDashboardStories([catalogue], [deal], [retailer])

    expect(stories).toHaveLength(1)
    expect(stories[0]).toMatchObject({
      id: 'pick-n-pay',
      logoUrl: retailer.logoUrl,
      retailerName: 'Pick n Pay',
    })
    expect(stories[0].frames.map((frame) => frame.kind)).toEqual([
      'catalogue',
      'catalogue',
      'deal',
    ])
    expect(stories[0].frames.map((frame) => frame.imageUrl)).toEqual([
      'https://images.test/page-1.webp',
      'https://images.test/page-2.webp',
      'https://images.test/coffee.png',
    ])
  })

  it('uses a catalogue cover when page images are unavailable', () => {
    const stories = buildDashboardStories([
      { ...catalogue, imageUrl: 'https://images.test/cover.webp', pages: undefined },
    ], [], [retailer])

    expect(stories[0].frames).toEqual([
      expect.objectContaining({
        imageUrl: 'https://images.test/cover.webp',
        kind: 'catalogue',
        pageNumber: 1,
      }),
    ])
  })
})
