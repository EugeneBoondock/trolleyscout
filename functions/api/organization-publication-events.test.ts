import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordOrganizationPublicationEvent: vi.fn(),
}))

vi.mock('../_shared/organizationPublicationStore', () => ({
  isPublicationEvent: (value: unknown) =>
    value === 'impression' || value === 'image_view' ||
    value === 'save' || value === 'link_click',
  recordOrganizationPublicationEvent: mocks.recordOrganizationPublicationEvent,
}))

import { onRequest } from './organization-publication-events'

const ENDPOINT = 'https://trolleyscout.co.za/api/organization-publication-events'

describe('/api/organization-publication-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordOrganizationPublicationEvent.mockResolvedValue(true)
  })

  it('records a supported event against a visible business publication', async () => {
    const response = await invoke(write({
      destination: 'marketplace',
      event: 'image_view',
      publicationId: 'org-pub-1',
    }))

    expect(response.status).toBe(202)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(mocks.recordOrganizationPublicationEvent).toHaveBeenCalledWith(
      expect.anything(),
      'org-pub-1',
      'marketplace',
      'image_view',
    )
  })

  it('rejects malformed events and unknown publications without exposing details', async () => {
    const malformed = await invoke(write({
      event: 'purchase',
      destination: 'marketplace',
      publicationId: 'org-pub-1',
    }))
    mocks.recordOrganizationPublicationEvent.mockResolvedValue(false)
    const missing = await invoke(write({
      event: 'impression',
      destination: 'marketplace',
      publicationId: 'org-pub-missing',
    }))

    expect(malformed.status).toBe(422)
    expect(missing.status).toBe(404)
  })

  it('supports a mobile preflight and refuses cross-site browser posts', async () => {
    const preflight = await invoke(new Request(ENDPOINT, { method: 'OPTIONS' }))
    const crossSite = await invoke(new Request(ENDPOINT, {
      body: JSON.stringify({
        destination: 'marketplace',
        event: 'save',
        publicationId: 'org-pub-1',
      }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      method: 'POST',
    }))

    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
    expect(crossSite.status).toBe(403)
    expect(mocks.recordOrganizationPublicationEvent).not.toHaveBeenCalled()
  })

  it('rejects unsupported methods', async () => {
    const response = await invoke(new Request(ENDPOINT))
    expect(response.status).toBe(405)
  })
})

function write(body: Record<string, unknown>) {
  return new Request(ENDPOINT, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

function invoke(request: Request) {
  return onRequest({ env: { DB: {} }, request } as never)
}
