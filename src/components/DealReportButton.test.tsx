import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoveredDeal } from '../types'

const reportDeal = vi.hoisted(() => vi.fn())
vi.mock('../services/apiClient', async (original) => ({
  ...await original<typeof import('../services/apiClient')>(),
  reportDeal,
}))

import { DealReportButton } from './DealReportButton'

describe('DealReportButton', () => {
  afterEach(cleanup)

  beforeEach(() => {
    reportDeal.mockReset()
    reportDeal.mockResolvedValue({ id: 'report-1' })
  })

  it('submits the exact deal source to moderation', async () => {
    render(<DealReportButton deal={deal} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report issue' }))
    fireEvent.click(screen.getByLabelText('Offer has ended'))
    fireEvent.change(screen.getByLabelText('Short note (optional)'), {
      target: { value: 'The shelf label ended yesterday.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(reportDeal).toHaveBeenCalledWith({
      dealId: 'deal-1',
      note: 'The shelf label ended yesterday.',
      productUrl: 'https://shop.example/product/1',
      reason: 'expired',
      retailerId: 'shop',
      retailerName: 'Shop',
      sourceUrl: 'https://shop.example/specials',
      title: 'Rice 2 kg',
    }))
    expect(await screen.findByText('Thanks for checking the deal.')).toBeTruthy()
  })

  it('requires a note for an unlisted issue', () => {
    render(<DealReportButton deal={deal} />)
    fireEvent.click(screen.getByRole('button', { name: 'Report issue' }))
    fireEvent.click(screen.getByLabelText('Something else'))
    expect(screen.getByLabelText('Short note').getAttribute('required')).not.toBeNull()
  })
})

const deal: DiscoveredDeal = {
  capturedAt: '2026-08-01T10:00:00.000Z',
  evidenceText: 'Official page',
  id: 'deal-1',
  priceText: 'R29.99',
  productUrl: 'https://shop.example/product/1',
  retailerId: 'shop',
  retailerName: 'Shop',
  sourceLabel: 'Shop specials',
  sourceUrl: 'https://shop.example/specials',
  title: 'Rice 2 kg',
}
