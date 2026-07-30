import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  // The home hero's primary action is the public route into the deal aisle.
  fireEvent.click(await screen.findByRole('button', { name: 'Find grocery deals' }))
  expect(await screen.findByRole('heading', { name: 'Marketplace' })).toBeTruthy()
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
            status: 'active' as const,
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
  expect(
    within(memberNavigation).getAllByRole('button').slice(0, 2).map((button) => button.textContent),
  ).toEqual(['Dashboard', 'Marketplace'])
  fireEvent.click(within(memberNavigation).getByRole('button', { name: 'Marketplace' }))
  const refresh = await screen.findByRole('button', { name: 'Check now' })
  fireEvent.click(refresh)

  await waitFor(() => {
    expect(discoveryRequests).toContain('/api/discovery?refresh=1')
  })
})

it('explains when a Free member reaches the marketplace viewing allowance', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({
        session: {
          isAuthenticated: true,
          account: {
            createdAt: '2026-07-01T10:00:00.000Z',
            displayName: 'Free Shopper',
            email: 'free@example.com',
            id: 'free-1',
            initials: 'FS',
            planId: 'free',
            planName: 'Free',
            planStatus: 'active',
            propertiesAccess: false,
            status: 'active' as const,
            role: 'member',
            updatedAt: '2026-07-01T10:00:00.000Z',
          },
        },
      })
    }
    if (path.startsWith('/api/discovery')) {
      return envelope({
        ...emptyDiscovery,
        access: {
          availableCatalogueCount: 72,
          availableDealCount: 12_000,
          catalogueLimit: 50,
          dealLimit: 2_000,
          planId: 'free',
        },
        summary: {
          ...emptyDiscovery.summary,
          foundDealCount: 12_000,
          leafletCount: 72,
        },
      })
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)

  const navigation = await screen.findByRole('navigation', { name: 'Member navigation' })
  fireEvent.click(within(navigation).getByRole('button', { name: 'Marketplace' }))

  expect(await screen.findByText(
    'Free plan: up to 2,000 deals and 50 catalogues. ' +
    '12,000 deals and 72 catalogues are available.',
  )).toBeTruthy()
})

it('shows matching image cards for today savings and saved deals', async () => {
  const deal = {
    capturedAt: '2026-07-23T10:00:00.000Z',
    evidenceText: 'Coffee R79.99, was R109.99.',
    id: 'coffee-deal',
    imageUrl: 'https://images.example.test/coffee.png',
    images: [
      'https://images.example.test/coffee.png',
      'https://images.example.test/coffee-side.png',
    ],
    previousPriceText: 'R109.99',
    priceText: 'R79.99',
    productUrl: 'https://example.test/coffee',
    retailerId: 'checkers',
    retailerName: 'Checkers',
    soldOut: true,
    sourceLabel: 'Official specials',
    sourceUrl: 'https://example.test/specials',
    title: 'Ground coffee 250g',
  }
  const bidDeal = {
    ...deal,
    id: 'bobshop-bid',
    imageUrl: 'https://images.example.test/camera.png',
    images: ['https://images.example.test/camera.png'],
    productUrl: 'https://www.bobshop.co.za/camera/p/1',
    retailerId: 'bobshop',
    retailerName: 'Bob Shop',
    soldOut: undefined,
    title: 'Camera auction',
    unitText: 'Current bid',
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
            status: 'active' as const,
            role: 'member',
            updatedAt: '2026-07-01T10:00:00.000Z',
          },
        },
      })
    }
    if (path.startsWith('/api/discovery')) {
      return envelope({
        ...emptyDiscovery,
        deals: [deal, bidDeal],
        summary: {
          ...emptyDiscovery.summary,
          foundDealCount: 2,
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
  expect(savingsCard?.querySelector('img')?.getAttribute('src')).toBe(deal.imageUrl)
  expect(savingsCard).toBeTruthy()
  await waitFor(() => {
    const savedCard = saved.querySelector<HTMLButtonElement>('.dash-deal-card')
    expect(savedCard?.querySelector('img')?.getAttribute('src')).toBe(deal.imageUrl)
    expect(savedCard).toBeTruthy()
  })
  const savedCard = saved.querySelector<HTMLButtonElement>('.dash-deal-card')
  expect(savingsCard?.textContent).toContain('Sold out')
  expect(savedCard?.textContent).toContain('Sold out')

  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Member navigation' }))
      .getByRole('button', { name: 'Marketplace' }),
  )
  const soldOutBasketButton = await screen.findByRole('button', { name: 'Sold out' })
  expect(soldOutBasketButton).toHaveProperty('disabled', true)
  expect(screen.getByText('Current bid')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: 'View images for Ground coffee 250g' }))
  const viewer = screen.getByRole('dialog', { name: 'Ground coffee 250g images' })
  expect(within(viewer).getByText('1 of 2')).toBeTruthy()
  expect(within(viewer).getAllByText('Sold out').length).toBeGreaterThan(0)
  fireEvent.click(within(viewer).getByRole('button', { name: 'Next image' }))
  expect(within(viewer).getByText('2 of 2')).toBeTruthy()
  expect(within(viewer).getByRole('link', { name: 'View product' }).getAttribute('href')).toContain(
    'https://example.test/coffee',
  )
  fireEvent.click(within(viewer).getByRole('button', { name: 'Close product images' }))

  fireEvent.click(screen.getByText('Advanced filters'))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Hide sold out' }))
  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Sold out' })).toBeNull()
  })
})

it('debounces a large category search so typing keeps the current results responsive', async () => {
  const deals = Array.from({ length: 11_700 }, (_, index) => ({
    capturedAt: '2026-07-29T10:00:00.000Z',
    evidenceText: index === 11_699 ? 'Long grain rice 2kg' : `Milk 2L item ${index}`,
    id: `deal-${index}`,
    productUrl: `https://example.test/product-${index}`,
    retailerId: 'food-market',
    retailerName: 'Food Market',
    sourceLabel: 'Food and grocery specials',
    sourceUrl: 'https://example.test/specials',
    title: index === 11_699 ? 'Long grain rice 2kg' : `Milk 2L item ${index}`,
  }))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({ session: { isAuthenticated: false } })
    }
    if (path.startsWith('/api/discovery')) {
      return envelope({
        ...emptyDiscovery,
        deals,
        summary: {
          ...emptyDiscovery.summary,
          foundDealCount: deals.length,
        },
      })
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find grocery deals' }))
  await screen.findByRole('heading', { name: 'Marketplace' })
  fireEvent.click(screen.getByRole('button', { name: /Food & Groceries/ }))
  expect(screen.getByRole('tab', { name: 'Deals (11700)' })).toBeTruthy()

  vi.useFakeTimers()
  try {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search deals' }), {
      target: { value: 'rice' },
    })
    expect(screen.getByText('Updating results…')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(219)
    })
    expect(screen.getByRole('tab', { name: 'Deals (11700)' })).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(screen.getByRole('tab', { name: 'Deals (1)' })).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})

it('sorts catalogues by Latest by default and supports Oldest with an accessible control', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input)
    if (path === '/api/member-session') {
      return envelope({ session: { isAuthenticated: false } })
    }
    if (path.startsWith('/api/discovery')) {
      return envelope({
        ...emptyDiscovery,
        leaflets: [
          {
            capturedAt: '2026-07-29T10:00:00.000Z',
            id: 'latest',
            name: 'Latest weekly',
            retailerId: 'zulu',
            retailerName: 'Zulu Store',
            pages: [{
              height: 1200,
              imageUrl: 'https://example.test/latest-page.webp',
              pageNumber: 1,
              width: 900,
            }],
            url: 'https://example.test/latest',
            validFrom: '2026-07-29',
          },
          {
            capturedAt: '2026-07-01T10:00:00.000Z',
            id: 'oldest',
            name: 'Oldest weekly',
            retailerId: 'alpha',
            retailerName: 'Alpha Store',
            pages: [{
              height: 1200,
              imageUrl: 'https://example.test/oldest-page.webp',
              pageNumber: 1,
              width: 900,
            }],
            url: 'https://example.test/oldest',
            validFrom: '2026-07-01',
          },
        ],
        summary: {
          ...emptyDiscovery.summary,
          leafletCount: 2,
        },
      })
    }
    return new Response('', { status: 503 })
  }))

  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Find grocery deals' }))
  fireEvent.click(await screen.findByRole('tab', { name: 'Catalogues (2)' }))

  const sort = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Sort catalogues' })
  expect(sort.value).toBe('latest')
  expect(catalogueStoreHeadings()).toEqual(['Zulu Store', 'Alpha Store'])

  fireEvent.change(sort, { target: { value: 'oldest' } })
  expect(catalogueStoreHeadings()).toEqual(['Alpha Store', 'Zulu Store'])
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

function catalogueStoreHeadings() {
  return screen
    .getAllByRole('heading', { level: 4 })
    .map((heading) => heading.textContent)
}
