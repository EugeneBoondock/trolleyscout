import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordOrganizationPublicationEvent } from './apiClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('organization publication event client', () => {
  it('sends the stable publication id and event name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { accepted: true } }),
      { headers: { 'content-type': 'application/json' }, status: 202 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    await recordOrganizationPublicationEvent('org-pub-1', 'outbound')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/organization-publication-events',
      expect.objectContaining({
        body: JSON.stringify({ event: 'outbound', publicationId: 'org-pub-1' }),
        method: 'POST',
      }),
    )
  })
})
