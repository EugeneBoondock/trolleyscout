import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  review: vi.fn(),
}))
vi.mock('../services/apiClient', async (original) => ({
  ...await original<typeof import('../services/apiClient')>(),
  loadAdminDealReports: mocks.load,
  reviewAdminDealReport: mocks.review,
}))

import { AdminDealReportsPanel } from './AdminDealReportsPanel'

describe('AdminDealReportsPanel', () => {
  afterEach(cleanup)
  beforeEach(() => {
    mocks.load.mockReset().mockResolvedValue([report])
    mocks.review.mockReset().mockResolvedValue([])
  })

  it('shows source proof and clears a reviewed report', async () => {
    render(<AdminDealReportsPanel />)
    expect(await screen.findByText('Rice 2 kg')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Retailer source/ }).getAttribute('href'))
      .toBe('https://shop.example/specials')

    fireEvent.click(screen.getByRole('button', { name: /Confirm issue/ }))
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('report-1', 'confirmed'))
    expect(await screen.findByText('The review queue is clear.')).toBeTruthy()
  })
})

const report = {
  accountId: 'member-1',
  countryCode: 'ZA',
  createdAt: '2026-08-01T10:00:00.000Z',
  dealId: 'deal-1',
  id: 'report-1',
  note: 'The shelf label ended yesterday.',
  productUrl: 'https://shop.example/product/1',
  reason: 'expired' as const,
  retailerId: 'shop',
  retailerName: 'Shop',
  sourceUrl: 'https://shop.example/specials',
  status: 'pending' as const,
  title: 'Rice 2 kg',
  updatedAt: '2026-08-01T10:00:00.000Z',
}
