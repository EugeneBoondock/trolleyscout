import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createOrganizationPublication: vi.fn(),
  getMemberSession: vi.fn(),
  getOrganizationForAccount: vi.fn(),
  listOrganizationPublications: vi.fn(),
  setOrganizationPublicationAction: vi.fn(),
  submitOrganizationPublication: vi.fn(),
  updateOrganizationPublication: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/organizationStore', () => ({
  getOrganizationForAccount: mocks.getOrganizationForAccount,
}))

vi.mock('../_shared/organizationPublicationStore', () => ({
  createOrganizationPublication: mocks.createOrganizationPublication,
  listOrganizationPublications: mocks.listOrganizationPublications,
  setOrganizationPublicationAction: mocks.setOrganizationPublicationAction,
  submitOrganizationPublication: mocks.submitOrganizationPublication,
  updateOrganizationPublication: mocks.updateOrganizationPublication,
}))

import { onRequest } from './organization-publications'

const ENDPOINT = 'https://org.trolleyscout.co.za/api/organization-publications'
const publication = {
  bodyText: 'A lower price on fresh potatoes this weekend.',
  id: 'org-pub-1',
  kind: 'deal',
  placement: 'both',
  status: 'draft',
  title: 'Weekend potatoes',
}

describe('/api/organization-publications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.getOrganizationForAccount.mockResolvedValue(undefined)
    mocks.listOrganizationPublications.mockResolvedValue([publication])
    mocks.createOrganizationPublication.mockResolvedValue({ publication })
    mocks.updateOrganizationPublication.mockResolvedValue({ publication })
    mocks.submitOrganizationPublication.mockResolvedValue({
      publication: { ...publication, status: 'submitted' },
    })
    mocks.setOrganizationPublicationAction.mockResolvedValue({
      publication: { ...publication, status: 'archived' },
    })
  })

  it('requires a signed-in active organization', async () => {
    const signedOut = await invoke(new Request(ENDPOINT))
    signedIn()
    const noOrganization = await invoke(new Request(ENDPOINT))

    expect(signedOut.status).toBe(401)
    expect(noOrganization.status).toBe(403)
    expect(mocks.listOrganizationPublications).not.toHaveBeenCalled()
  })

  it('lists the owner publications with a safe status filter', async () => {
    signedInWithOrganization()

    const response = await invoke(new Request(`${ENDPOINT}?status=live`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ data: { publications: [publication] } })
    expect(mocks.listOrganizationPublications).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      'live',
    )
  })

  it('creates against the session owner and ignores forged ownership fields', async () => {
    signedInWithOrganization()

    const response = await invoke(write('POST', {
      ...validBody(),
      accountId: 'member-2',
      organizationId: 'org-2',
      status: 'live',
    }))

    expect(response.status).toBe(200)
    expect(mocks.createOrganizationPublication).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      expect.objectContaining({ kind: 'deal', title: 'Weekend potatoes' }),
    )
    const input = mocks.createOrganizationPublication.mock.calls[0][2] as Record<string, unknown>
    expect(input).not.toHaveProperty('organizationId')
    expect(input).not.toHaveProperty('status')
  })

  it('submits an existing draft without accepting a forged status', async () => {
    signedInWithOrganization()

    const response = await invoke(write('PATCH', {
      operation: 'submit',
      publicationId: 'org-pub-1',
      status: 'live',
    }))

    expect(response.status).toBe(200)
    expect(mocks.submitOrganizationPublication).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      'org-pub-1',
    )
  })

  it('reports store validation errors as unprocessable', async () => {
    signedInWithOrganization()
    mocks.createOrganizationPublication.mockResolvedValue({
      issues: ['Add a current price greater than zero.'],
    })

    const response = await invoke(write('POST', validBody()))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      data: { issues: ['Add a current price greater than zero.'] },
    })
  })

  it('archives through DELETE and refuses cross-site writes', async () => {
    signedInWithOrganization()

    const archived = await invoke(write('DELETE', { publicationId: 'org-pub-1' }))
    const crossSite = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify(validBody()),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      method: 'POST',
    }))

    expect(archived.status).toBe(200)
    expect(mocks.setOrganizationPublicationAction).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      'org-pub-1',
      'archive',
    )
    expect(crossSite.status).toBe(403)
  })

  it('refuses malformed operations and unsupported methods', async () => {
    signedInWithOrganization()

    const malformed = await invoke(write('PATCH', { operation: 'publish_now' }))
    const unsupported = await invoke(new Request(ENDPOINT, { method: 'PUT' }))

    expect(malformed.status).toBe(422)
    expect(unsupported.status).toBe(405)
  })
})

function signedIn() {
  mocks.getMemberSession.mockResolvedValue({
    account: { id: 'member-1', role: 'member' },
    isAuthenticated: true,
  })
}

function signedInWithOrganization() {
  signedIn()
  mocks.getOrganizationForAccount.mockResolvedValue({
    id: 'org-1',
    name: 'Fresh Market',
    status: 'active',
  })
}

function validBody() {
  return {
    bodyText: 'A lower price on fresh potatoes this weekend.',
    currencyCode: 'ZAR',
    endsAt: '2026-08-02T18:00:00.000Z',
    imageAlt: 'A bag of fresh potatoes',
    imageUrl: 'https://images.example.co.za/potatoes.webp',
    kind: 'deal',
    placement: 'both',
    priceCents: 4999,
    startsAt: '2026-08-01T06:00:00.000Z',
    targetUrl: 'https://fresh.example.co.za/potatoes',
    title: 'Weekend potatoes',
  }
}

function write(method: string, body: Record<string, unknown>) {
  return new Request(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
