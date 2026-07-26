import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadOrganizationPublicationReviewQueue: vi.fn(),
  reviewOrganizationPublication: vi.fn(),
}))

vi.mock('./api', () => mocks)

import { AdminPublicationReview } from './AdminPublicationReview'

const publication = {
  bodyText: 'A tray of fresh tomatoes available in Orlando West this weekend.',
  createdAt: '2026-07-26T08:00:00.000Z',
  createdBy: 'member-1',
  currencyCode: 'ZAR',
  endsAt: '2026-08-02T18:00:00.000Z',
  id: 'org-pub-1',
  imageAlt: 'A tray of red tomatoes',
  imageUrl: 'https://images.example.co.za/tomatoes.webp',
  kind: 'deal',
  locationIds: [],
  organizationId: 'org-1',
  organizationName: 'Fresh Market',
  organizationSlug: 'fresh-market',
  placement: 'both',
  priceCents: 3999,
  startsAt: '2026-08-01T06:00:00.000Z',
  status: 'submitted',
  targetUrl: 'https://fresh.example.co.za/tomatoes',
  title: 'Fresh tomato tray',
  updatedAt: '2026-07-26T09:00:00.000Z',
}

beforeEach(() => {
  mocks.loadOrganizationPublicationReviewQueue.mockResolvedValue([publication])
  mocks.reviewOrganizationPublication.mockResolvedValue({ changed: true, publications: [] })
})

afterEach(cleanup)

describe('AdminPublicationReview', () => {
  it('shows the full offer and approves it with the admin note', async () => {
    render(<AdminPublicationReview />)

    expect(await screen.findByRole('heading', { name: 'Fresh tomato tray' })).toBeTruthy()
    expect(screen.getByText('Fresh Market')).toBeTruthy()
    expect(screen.getByText(/R.*39/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Review note for Fresh tomato tray'), {
      target: { value: 'Price and dates checked.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve Fresh tomato tray' }))

    await waitFor(() => expect(mocks.reviewOrganizationPublication).toHaveBeenCalledWith(
      'org-pub-1',
      'approved',
      'Price and dates checked.',
    ))
    expect(await screen.findByText('No publications are waiting for review.')).toBeTruthy()
  })
})
