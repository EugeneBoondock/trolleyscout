import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DiscoveredDeal, Retailer, StoreLeaflet } from '../types'
import { DashboardStories } from './DashboardStories'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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

describe('DashboardStories', () => {
  it('opens a segmented catalogue-first story and reaches the deal after the pages', () => {
    const { container } = render(
      <DashboardStories catalogues={[catalogue]} deals={[deal]} retailers={[retailer]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Pick n Pay story' }))
    expect(screen.getByRole('dialog', { name: 'Pick n Pay story' })).toBeTruthy()
    expect(container.querySelectorAll('.story-progress-segment')).toHaveLength(3)
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next story item' }))
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next story item' }))

    expect(screen.getByText('Coffee 200g')).toBeTruthy()
    expect(screen.getByText('R79.99')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View deal' }).getAttribute('href')).toBe(
      'https://retailer.test/coffee',
    )
  })

  it('shows the store stock status on a sold-out deal frame', () => {
    render(
      <DashboardStories
        catalogues={[]}
        deals={[{ ...deal, soldOut: true }]}
        retailers={[retailer]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Pick n Pay story' }))
    expect(screen.getByText('Sold out')).toBeTruthy()
  })

  it('loads page metadata only after a remote catalogue story opens', async () => {
    const fetcher = vi.fn(async () => Response.json({
      data: {
        pages: [
          {
            height: 2200,
            imageUrl: 'https://images.test/remote-page-1.webp',
            pageNumber: 1,
            width: 1550,
          },
          {
            height: 2200,
            imageUrl: 'https://images.test/remote-page-2.webp',
            pageNumber: 2,
            width: 1550,
          },
        ],
      },
    }))
    vi.stubGlobal('fetch', fetcher)
    const lazyCatalogue = {
      ...catalogue,
      imageUrl: 'https://images.test/cover.webp',
      pages: [
        {
          height: 270,
          imageUrl: 'https://images.test/cover.webp',
          pageNumber: 1,
          width: 260,
        },
      ],
      pagesUrl: 'https://trolleyscout.co.za/api/catalogue-pages',
    }
    const { container } = render(
      <DashboardStories
        catalogues={[lazyCatalogue]}
        deals={[deal]}
        retailers={[retailer]}
      />,
    )

    expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'View Pick n Pay story' }))

    await waitFor(() => {
      expect(container.querySelectorAll('.story-progress-segment')).toHaveLength(3)
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })
})
