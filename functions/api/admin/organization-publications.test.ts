import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  listOrganizationPublicationsForReview: vi.fn(),
  reviewOrganizationPublication: vi.fn(),
}))

vi.mock('../../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))
vi.mock('../../_shared/organizationPublicationStore', () => ({
  listOrganizationPublicationsForReview: mocks.listOrganizationPublicationsForReview,
  reviewOrganizationPublication: mocks.reviewOrganizationPublication,
}))

import { onRequest } from './organization-publications'

const ENDPOINT = 'https://org.trolleyscout.co.za/api/admin/organization-publications'
const publication = { id: 'org-pub-1', status: 'submitted', title: 'Weekend potatoes' }

describe('/api/admin/organization-publications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.listOrganizationPublicationsForReview.mockResolvedValue([publication])
    mocks.reviewOrganizationPublication.mockResolvedValue({
      changed: true,
      publication: { ...publication, status: 'live' },
    })
  })

  it('keeps the queue private to admins', async () => {
    const signedOut = await invoke(new Request(ENDPOINT))
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'member-1', role: 'member' },
      isAuthenticated: true,
    })
    const member = await invoke(new Request(ENDPOINT))

    expect(signedOut.status).toBe(403)
    expect(member.status).toBe(403)
    expect(mocks.listOrganizationPublicationsForReview).not.toHaveBeenCalled()
  })

  it('lists submitted publications and records the signed-in reviewer', async () => {
    signedInAdmin()

    const listed = await invoke(new Request(ENDPOINT))
    const reviewed = await invoke(write({
      decision: 'approved',
      note: 'Price and dates checked.',
      publicationId: 'org-pub-1',
      reviewerAccountId: 'member-2',
    }))

    expect(await listed.json()).toMatchObject({ data: { publications: [publication] } })
    expect(reviewed.status).toBe(200)
    expect(mocks.reviewOrganizationPublication).toHaveBeenCalledWith(
      expect.anything(),
      'admin-1',
      'org-pub-1',
      'approved',
      'Price and dates checked.',
    )
  })

  it('rejects unknown decisions and cross-site writes', async () => {
    signedInAdmin()

    const unknown = await invoke(write({
      decision: 'publish_now',
      publicationId: 'org-pub-1',
    }))
    const crossSite = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({ decision: 'approved', publicationId: 'org-pub-1' }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      method: 'PATCH',
    }))

    expect(unknown.status).toBe(422)
    expect(crossSite.status).toBe(403)
    expect(mocks.reviewOrganizationPublication).not.toHaveBeenCalled()
  })
})

function signedInAdmin() {
  mocks.getMemberSession.mockResolvedValue({
    account: { id: 'admin-1', role: 'admin' },
    isAuthenticated: true,
  })
}

function write(body: Record<string, unknown>) {
  return new Request(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PATCH',
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
