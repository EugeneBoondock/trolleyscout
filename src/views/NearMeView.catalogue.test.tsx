import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
            id: 'catalogue-1',
            imageUrl: 'https://cdn.test/monthly-cover.jpg',
            kind: 'catalogue',
            productUrl: 'https://official.test/monthly.pdf',
            sourceUrl: 'https://official.test/monthly',
            title: 'Monthly catalogue',
          }],
          retailerId: 'pick-n-pay',
        }],
        summary: { knownChainCount: 1, storeCount: 1, withDealsCount: 1 },
      },
    }))))

    render(<NearMeView />)
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }))

    const weeklyButton = await screen.findByRole('button', { name: /Read Weekly leaflet/i })
    expect(weeklyButton.tagName).toBe('BUTTON')
    fireEvent.click(weeklyButton)
    expect(screen.getByRole('dialog', { name: 'Weekly leaflet' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Pick n Pay Central catalogue page 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close catalogue' }))

    const monthlyButton = screen.getByRole('button', { name: /Read Monthly catalogue/i })
    expect(monthlyButton.tagName).toBe('BUTTON')
    fireEvent.click(monthlyButton)
    expect(screen.getByRole('dialog', { name: 'Monthly catalogue' })).toBeTruthy()
    await waitFor(() => {
      expect(document.querySelector('object')?.getAttribute('data')).toBe(
        'https://official.test/monthly.pdf',
      )
    })
  })
})
