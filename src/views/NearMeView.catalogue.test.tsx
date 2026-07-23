import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NearMeView } from './NearMeView'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NearMeView catalogue reader', () => {
  it('opens stored leaflets and catalogue promotions inside the platform', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => success({
          coords: { latitude: -26.2, longitude: 28.04 },
        } as GeolocationPosition)),
      },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: {
        message: 'Stores near you.',
        servedFrom: 'cache',
        stores: [{
          address: '1 Main Road, Johannesburg',
          deals: [],
          lat: -26.2,
          leaflets: [{
            capturedAt: '2026-07-17T08:00:00.000Z',
            id: 'leaflet-1',
            name: 'Weekly leaflet',
            pages: [
              { height: 1600, imageUrl: 'https://cdn.test/leaflet-page.jpg', pageNumber: 1, width: 1100 },
            ],
            retailerId: 'pick-n-pay',
            retailerName: 'Pick n Pay Central',
            url: 'https://official.test/weekly-leaflet',
          }],
          lon: 28.04,
          name: 'Pick n Pay Central',
          placeId: 'pnp-central',
          promotions: [{
            capturedAt: '2026-07-18T08:00:00.000Z',
            id: 'catalogue-1',
            imageUrl: 'https://cdn.test/monthly-cover.jpg',
            kind: 'catalogue',
            productUrl: 'https://official.test/monthly.pdf',
            sourceUrl: 'https://official.test/monthly',
            title: 'Monthly catalogue',
          }, {
            capturedAt: '2026-07-18T08:00:00.000Z',
            id: 'online-deal-1',
            kind: 'deal',
            priceText: 'R20.00',
            savingText: 'Online catalogue · Save R5.00',
            sourceUrl: 'https://official.test/products/rice',
            title: 'Rice 2kg',
            validFrom: '2026-07-20',
            validTo: '2026-08-09',
          }],
          retailerId: 'pick-n-pay',
        }],
        summary: { knownChainCount: 1, storeCount: 1, withDealsCount: 1 },
      },
    }))))

    render(<NearMeView />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))

    // The list shows one summary card per store; the deals and catalogues
    // live on the store's own page.
    const storeCard = await screen.findByRole('button', {
      name: 'Open Pick n Pay Central deals and catalogues',
    })
    expect(storeCard.textContent).toContain('deal')
    expect(storeCard.textContent).toContain('catalogue')
    fireEvent.click(storeCard)
    expect(screen.getByRole('dialog', { name: 'Pick n Pay Central' })).toBeTruthy()
    expect(screen.getByText('Online catalogue · Save R5.00')).toBeTruthy()

    expect(screen.getByText('Until 2026-08-09')).toBeTruthy()

    const weeklyButton = await screen.findByRole('button', { name: /Read Weekly leaflet/i })
    const monthlyButton = screen.getByRole('button', { name: /Read Monthly catalogue/i })
    const catalogueButtons = screen.getAllByRole('button').filter((button) =>
      button.getAttribute('aria-label')?.startsWith('Read '),
    )
    expect(catalogueButtons).toEqual([monthlyButton, weeklyButton])
    expect(weeklyButton.tagName).toBe('BUTTON')
    fireEvent.click(weeklyButton)
    expect(screen.getByRole('dialog', { name: 'Weekly leaflet' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Pick n Pay Central catalogue page 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close catalogue' }))

    expect(monthlyButton.tagName).toBe('BUTTON')
    fireEvent.click(monthlyButton)
    expect(screen.getByRole('dialog', { name: 'Monthly catalogue' })).toBeTruthy()
    // A PDF catalogue reads inline through the same-origin relay, keeping the
    // cover as the fallback for browsers that cannot embed PDFs.
    const embed = document.querySelector('object')
    expect(embed?.getAttribute('type')).toBe('application/pdf')
    expect(embed?.getAttribute('data')).toBe(
      '/api/catalogue-file?u=https%3A%2F%2Fofficial.test%2Fmonthly.pdf',
    )
    expect(screen.getByRole('img', { name: 'Pick n Pay Central catalogue cover' })).toBeTruthy()
  })
})
