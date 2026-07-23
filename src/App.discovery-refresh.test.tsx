import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import App from './App'

const emptyDiscovery = {
  deals: [],
  leaflets: [],
  refreshedAt: '2026-07-19T12:00:00.000Z',
  served: 'snapshot',
  sources: [],
  summary: {
    checkedSourceCount: 0,
    dataPolicy: 'official sources',
    foundDealCount: 0,
    leafletCount: 0,
    unavailableSourceCount: 0,
  },
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    addEventListener: vi.fn(),
    matches: false,
    media: '',
    removeEventListener: vi.fn(),
  })))
})

it('loads Find Deals once per app session and hides manual refresh from public users', async () => {
  const discoveryRequests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({ session: { isAuthenticated: false } })
    }
    if (path.startsWith('/api/discovery')) {
      discoveryRequests.push(path)
      return envelope(emptyDiscovery)
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Find deals' }))
  expect(await screen.findByRole('heading', { name: 'Source-backed specials' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Deals' }))

  await waitFor(() => expect(discoveryRequests).toEqual(['/api/discovery']))
})

it('shows manual refresh to admins and requests a forced refresh when clicked', async () => {
  const discoveryRequests: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({
        session: {
          isAuthenticated: true,
          account: {
            createdAt: '2026-07-01T10:00:00.000Z',
            displayName: 'Admin User',
            email: 'admin@example.com',
            id: 'admin-1',
            initials: 'AU',
            planId: 'household',
            planName: 'Household',
            planStatus: 'active',
            propertiesAccess: true,
            role: 'admin',
            updatedAt: '2026-07-01T10:00:00.000Z',
          },
        },
      })
    }
    if (path.startsWith('/api/discovery')) {
      discoveryRequests.push(path)
      return envelope(emptyDiscovery)
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)

  await screen.findByRole('button', { name: 'Admin console' })
  const memberNavigation = screen.getByRole('navigation', { name: 'Member navigation' })
  fireEvent.click(within(memberNavigation).getByRole('button', { name: 'Find deals' }))
  const refresh = await screen.findByRole('button', { name: 'Check now' })
  fireEvent.click(refresh)

  await waitFor(() => {
    expect(discoveryRequests).toContain('/api/discovery?refresh=1')
  })
})

it('shows matching image cards for today savings and saved deals', async () => {
  const deal = {
    capturedAt: '2026-07-23T10:00:00.000Z',
    evidenceText: 'Coffee R79.99, was R109.99.',
    id: 'coffee-deal',
    imageUrl: 'https://images.example.test/coffee.png',
    previousPriceText: 'R109.99',
    priceText: 'R79.99',
    productUrl: 'https://example.test/coffee',
    retailerId: 'checkers',
    retailerName: 'Checkers',
    sourceLabel: 'Official specials',
    sourceUrl: 'https://example.test/specials',
    title: 'Ground coffee 250g',
  }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({
        session: {
          isAuthenticated: true,
          account: {
            createdAt: '2026-07-01T10:00:00.000Z',
            displayName: 'Dashboard User',
            email: 'dashboard@example.com',
            id: 'dashboard-1',
            initials: 'DU',
            planId: 'household',
            planName: 'Household',
            planStatus: 'active',
            propertiesAccess: true,
            role: 'member',
            updatedAt: '2026-07-01T10:00:00.000Z',
          },
        },
      })
    }
    if (path.startsWith('/api/discovery')) {
      return envelope({
        ...emptyDiscovery,
        deals: [deal],
        summary: {
          ...emptyDiscovery.summary,
          foundDealCount: 1,
        },
      })
    }
    if (path === '/api/saved-deals') {
      return envelope({
        savedDeals: [{
          ...deal,
          id: 'saved-coffee',
          savedAt: '2026-07-23T11:00:00.000Z',
        }],
      })
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)

  const savings = await screen.findByRole('region', { name: 'Today’s savings' })
  const saved = await screen.findByRole('region', { name: 'Your saved deals' })
  const savingsCard = savings.querySelector<HTMLButtonElement>('.dash-deal-card')
  const savedCard = saved.querySelector<HTMLButtonElement>('.dash-deal-card')
  expect(savingsCard?.querySelector('img')?.getAttribute('src')).toBe(deal.imageUrl)
  expect(savedCard?.querySelector('img')?.getAttribute('src')).toBe(deal.imageUrl)
  expect(savingsCard).toBeTruthy()
  expect(savedCard).toBeTruthy()
})

function envelope(data: unknown) {
  return Response.json({
    data,
    meta: {
      generatedAt: '2026-07-19T12:00:00.000Z',
      source: 'cloudflare-pages',
    },
  })
}
