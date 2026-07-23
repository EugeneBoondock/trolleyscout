import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  loadRetailers,
  readMemberState,
  searchProductPrices,
  setMemberState,
  type ResourceState,
  type RetailerResource,
} from '../services/apiClient'
import { ToolkitView } from './ToolkitView'

vi.mock('../services/apiClient', () => ({
  loadDiscovery: vi.fn(async () => ({
    data: {
      discovery: {
        deals: [
          {
            capturedAt: '2026-07-21T12:00:00.000Z',
            evidenceText: '',
            id: 'checkers-bread',
            priceText: 'R20.99',
            productUrl: 'https://www.checkers.co.za/white-bread',
            retailerId: 'checkers',
            retailerName: 'Checkers',
            sourceLabel: 'Test',
            sourceUrl: 'https://www.checkers.co.za',
            title: 'White Bread 700g',
          },
          {
            capturedAt: '2026-07-21T12:00:00.000Z',
            evidenceText: '',
            id: 'shoprite-bread',
            priceText: 'R19.99',
            productUrl: 'https://www.shoprite.co.za/white-bread',
            retailerId: 'shoprite',
            retailerName: 'Shoprite',
            sourceLabel: 'Test',
            sourceUrl: 'https://www.shoprite.co.za',
            title: 'White Bread 700g',
          },
        ],
      },
    },
  })),
  loadRetailers: vi.fn(),
  readMemberState: vi.fn(async () => ({ ok: true, value: null })),
  searchProductPrices: vi.fn(),
  setMemberState: vi.fn(async () => true),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(readMemberState).mockResolvedValue({ ok: true, value: null })
  vi.mocked(setMemberState).mockResolvedValue(true)
})

describe('automatic store comparison', () => {
  it('does not render the removed shelf tools', () => {
    vi.mocked(loadRetailers).mockResolvedValue({
      data: {
        country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ZA', name: 'South Africa' },
        retailers: [],
        summary: { dataPolicy: '', retailerCount: 0, sourceCount: 0, sourceKinds: [], verifiedOfferCount: 0 },
      },
      message: 'API live.',
      meta: { generatedAt: '2026-07-21T12:00:00.000Z', source: 'cloudflare-pages' },
      status: 'ready',
    })

    render(<ToolkitView />)

    expect(screen.queryByText('Unit price checker')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pack comparison' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Automatic price comparison' })).toBeTruthy()
  })

  it('searches the selected retailers now and does not name a winner from one price', async () => {
    vi.mocked(loadRetailers).mockResolvedValue({
      data: {
        country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ZA', name: 'South Africa' },
        retailers: [
          {
            accentColor: '#000',
            group: 'Supermarket',
            id: 'checkers',
            name: 'Checkers',
            program: '',
            shortName: 'Checkers',
            sourceNote: '',
            sources: [{ kind: 'store-finder', label: 'Website', url: 'https://www.checkers.co.za' }],
            verifiedOn: '2026-07-21',
          },
          {
            accentColor: '#000',
            group: 'Supermarket',
            id: 'shoprite',
            name: 'Shoprite',
            program: '',
            shortName: 'Shoprite',
            sourceNote: '',
            sources: [{ kind: 'store-finder', label: 'Website', url: 'https://www.shoprite.co.za' }],
            verifiedOn: '2026-07-21',
          },
        ],
        summary: {
          dataPolicy: '',
          retailerCount: 2,
          sourceCount: 2,
          sourceKinds: ['store-finder'],
          verifiedOfferCount: 0,
        },
      },
      message: 'API live.',
      meta: { generatedAt: '2026-07-21T12:00:00.000Z', source: 'cloudflare-pages' },
      status: 'ready',
    })
    vi.mocked(searchProductPrices).mockResolvedValue({
      ok: true,
      result: {
        checkedAt: '2026-07-21T12:00:00.000Z',
        country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ZA', name: 'South Africa' },
        foundCount: 1,
        matches: [
          {
            priceCents: 1799,
            productUrl: 'https://www.checkers.co.za/white-bread',
            retailerId: 'checkers',
            retailerName: 'Checkers',
            sourceKind: 'official-site',
            status: 'priced',
            title: 'White Bread 700g',
          },
          { retailerId: 'shoprite', retailerName: 'Shoprite', status: 'unavailable' },
        ],
        pricedCount: 1,
        query: 'white bread',
        savingsCents: 0,
        unavailableCount: 1,
      },
    })

    render(<ToolkitView />)

    await screen.findByText('Checkers')
    expect(setMemberState).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Item to compare'), { target: { value: 'white bread' } })
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }))

    await waitFor(() => {
      expect(searchProductPrices).toHaveBeenCalledWith({
        query: 'white bread',
        retailerIds: ['checkers', 'shoprite'],
      })
    })
    expect(screen.getByText(/Only one selected store returned a live price/)).toBeTruthy()
    const comparison = screen.getByRole('region', { name: 'Automatic price comparison' })
    expect(comparison.textContent).not.toContain('Checkers is cheapest')
    expect(
      within(comparison).getByText(/no public price search we can read/i),
    ).toBeTruthy()
  })

  it('restores the account store choice and saves later changes for web and mobile', async () => {
    vi.mocked(readMemberState).mockResolvedValue({ ok: true, value: ['shoprite'] })
    vi.mocked(loadRetailers).mockResolvedValue({
      data: {
        country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ZA', name: 'South Africa' },
        retailers: [
          {
            accentColor: '#000',
            group: 'Supermarket',
            id: 'checkers',
            name: 'Checkers',
            program: '',
            shortName: 'Checkers',
            sourceNote: '',
            sources: [],
            verifiedOn: '2026-07-21',
          },
          {
            accentColor: '#000',
            group: 'Supermarket',
            id: 'shoprite',
            name: 'Shoprite',
            program: '',
            shortName: 'Shoprite',
            sourceNote: '',
            sources: [],
            verifiedOn: '2026-07-21',
          },
        ],
        summary: {
          dataPolicy: '',
          retailerCount: 2,
          sourceCount: 0,
          sourceKinds: [],
          verifiedOfferCount: 0,
        },
      },
      message: 'API live.',
      meta: { generatedAt: '2026-07-21T12:00:00.000Z', source: 'cloudflare-pages' },
      status: 'ready',
    })

    render(<ToolkitView preferenceOwnerId="member-1" />)

    const shoprite = await screen.findByLabelText('Shoprite') as HTMLInputElement
    const checkers = screen.getByLabelText('Checkers') as HTMLInputElement
    expect(shoprite.checked).toBe(true)
    expect(checkers.checked).toBe(false)
    expect(screen.getByText(/Your choice is saved across web and mobile/)).toBeTruthy()

    fireEvent.click(checkers)

    await waitFor(() => {
      expect(setMemberState).toHaveBeenCalledWith(
        'compare_retailers_v1',
        expect.objectContaining({
          ids: ['shoprite', 'checkers'],
          updatedAt: expect.any(Number),
        }),
      )
    })
    expect(JSON.parse(localStorage.getItem('ts_compare_retailers_v1:member-1') ?? '{}'))
      .toEqual(expect.objectContaining({
        ids: ['shoprite', 'checkers'],
        updatedAt: expect.any(Number),
      }))
  })

  it('carries a public store choice into the first signed-in compare session', async () => {
    localStorage.setItem('ts_compare_retailers_v1', JSON.stringify({
      ids: ['shoprite'],
      updatedAt: 200,
    }))
    vi.mocked(loadRetailers).mockResolvedValue(retailerState())

    render(<ToolkitView preferenceOwnerId="new-member" />)

    expect((await screen.findByLabelText('Shoprite') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Checkers') as HTMLInputElement).checked).toBe(false)
    expect(JSON.parse(localStorage.getItem('ts_compare_retailers_v1:new-member') ?? '{}'))
      .toEqual({ ids: ['shoprite'], updatedAt: 200 })
    await waitFor(() => {
      expect(setMemberState).toHaveBeenCalledWith(
        'compare_retailers_v1',
        { ids: ['shoprite'], updatedAt: 200 },
      )
    })
  })

  it('does not upload local defaults when the account read failed', async () => {
    localStorage.setItem('ts_compare_retailers_v1:member-1', JSON.stringify({
      ids: ['checkers'],
      updatedAt: 300,
    }))
    vi.mocked(readMemberState).mockResolvedValue({ ok: false, value: null })
    vi.mocked(loadRetailers).mockResolvedValue(retailerState())

    render(<ToolkitView preferenceOwnerId="member-1" />)

    expect((await screen.findByLabelText('Checkers') as HTMLInputElement).checked).toBe(true)
    expect(setMemberState).not.toHaveBeenCalled()
  })

  it('keeps and retries a newer local choice when the server copy is stale', async () => {
    localStorage.setItem('ts_compare_retailers_v1:member-1', JSON.stringify({
      ids: ['checkers'],
      updatedAt: 300,
    }))
    vi.mocked(readMemberState).mockResolvedValue({
      ok: true,
      value: { ids: ['shoprite'], updatedAt: 200 },
    })
    vi.mocked(loadRetailers).mockResolvedValue(retailerState())

    render(<ToolkitView preferenceOwnerId="member-1" />)

    expect((await screen.findByLabelText('Checkers') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Shoprite') as HTMLInputElement).checked).toBe(false)
    await waitFor(() => {
      expect(setMemberState).toHaveBeenCalledWith(
        'compare_retailers_v1',
        { ids: ['checkers'], updatedAt: 300 },
      )
    })
  })
})

function retailerState(): ResourceState<RetailerResource> {
  return {
    data: {
      country: { code: 'ZA', currencyCode: 'ZAR', flag: 'ZA', name: 'South Africa' },
      retailers: [
        {
          accentColor: '#000',
          group: 'Supermarket',
          id: 'checkers',
          name: 'Checkers',
          program: '',
          shortName: 'Checkers',
          sourceNote: '',
          sources: [],
          verifiedOn: '2026-07-21',
        },
        {
          accentColor: '#000',
          group: 'Supermarket',
          id: 'shoprite',
          name: 'Shoprite',
          program: '',
          shortName: 'Shoprite',
          sourceNote: '',
          sources: [],
          verifiedOn: '2026-07-21',
        },
      ],
      summary: {
        dataPolicy: '',
        retailerCount: 2,
        sourceCount: 0,
        sourceKinds: [],
        verifiedOfferCount: 0,
      },
    },
    message: 'API live.',
    meta: { generatedAt: '2026-07-21T12:00:00.000Z', source: 'cloudflare-pages' },
    status: 'ready' as const,
  }
}
