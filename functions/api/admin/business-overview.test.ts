import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  loadBusinessAdminOverview: vi.fn(),
  setBusinessAdminStatus: vi.fn(),
}))

vi.mock('../../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../../_shared/businessAdminStore', () => ({
  loadBusinessAdminOverview: mocks.loadBusinessAdminOverview,
  setBusinessAdminStatus: mocks.setBusinessAdminStatus,
}))

import { onRequest } from './business-overview'

const ENDPOINT = 'https://org.trolleyscout.co.za/api/admin/business-overview'
const overview = {
  businesses: [{ id: 'org-1', name: 'Fresh Market', status: 'active' }],
  campaigns: [{ id: 'org-pub-1', title: 'Weekend potatoes' }],
  generatedAt: '2026-07-26T20:00:00.000Z',
  payments: [{ amountCents: 149900, id: 'event-1' }],
  totals: {
    activeBusinesses: 1,
    businesses: 1,
    campaigns: 1,
    completedCampaigns: 0,
    liveCampaigns: 1,
    paidCents: 149900,
    paidTransactions: 1,
    pendingApplications: 2,
    pendingModeration: 3,
    suspendedBusinesses: 0,
  },
}

describe('/api/admin/business-overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.loadBusinessAdminOverview.mockResolvedValue(overview)
    mocks.setBusinessAdminStatus.mockResolvedValue({ changed: true })
  })

  it('keeps business reporting private to consumer admins', async () => {
    const signedOut = await invoke(new Request(ENDPOINT))
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'member-1', role: 'member' },
      isAuthenticated: true,
    })
    const member = await invoke(new Request(ENDPOINT))

    expect(signedOut.status).toBe(403)
    expect(member.status).toBe(403)
    expect(mocks.loadBusinessAdminOverview).not.toHaveBeenCalled()
  })

  it('loads the business, campaign, moderation, and payment overview for an admin', async () => {
    signInAdmin()

    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ data: { overview } })
  })

  it('suspends a business from a trusted admin write and reloads reporting', async () => {
    signInAdmin()

    const response = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ businessId: 'org-1', status: 'suspended' }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://org.trolleyscout.co.za',
      },
      method: 'PATCH',
    }))

    expect(response.status).toBe(200)
    expect(mocks.setBusinessAdminStatus).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      'suspended',
    )
    expect(await response.json()).toMatchObject({
      data: { changed: true, overview },
    })
  })

  it('rejects cross-site writes and unknown status values', async () => {
    signInAdmin()

    const crossSite = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ businessId: 'org-1', status: 'suspended' }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      method: 'PATCH',
    }))
    const unknown = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ businessId: 'org-1', status: 'deleted' }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://org.trolleyscout.co.za',
      },
      method: 'PATCH',
    }))

    expect(crossSite.status).toBe(403)
    expect(unknown.status).toBe(422)
    expect(mocks.setBusinessAdminStatus).not.toHaveBeenCalled()
  })
})

function signInAdmin() {
  mocks.getMemberSession.mockResolvedValue({
    account: { id: 'admin-1', role: 'admin' },
    isAuthenticated: true,
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
