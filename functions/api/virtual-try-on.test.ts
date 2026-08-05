import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getMemberSession: vi.fn(),
}))
vi.mock('../_shared/memberStore', () => ({ getMemberSession: mocks.getMemberSession }))

import { onRequest } from './virtual-try-on'

const scoutAccount = { id: 'member-1', planId: 'scout', role: 'member' }
const freeAccount = { id: 'member-2', planId: 'free', role: 'member' }

// A tiny valid base64 payload standing in for a person photo.
const personImage = btoa('person-photo-bytes')

function makeDb(rows: { override?: { enabled: number }; global?: { enabled: number } } = {}) {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        first: async () =>
          sql.includes('member_feature_overrides') ? (rows.override ?? null) : (rows.global ?? null),
        run: async () => ({}),
        all: async () => ({ results: [] }),
      }),
    }),
  }
}

function invoke(env: Record<string, unknown>, body?: Record<string, unknown>) {
  const request = new Request('https://trolleyscout.co.za/api/virtual-try-on', {
    body: JSON.stringify(
      body ?? { garmentImageUrl: 'https://cdn.example.test/shirt.jpg', personImage },
    ),
    headers: { 'content-type': 'application/json', origin: 'https://trolleyscout.co.za' },
    method: 'POST',
  })
  return onRequest({ env, request } as never)
}

describe('/api/virtual-try-on', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getMemberSession.mockResolvedValue({ account: scoutAccount, isAuthenticated: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires a signed-in member', async () => {
    mocks.getMemberSession.mockResolvedValue({ isAuthenticated: false })
    const response = await invoke({ AI: { run: vi.fn() }, DB: makeDb() })
    expect(response.status).toBe(401)
  })

  it('keeps the fitting room behind the Scout plan with an upgrade message', async () => {
    mocks.getMemberSession.mockResolvedValue({ account: freeAccount, isAuthenticated: true })
    const response = await invoke({ AI: { run: vi.fn() }, DB: makeDb() })
    expect(response.status).toBe(403)
    const payload = (await response.json()) as { data: { issues: string[] } }
    expect(payload.data.issues[0]).toContain('Scout plan')
  })

  it('lets an admin on the free plan through', async () => {
    mocks.getMemberSession.mockResolvedValue({
      account: { id: 'admin-1', planId: 'free', role: 'admin' },
      isAuthenticated: true,
    })
    const ai = { run: vi.fn(async () => ({ image: btoa('result') })) }
    const response = await invoke({ AI: ai, DB: makeDb() })
    expect(response.status).toBe(200)
  })

  it('honours the global kill switch', async () => {
    const response = await invoke({
      AI: { run: vi.fn() },
      DB: makeDb({ global: { enabled: 0 } }),
    })
    expect(response.status).toBe(503)
  })

  it('lets a per-member override outrank a disabled global flag', async () => {
    const ai = { run: vi.fn(async () => ({ image: btoa('result') })) }
    const response = await invoke({
      AI: ai,
      DB: makeDb({ global: { enabled: 0 }, override: { enabled: 1 } }),
    })
    expect(response.status).toBe(200)
  })

  it('answers 503 while the AI binding is absent', async () => {
    const response = await invoke({ DB: makeDb() })
    expect(response.status).toBe(503)
    const payload = (await response.json()) as { data: { issues: string[] } }
    expect(payload.data.issues[0]).toBe('Fitting room is warming up')
  })

  it('rejects a body without a person photo', async () => {
    const response = await invoke(
      { AI: { run: vi.fn() }, DB: makeDb() },
      { garmentImageUrl: 'https://cdn.example.test/shirt.jpg' },
    )
    expect(response.status).toBe(400)
  })

  it('runs the try-on model and returns a data URI', async () => {
    const ai = { run: vi.fn(async () => ({ image: btoa('rendered-look') })) }
    const response = await invoke({ AI: ai, DB: makeDb() })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { image: string } }
    expect(payload.data.image).toBe(`data:image/png;base64,${btoa('rendered-look')}`)
    // The published model schema: a person_image data URI and a
    // garment_imageS array — the singular form fails validation upstream.
    expect(ai.run).toHaveBeenCalledWith(
      'pruna/p-image-try-on',
      expect.objectContaining({
        garment_images: [expect.stringMatching(/^data:image\/jpeg;base64,/)],
        person_image: `data:image/jpeg;base64,${personImage}`,
      }),
    )
  })

  it('renders through FASHN when its key is configured', async () => {
    vi.useFakeTimers()
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(url)
      if (url.endsWith('/v1/run')) {
        const body = JSON.parse(String(init?.body)) as {
          inputs: { garment_image: string; model_image: string }
          model_name: string
        }
        expect(body.model_name).toBe('tryon-v1.6')
        expect(body.inputs.model_image).toContain('data:image/jpeg;base64,')
        expect((init?.headers as Record<string, string>).Authorization)
          .toBe('Bearer fashn-test-key')
        return new Response(JSON.stringify({ id: 'pred-1' }))
      }
      if (url.includes('/v1/status/pred-1')) {
        return new Response(JSON.stringify({
          output: ['data:image/png;base64,cmVuZGVyZWQ='],
          status: 'completed',
        }))
      }
      // The garment download at the start of the request.
      return new Response(new Uint8Array([1, 2, 3]))
    }))
    const ai = { run: vi.fn() }
    const pending = invoke({ AI: ai, DB: makeDb(), FASHN_API_KEY: 'fashn-test-key' })
    await vi.runAllTimersAsync()
    const response = await pending
    vi.useRealTimers()

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { image: string } }
    expect(payload.data.image).toBe('data:image/png;base64,cmVuZGVyZWQ=')
    expect(ai.run).not.toHaveBeenCalled()
    expect(requests.some((url) => url.endsWith('/v1/run'))).toBe(true)
  })

  it('reports an unfetchable garment image instead of calling the model', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    const ai = { run: vi.fn() }
    const response = await invoke({ AI: ai, DB: makeDb() })
    expect(response.status).toBe(422)
    expect(ai.run).not.toHaveBeenCalled()
  })
})
