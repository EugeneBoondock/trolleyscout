import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  changeBusinessPublication: vi.fn(),
  createBusinessLocation: vi.fn(),
  createBusinessPublication: vi.fn(),
  loadBusinessBootstrap: vi.fn(),
  signInBusiness: vi.fn(),
  signOutBusiness: vi.fn(),
  updateBusinessPublication: vi.fn(),
}))

vi.mock('./api', () => mocks)

import { BusinessApp } from './BusinessApp'

const account = {
  displayName: 'Thandi Nkosi',
  email: 'owner@freshmarket.co.za',
  id: 'member-1',
  initials: 'TN',
  isAdmin: false,
  planId: 'organization',
  planName: 'Organisation',
  planStatus: 'active',
  role: 'member',
}

const activeBootstrap = {
  gate: {
    applicationStatus: 'approved',
    hasOrganization: true,
    organization: { id: 'org-1', name: 'Fresh Market', slug: 'fresh-market', status: 'active' },
  },
  locations: [{
    addressLine: '12 Vilakazi Street',
    city: 'Soweto',
    countryCode: 'ZA',
    createdAt: '2026-07-01T08:00:00.000Z',
    id: 'location-1',
    name: 'Orlando West',
    organizationId: 'org-1',
    province: 'Gauteng',
    status: 'active',
    updatedAt: '2026-07-01T08:00:00.000Z',
  }],
  metrics: {
    days: [],
    rangeDays: 30,
    totals: { impressions: 820, opens: 94, outboundVisits: 31, saves: 67 },
  },
  publications: [{
    bodyText: 'Two kilograms of fresh potatoes at a lower weekend price.',
    createdAt: '2026-07-26T08:00:00.000Z',
    createdBy: 'member-1',
    currencyCode: 'ZAR',
    endsAt: '2026-08-02T18:00:00.000Z',
    id: 'pub-1',
    imageAlt: 'A bag of fresh potatoes',
    imageUrl: 'https://images.example.co.za/potatoes.webp',
    kind: 'deal',
    locationIds: ['location-1'],
    organizationId: 'org-1',
    organizationName: 'Fresh Market',
    organizationSlug: 'fresh-market',
    placement: 'both',
    priceCents: 4999,
    startsAt: '2026-08-01T06:00:00.000Z',
    status: 'live',
    targetUrl: 'https://fresh.example.co.za/potatoes',
    title: 'Weekend potatoes',
    updatedAt: '2026-07-26T08:00:00.000Z',
  }],
  session: { account, isAuthenticated: true },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadBusinessBootstrap.mockResolvedValue(activeBootstrap)
  mocks.createBusinessPublication.mockResolvedValue({
    publication: activeBootstrap.publications[0],
    publications: activeBootstrap.publications,
  })
  window.localStorage.clear()
  document.documentElement.dataset.theme = 'light'
})

afterEach(cleanup)

describe('Trolley Scout for Business', () => {
  it('shows an operational overview with real status and result labels', async () => {
    render(<BusinessApp />)

    expect(await screen.findByRole('heading', { name: /Thandi/ })).toBeTruthy()
    expect(screen.getByText('Fresh Market')).toBeTruthy()
    expect(screen.getByText('Live now')).toBeTruthy()
    expect(screen.getByText('820')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open publication composer' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Business workspace' })).toBeTruthy()
  })

  it('opens a composer with kind-specific fields and consumer previews', async () => {
    render(<BusinessApp />)
    await screen.findByText('Live now')

    fireEvent.click(screen.getByRole('button', { name: 'Open publication composer' }))

    expect(screen.getByRole('heading', { name: 'Create publication' })).toBeTruthy()
    expect(screen.getByLabelText('Current price')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marketplace preview' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Window Shopping preview' }))
    expect(screen.getByText('Window Shopping preview')).toBeTruthy()
  })

  it('creates a draft from entered business content', async () => {
    render(<BusinessApp />)
    await screen.findByText('Live now')
    fireEvent.click(screen.getByRole('button', { name: 'Open publication composer' }))

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Fresh tomato tray' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A tray of fresh tomatoes available at Orlando West this weekend.' },
    })
    fireEvent.change(screen.getByLabelText('Current price'), { target: { value: '39.99' } })
    fireEvent.change(screen.getByLabelText('Destination link'), {
      target: { value: 'https://fresh.example.co.za/tomatoes' },
    })
    fireEvent.change(screen.getByLabelText('Cover image link'), {
      target: { value: 'https://images.example.co.za/tomatoes.webp' },
    })
    fireEvent.change(screen.getByLabelText('Image description'), {
      target: { value: 'A tray of red tomatoes' },
    })
    fireEvent.change(screen.getByLabelText('End date and time'), {
      target: { value: '2026-08-02T18:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft from header' }))

    await waitFor(() => expect(mocks.createBusinessPublication).toHaveBeenCalled())
    expect(mocks.createBusinessPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        priceCents: 3999,
        title: 'Fresh tomato tray',
      }),
    )
  })

  it('uses a focused sign-in screen when no member session exists', async () => {
    mocks.loadBusinessBootstrap.mockResolvedValue({
      ...activeBootstrap,
      gate: { applicationStatus: null, hasOrganization: false, organization: null },
      locations: [],
      publications: [],
      session: { isAuthenticated: false },
    })
    render(<BusinessApp />)

    expect(await screen.findByRole('heading', { name: 'Run your storefront' })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByText(/Subscribe and apply in Trolley Scout/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull()
  })

  it('shows the application state instead of exposing portal navigation', async () => {
    mocks.loadBusinessBootstrap.mockResolvedValue({
      ...activeBootstrap,
      gate: {
        applicationStatus: 'pending',
        hasOrganization: false,
        message: 'Your organisation application is with our team.',
        organization: null,
      },
      locations: [],
      publications: [],
    })
    render(<BusinessApp />)

    expect(await screen.findByRole('heading', { name: 'Application under review' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Business workspace' })).toBeNull()
  })

  it('switches to a readable dark theme from the shell', async () => {
    render(<BusinessApp />)
    await screen.findByText('Live now')

    const accountMenu = screen.getByRole('button', { name: 'Account and appearance' })
    fireEvent.click(accountMenu)
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Use dark theme' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('trolley-scout-business-theme')).toBe('dark')
  })
})
