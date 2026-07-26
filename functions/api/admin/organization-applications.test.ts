import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  listOrganizationApplicationsForReview: vi.fn(),
  reviewOrganizationApplication: vi.fn(),
}))

vi.mock('../../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../../_shared/organizationStore', () => ({
  listOrganizationApplicationsForReview: mocks.listOrganizationApplicationsForReview,
  reviewOrganizationApplication: mocks.reviewOrganizationApplication,
}))

import { onRequest } from './organization-applications'

const ENDPOINT = 'https://trolleyscout.co.za/api/admin/organization-applications'
const queued = {
  accountId: 'member-1',
  contactEmail: 'owner@freshmarket.co.za',
  contactName: 'Thandi Nkosi',
  id: 'org-app-1',
  organisationName: 'Fresh Market',
  status: 'pending',
}
const organization = { id: 'org-1', name: 'Fresh Market', slug: 'fresh-market', status: 'active' }

describe('/api/admin/organization-applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.listOrganizationApplicationsForReview.mockResolvedValue([queued])
    mocks.reviewOrganizationApplication.mockResolvedValue({
      application: { ...queued, status: 'approved' },
      changed: true,
      organization,
    })
  })

  it('keeps a signed-out visitor out of the review queue', async () => {
    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(403)
    expect(mocks.listOrganizationApplicationsForReview).not.toHaveBeenCalled()
  })

  it('never shows another member’s application to a non-admin member', async () => {
    signedInAs('member-2', 'member')

    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ data: { message: 'Admin access is required.' } })
    expect(mocks.listOrganizationApplicationsForReview).not.toHaveBeenCalled()
  })

  it('does not let a member decide an application', async () => {
    signedInAs('member-1', 'member')

    const response = await invoke(decide({ applicationId: 'org-app-1', decision: 'approved' }))

    expect(response.status).toBe(403)
    expect(mocks.reviewOrganizationApplication).not.toHaveBeenCalled()
  })

  it('serves the queue to an admin, privately', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(`${ENDPOINT}?status=pending`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ data: { applications: [queued] } })
    expect(mocks.listOrganizationApplicationsForReview).toHaveBeenCalledWith(
      expect.anything(),
      'pending',
    )
  })

  it('records the decision against the signed-in admin, not a body field', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(decide({
      applicationId: 'org-app-1',
      decision: 'approved',
      note: 'Verified against CIPC.',
      reviewedBy: 'member-1',
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { changed: true, organization } })
    expect(mocks.reviewOrganizationApplication).toHaveBeenCalledWith(
      expect.anything(),
      'admin-1',
      'org-app-1',
      'approved',
      'Verified against CIPC.',
    )
  })

  it('sends the approved owner a business workspace link', async () => {
    signedInAs('admin-1', 'admin')
    const send = vi.fn().mockResolvedValue(undefined)

    const response = await invoke(
      decide({ applicationId: 'org-app-1', decision: 'approved' }),
      { EMAIL: { send } },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: { emailSent: true },
    })
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      subject: expect.stringContaining('workspace'),
      to: expect.any(String),
    })
    expect(JSON.stringify(send.mock.calls[0]?.[0])).toContain(
      'https://org.trolleyscout.co.za/?approved=1',
    )
  })

  it('accepts a decision by PATCH as well as POST', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(decide(
      { applicationId: 'org-app-1', decision: 'rejected' },
      'PATCH',
    ))

    expect(response.status).toBe(200)
    expect(mocks.reviewOrganizationApplication).toHaveBeenCalledWith(
      expect.anything(),
      'admin-1',
      'org-app-1',
      'rejected',
      undefined,
    )
  })

  it('refuses a decision that is not approved or rejected', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(decide({ applicationId: 'org-app-1', decision: 'active' }))

    expect(response.status).toBe(422)
    expect(mocks.reviewOrganizationApplication).not.toHaveBeenCalled()
  })

  it('refuses a decision with no application id', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(decide({ decision: 'approved' }))

    expect(response.status).toBe(422)
    expect(mocks.reviewOrganizationApplication).not.toHaveBeenCalled()
  })

  it('reports a store refusal as an unprocessable decision', async () => {
    signedInAs('admin-1', 'admin')
    mocks.reviewOrganizationApplication.mockResolvedValue({
      changed: false,
      issues: ['That application was not found.'],
    })

    const response = await invoke(decide({ applicationId: 'org-app-9', decision: 'approved' }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      data: { changed: false, issues: ['That application was not found.'] },
    })
  })

  it('refuses a cross-site decision', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ applicationId: 'org-app-1', decision: 'approved' }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      method: 'POST',
    }))

    expect(response.status).toBe(403)
    expect(mocks.reviewOrganizationApplication).not.toHaveBeenCalled()
  })

  it('refuses a method the queue does not support', async () => {
    signedInAs('admin-1', 'admin')

    const response = await invoke(new Request(ENDPOINT, { method: 'DELETE' }))

    expect(response.status).toBe(405)
    expect(mocks.getMemberSession).not.toHaveBeenCalled()
  })
})

function signedInAs(id: string, role: 'admin' | 'member') {
  mocks.getMemberSession.mockResolvedValue({ account: { id, role }, isAuthenticated: true })
}

function decide(body: Record<string, unknown>, method = 'POST') {
  return new Request(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  })
}

function invoke(request: Request, bindings: Record<string, unknown> = {}) {
  return onRequest({ env: { DB: {}, ...bindings }, request } as never)
}
