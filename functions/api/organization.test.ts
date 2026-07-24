import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  getOrganizationForAccount: vi.fn(),
  listMemberOrganizationApplications: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/organizationStore', () => ({
  getOrganizationForAccount: mocks.getOrganizationForAccount,
  listMemberOrganizationApplications: mocks.listMemberOrganizationApplications,
  toPortalOrganization: (organization: Record<string, unknown>) => ({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
  }),
}))

import { onRequest } from './organization'

const ENDPOINT = 'https://trolleyscout.co.za/api/organization'

describe('/api/organization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.getOrganizationForAccount.mockResolvedValue(undefined)
    mocks.listMemberOrganizationApplications.mockResolvedValue([])
  })

  it('closes the portal to a signed-out visitor', async () => {
    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({
      data: { hasOrganization: false, organization: null },
    })
    expect(mocks.getOrganizationForAccount).not.toHaveBeenCalled()
  })

  it('opens the portal for the owner of an active organisation', async () => {
    signedInAs('member-1')
    mocks.getOrganizationForAccount.mockResolvedValue({
      accountId: 'member-1',
      id: 'org-1',
      name: 'Fresh Market',
      slug: 'fresh-market',
      status: 'active',
    })

    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({
      data: {
        hasOrganization: true,
        organization: {
          id: 'org-1',
          name: 'Fresh Market',
          slug: 'fresh-market',
          status: 'active',
        },
      },
    })
    expect(mocks.getOrganizationForAccount).toHaveBeenCalledWith(expect.anything(), 'member-1')
  })

  it('keeps the owner id out of the portal answer', async () => {
    signedInAs('member-1')
    mocks.getOrganizationForAccount.mockResolvedValue({
      accountId: 'member-1',
      id: 'org-1',
      name: 'Fresh Market',
      slug: 'fresh-market',
      status: 'active',
    })

    const response = await invoke(new Request(ENDPOINT))
    const envelope = await response.json() as { data: { organization: Record<string, unknown> } }

    expect(envelope.data.organization).not.toHaveProperty('accountId')
  })

  it('tells a member with no application how to start one', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(ENDPOINT))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        applicationStatus: null,
        hasOrganization: false,
        message: 'No organisation is linked to this account yet. Apply to start one.',
        organization: null,
      },
    })
  })

  it('tells a member their application is still being reviewed', async () => {
    signedInAs('member-1')
    mocks.listMemberOrganizationApplications.mockResolvedValue([
      { id: 'org-app-1', status: 'pending' },
    ])

    const response = await invoke(new Request(ENDPOINT))

    expect(await response.json()).toMatchObject({
      data: { applicationStatus: 'pending', hasOrganization: false, organization: null },
    })
  })

  it('does not accept writes', async () => {
    const response = await invoke(new Request(ENDPOINT, { method: 'POST' }))

    expect(response.status).toBe(405)
    expect(mocks.getMemberSession).not.toHaveBeenCalled()
  })
})

function signedInAs(id: string) {
  mocks.getMemberSession.mockResolvedValue({
    account: { id, role: 'member' },
    isAuthenticated: true,
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
