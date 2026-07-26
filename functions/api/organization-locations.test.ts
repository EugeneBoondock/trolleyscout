import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createOrganizationLocation: vi.fn(),
  getMemberSession: vi.fn(),
  getOrganizationForAccount: vi.fn(),
  listOrganizationLocations: vi.fn(),
  updateOrganizationLocation: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))
vi.mock('../_shared/organizationStore', () => ({
  getOrganizationForAccount: mocks.getOrganizationForAccount,
}))
vi.mock('../_shared/organizationPublicationStore', () => ({
  createOrganizationLocation: mocks.createOrganizationLocation,
  listOrganizationLocations: mocks.listOrganizationLocations,
  updateOrganizationLocation: mocks.updateOrganizationLocation,
}))

import { onRequest } from './organization-locations'

const ENDPOINT = 'https://org.trolleyscout.co.za/api/organization-locations'
const location = { id: 'org-location-1', name: 'Orlando West', status: 'active' }

describe('/api/organization-locations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'member-1', role: 'member' },
      isAuthenticated: true,
    })
    mocks.getOrganizationForAccount.mockResolvedValue({ id: 'org-1', status: 'active' })
    mocks.listOrganizationLocations.mockResolvedValue([location])
    mocks.createOrganizationLocation.mockResolvedValue({ location })
    mocks.updateOrganizationLocation.mockResolvedValue({ location })
  })

  it('lists and creates locations for the session organization', async () => {
    const listed = await invoke(new Request(ENDPOINT))
    const created = await invoke(write('POST', locationBody()))

    expect(await listed.json()).toMatchObject({ data: { locations: [location] } })
    expect(created.status).toBe(200)
    expect(mocks.createOrganizationLocation).toHaveBeenCalledWith(
      expect.anything(),
      'member-1',
      expect.objectContaining({ city: 'Soweto', countryCode: 'ZA' }),
    )
  })

  it('updates by a bounded location id and returns validation issues', async () => {
    mocks.updateOrganizationLocation.mockResolvedValue({ issues: ['Enter a street address.'] })

    const response = await invoke(write('PATCH', {
      ...locationBody(),
      addressLine: '',
      locationId: 'org-location-1',
    }))

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      data: { issues: ['Enter a street address.'] },
    })
  })

  it('requires an active organization and accepts only supported methods', async () => {
    mocks.getOrganizationForAccount.mockResolvedValue(undefined)
    const forbidden = await invoke(new Request(ENDPOINT))
    const unsupported = await invoke(new Request(ENDPOINT, { method: 'DELETE' }))

    expect(forbidden.status).toBe(403)
    expect(unsupported.status).toBe(405)
  })
})

function locationBody() {
  return {
    addressLine: '12 Vilakazi Street',
    city: 'Soweto',
    countryCode: 'ZA',
    name: 'Orlando West',
    province: 'Gauteng',
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
