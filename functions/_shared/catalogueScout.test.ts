import { describe, expect, it } from 'vitest'
import type { StoreLeaflet } from '../../src/types'
import {
  flippingBookPageUrls,
  flippingBookPagerUrl,
  selectUnscannedLeaflets,
} from './catalogueScout'

const capturedAt = '2026-07-15T12:00:00.000Z'

function leaflet(overrides: Partial<StoreLeaflet>): StoreLeaflet {
  return {
    capturedAt,
    id: 'leaflet-1',
    name: 'Weekly deals',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    url: 'https://retailer.test/deals',
    ...overrides,
  }
}

describe('selectUnscannedLeaflets', () => {
  it('keeps one new document per retailer and skips previously scanned documents', () => {
    const existingUrl = 'https://retailer.test/existing.pdf'
    const snapshots = new Map([
      [
        'shoprite::Catalogue scan',
        {
          checkedAt: capturedAt,
          deals: [
            {
              capturedAt,
              evidenceText: 'Rice R20',
              id: 'deal-1',
              priceText: 'R20',
              productUrl: existingUrl,
              retailerId: 'shoprite' as const,
              retailerName: 'Shoprite',
              sourceLabel: 'Catalogue scan',
              sourceUrl: existingUrl,
              title: 'Rice',
            },
          ],
        },
      ],
    ])

    const selected = selectUnscannedLeaflets(
      [
        leaflet({ documentUrl: existingUrl }),
        leaflet({ documentUrl: 'https://retailer.test/new.pdf', id: 'leaflet-2' }),
        leaflet({ documentUrl: 'https://retailer.test/another.pdf', id: 'leaflet-3' }),
        leaflet({ documentUrl: 'https://kitkat.test/current.pdf', id: 'leaflet-4', retailerId: 'kit-kat', retailerName: 'Kit Kat Cash & Carry' }),
      ],
      snapshots,
      4,
    )

    expect(selected.map((item) => item.documentUrl)).toEqual([
      'https://retailer.test/new.pdf',
      'https://kitkat.test/current.pdf',
    ])
  })

  it('builds catalogue page images from a FlippingBook pager', () => {
    const interactive = leaflet({
      url: 'https://specials.shoprite.co.za/deals/current/index.html',
    })
    const pager = {
      pages: {
        structure: ['1', '2', '3'],
      },
    }

    expect(flippingBookPagerUrl(interactive)).toBe(
      'https://specials.shoprite.co.za/deals/current/files/assets/pager.js',
    )
    expect(flippingBookPageUrls(interactive, pager, 2)).toEqual([
      'https://specials.shoprite.co.za/deals/current/files/assets/flash/pages/page0001_w.webp',
      'https://specials.shoprite.co.za/deals/current/files/assets/flash/pages/page0002_w.webp',
    ])
  })
})
