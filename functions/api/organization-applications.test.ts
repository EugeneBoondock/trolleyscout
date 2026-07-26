import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  listMemberOrganizationApplications: vi.fn(),
  submitOrganizationApplication: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/organizationStore', () => ({
  listMemberOrganizationApplications: mocks.listMemberOrganizationApplications,
  submitOrganizationApplication: mocks.submitOrganizationApplication,
}))

import { onRequest } from './organization-applications'

const application = { id: 'org-app-1', organisationName: 'Fresh Market', status: 'pending' }

const applicationBody = {
  contactEmail: 'owner@freshmarket.co.za',
  contactName: 'Thandi Nkosi',
  description: 'A family grocer selling fresh produce, bread and household basics.',
  organisationName: 'Fresh Market',
}

describe('/api/organization-applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    mocks.listMemberOrganizationApplications.mockResolvedValue([application])
    mocks.submitOrganizationApplication.mockResolvedValue({ application })
  })

  it('asks a signed-out visitor to sign in before applying', async () => {
    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
    ))

    expect(response.status).toBe(401)
    expect(mocks.listMemberOrganizationApplications).not.toHaveBeenCalled()
  })

  it('lists only the signed-in member’s own applications', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { applications: [application] } })
    expect(mocks.listMemberOrganizationApplications).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
    )
  })

  it('serves the member’s applications privately', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
    ))

    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('files the application against the session account, ignoring the body', async () => {
    signedInAs('member-1')

    const response = await invoke(post({
      ...applicationBody,
      accountId: 'member-2',
      id: 'org-app-forged',
      status: 'approved',
    }))

    expect(response.status).toBe(200)
    expect(mocks.submitOrganizationApplication).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      expect.objectContaining({ organisationName: 'Fresh Market' }),
    )
    const [, , input] = mocks.submitOrganizationApplication.mock.calls[0] as [
      unknown, string, Record<string, unknown>,
    ]
    expect(input).not.toHaveProperty('status')
    expect(input).not.toHaveProperty('accountId')
  })

  it('reports validation issues without storing anything', async () => {
    signedInAs('member-1')
    mocks.submitOrganizationApplication.mockResolvedValue({
      issues: ['Enter a valid contact email address so we can reply.'],
    })

    const response = await invoke(post({ ...applicationBody, contactEmail: 'nope' }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      data: { issues: ['Enter a valid contact email address so we can reply.'] },
    })
  })

  it('refuses a cross-site submission', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
      {
        body: JSON.stringify(applicationBody),
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(403)
    expect(mocks.submitOrganizationApplication).not.toHaveBeenCalled()
  })

  it('refuses applications submitted from the business domain', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://org.trolleyscout.co.za/api/organization-applications',
      {
        body: JSON.stringify(applicationBody),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    ))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      data: { issues: [expect.stringContaining('consumer app')] },
    })
    expect(mocks.submitOrganizationApplication).not.toHaveBeenCalled()
  })

  it('refuses an oversized body before parsing it', async () => {
    signedInAs('member-1')

    const response = await invoke(post({
      ...applicationBody,
      description: 'x'.repeat(20_000),
    }))

    expect(response.status).toBe(413)
    expect(mocks.submitOrganizationApplication).not.toHaveBeenCalled()
  })

  it('refuses a body that is not JSON', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
      { body: 'not json', headers: { 'content-type': 'application/json' }, method: 'POST' },
    ))

    expect(response.status).toBe(400)
    expect(mocks.submitOrganizationApplication).not.toHaveBeenCalled()
  })

  it('does not accept a decision on this route', async () => {
    signedInAs('member-1')

    const response = await invoke(new Request(
      'https://trolleyscout.co.za/api/organization-applications',
      { body: JSON.stringify({ decision: 'approved' }), method: 'PATCH' },
    ))

    expect(response.status).toBe(405)
    expect(mocks.submitOrganizationApplication).not.toHaveBeenCalled()
  })
})

function signedInAs(id: string) {
  mocks.getMemberSession.mockResolvedValue({
    account: { id, role: 'member' },
    isAuthenticated: true,
  })
}

function post(body: Record<string, unknown>) {
  return new Request('https://trolleyscout.co.za/api/organization-applications', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
