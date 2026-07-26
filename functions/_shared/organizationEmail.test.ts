// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { sendOrganizationAccessEmail } from './organizationEmail'
import type { Organization, OrganizationApplication } from './organizationStore'

describe('organization access email', () => {
  it('keeps approval successful when the email binding is unavailable', async () => {
    const result = await sendOrganizationAccessEmail({}, application, organization)

    expect(result.sent).toBe(false)
    expect(result.issue).toContain('email service is unavailable')
  })

  it('sends text and escaped HTML with the approved workspace link', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))

    const result = await sendOrganizationAccessEmail(
      { ORGANIZATION_EMAIL: { fetch } as never },
      {
        ...application,
        contactName: 'Thandi & Team',
        organisationName: 'Fresh "Market"',
      },
      { ...organization, name: 'Fresh "Market"' },
    )

    expect(result).toEqual({ sent: true })
    const request = fetch.mock.calls[0]?.[1] as RequestInit
    const payload = JSON.parse(String(request.body)) as {
      html: string
      text: string
      to: string
    }
    expect(payload.to).toBe('owner@freshmarket.co.za')
    expect(payload.text).toContain('https://org.trolleyscout.co.za/?approved=1')
    expect(payload.html).toContain('Thandi &amp; Team')
    expect(payload.html).toContain('Fresh &quot;Market&quot;')
    expect(payload.html).not.toContain('Thandi & Team')
    expect(request.method).toBe('POST')
  })
})

const application: OrganizationApplication = {
  accountId: 'member-1',
  businessSubscriptionActive: true,
  contactEmail: 'owner@freshmarket.co.za',
  contactName: 'Thandi Nkosi',
  createdAt: '2026-07-26T08:00:00.000Z',
  description: 'A family grocer selling fresh produce and household basics.',
  id: 'org-app-1',
  organisationName: 'Fresh Market',
  planId: 'organization',
  planStatus: 'active',
  status: 'approved',
  updatedAt: '2026-07-26T08:00:00.000Z',
}

const organization: Organization = {
  accountId: 'member-1',
  applicationId: 'org-app-1',
  createdAt: '2026-07-26T08:30:00.000Z',
  id: 'org-1',
  name: 'Fresh Market',
  slug: 'fresh-market',
  status: 'active',
  updatedAt: '2026-07-26T08:30:00.000Z',
}
