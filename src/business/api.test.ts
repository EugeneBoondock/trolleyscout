import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBusinessPublication,
  loadBusinessBootstrap,
  updateBusinessPublication,
  uploadBusinessImage,
} from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('business API client', () => {
  it('loads session, organization, content, locations, and metrics', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.endsWith('/api/member-session')
        ? { session: { account: { id: 'member-1' }, isAuthenticated: true } }
        : url.endsWith('/api/organization')
          ? { hasOrganization: true, organization: { id: 'org-1', name: 'Fresh Market' } }
          : url.endsWith('/api/organization-publications')
            ? { publications: [{ id: 'pub-1', title: 'Potatoes' }] }
            : url.endsWith('/api/organization-locations')
              ? { locations: [{ id: 'location-1', name: 'Orlando West' }] }
              : { metrics: { days: [], rangeDays: 30, totals: { impressions: 8 } } }
      return new Response(JSON.stringify({ data }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadBusinessBootstrap()

    expect(result.gate.organization?.name).toBe('Fresh Market')
    expect(result.publications[0]?.title).toBe('Potatoes')
    expect(result.locations[0]?.name).toBe('Orlando West')
    expect(result.metrics.totals.impressions).toBe(8)
  })

  it('does not request private portal resources when signed out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: { session: { isAuthenticated: false } },
      }), { headers: { 'content-type': 'application/json' }, status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadBusinessBootstrap()

    expect(result.session.isAuthenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses POST for creation and PATCH with a publication id for updates', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({
        data: { publication: { id: 'pub-1' }, publications: [] },
      }), { headers: { 'content-type': 'application/json' }, status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const draft = {
      bodyText: 'Fresh potatoes at a lower price this weekend.',
      kind: 'deal' as const,
      placement: 'both' as const,
      title: 'Weekend potatoes',
    }

    await createBusinessPublication(draft)
    await updateBusinessPublication('pub-1', draft)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/organization-publications',
      expect.objectContaining({ method: 'POST' }),
    )
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit
    expect(secondInit.method).toBe('PATCH')
    expect(JSON.parse(String(secondInit.body))).toMatchObject({
      operation: 'update',
      publicationId: 'pub-1',
    })
  })

  it('uploads an image as multipart form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        media: {
          altText: 'A tray of red tomatoes',
          id: 'org-media-1',
          key: 'organizations/org-1/image.jpg',
          url: 'https://trolleyscout.co.za/api/organization-media?key=image',
        },
      },
    }), { headers: { 'content-type': 'application/json' }, status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const image = new File(['jpeg'], 'tomatoes.jpg', { type: 'image/jpeg' })

    const media = await uploadBusinessImage(image, 'A tray of red tomatoes')

    expect(media.id).toBe('org-media-1')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('image')).toBe(image)
  })
})
