import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadBusinessApplicationsForReview: vi.fn(),
  reviewBusinessApplication: vi.fn(),
}))

vi.mock('../services/apiClient', () => mocks)

import { AdminOrganizationApplications } from './AdminOrganizationApplications'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadBusinessApplicationsForReview.mockResolvedValue({
    applications: [application],
    message: 'Business applications loaded.',
    ok: true,
  })
  mocks.reviewBusinessApplication.mockResolvedValue({
    applications: [{ ...application, status: 'approved' }],
    changed: true,
    emailSent: true,
    issues: [],
    ok: true,
  })
})

afterEach(cleanup)

describe('business application admin review', () => {
  it('shows the subscription gate beside the applicant details', async () => {
    mocks.loadBusinessApplicationsForReview.mockResolvedValue({
      applications: [{ ...application, businessSubscriptionActive: false }],
      message: 'Business applications loaded.',
      ok: true,
    })

    render(<AdminOrganizationApplications />)

    expect(await screen.findByText('Fresh Market')).toBeTruthy()
    expect(screen.getByText('Waiting for subscription')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Approve and send access' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('approves a subscribed applicant and reports the email', async () => {
    render(<AdminOrganizationApplications />)
    await screen.findByText('Fresh Market')

    fireEvent.click(screen.getByRole('button', { name: 'Approve and send access' }))

    await waitFor(() =>
      expect(mocks.reviewBusinessApplication).toHaveBeenCalledWith(
        'org-app-1',
        'approved',
        undefined,
      ),
    )
    expect(await screen.findByText('Business approved. The owner’s access email was sent.')).toBeTruthy()
  })
})

const application = {
  accountId: 'member-1',
  businessSubscriptionActive: true,
  category: 'Grocery',
  contactEmail: 'owner@freshmarket.co.za',
  contactName: 'Thandi Nkosi',
  createdAt: '2026-07-26T08:00:00.000Z',
  description: 'A family grocer selling fresh produce and household basics.',
  id: 'org-app-1',
  organisationName: 'Fresh Market',
  planId: 'organization',
  planStatus: 'active',
  status: 'pending',
  updatedAt: '2026-07-26T08:00:00.000Z',
} as const
