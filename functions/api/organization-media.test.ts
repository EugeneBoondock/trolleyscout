import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
  getOrganizationForAccount: vi.fn(),
}))

vi.mock('../_shared/memberStore', () => ({
  getMemberSession: mocks.getMemberSession,
}))

vi.mock('../_shared/organizationStore', () => ({
  getOrganizationForAccount: mocks.getOrganizationForAccount,
}))

import { onRequest } from './organization-media'

const ENDPOINT = 'https://org.trolleyscout.co.za/api/organization-media'

describe('/api/organization-media', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'member-1' },
      isAuthenticated: true,
    })
    mocks.getOrganizationForAccount.mockResolvedValue({
      id: 'org-1',
      name: 'Fresh Market',
      status: 'active',
    })
  })

  it('uploads a signed JPEG to the organization media prefix', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } })
    const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer
    const request = {
      formData: vi.fn().mockResolvedValue({
        get: (key: string) => key === 'image'
          ? {
              arrayBuffer: async () => imageBytes,
              size: imageBytes.byteLength,
              type: 'image/jpeg',
            }
          : 'A tray of red tomatoes',
      }),
      headers: new Headers(),
      method: 'POST',
      url: ENDPOINT,
    }

    const response = await invoke(request as unknown as Request, {
      DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run })) })) },
      MEDIA: { put },
    })
    const envelope = await response.json() as {
      data: { media: { altText: string; key: string; url: string } }
    }

    expect(response.status).toBe(200)
    expect(envelope.data.media.key).toMatch(/^organizations\/org-1\//)
    expect(envelope.data.media.url).toContain('/api/organization-media?key=')
    expect(envelope.data.media.altText).toBe('A tray of red tomatoes')
    expect(put).toHaveBeenCalledWith(
      envelope.data.media.key,
      expect.any(ArrayBuffer),
      expect.objectContaining({ httpMetadata: { contentType: 'image/jpeg' } }),
    )
  })

  it('rejects spoofed image content and a missing media binding', async () => {
    const form = new FormData()
    form.set('image', new File([
      new TextEncoder().encode('not an image'),
    ], 'fake.jpg', { type: 'image/jpeg' }))

    const spoofed = await invoke(new Request(ENDPOINT, { body: form, method: 'POST' }), {
      DB: { prepare: vi.fn() },
      MEDIA: { put: vi.fn() },
    })
    const unavailable = await invoke(new Request(ENDPOINT, { body: form, method: 'POST' }), {
      DB: { prepare: vi.fn() },
    })

    expect(spoofed.status).toBe(422)
    expect(unavailable.status).toBe(503)
  })

  it('serves stored media with its saved type', async () => {
    const response = await invoke(new Request(
      `${ENDPOINT}?key=organizations%2Forg-1%2Fimage.webp`,
    ), {
      DB: {},
      MEDIA: {
        get: vi.fn().mockResolvedValue({
          body: new Uint8Array([1, 2, 3]),
          httpMetadata: { contentType: 'image/webp' },
        }),
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('cache-control')).toContain('immutable')
  })
})

function invoke(request: Request, env: unknown) {
  return onRequest({ env, request } as never)
}
