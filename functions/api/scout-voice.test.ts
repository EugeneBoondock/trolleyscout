import { describe, expect, it, vi } from 'vitest'
import {
  extractOpenAIAnswer,
  handleScoutVoice,
  type ScoutVoiceDependencies,
} from './scout-voice'

function dependencies(overrides: Partial<ScoutVoiceDependencies> = {}): ScoutVoiceDependencies {
  return {
    answerScout: vi.fn(async () => new Response(JSON.stringify({
      data: { answer: { reply: 'I found a current deal for you.' } },
    }), { headers: { 'content-type': 'application/json' } })),
    fetchFish: vi.fn(async () => new Response(new Uint8Array([73, 68, 51]), {
      headers: { 'content-type': 'audio/mpeg' },
    })),
    fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: 'Yes. This television supports Netflix.',
          annotations: [{
            type: 'url_citation',
            title: 'Manufacturer specifications',
            url: 'https://manufacturer.test/tv',
          }],
        }],
      }],
    }))),
    getSession: vi.fn(async () => ({
      account: {
        countryCode: 'ZA',
        currencyCode: 'ZAR',
        id: 'member-1',
        planId: 'scout' as const,
        planStatus: 'active',
      },
      isAuthenticated: true,
    })),
    incrementUsage: vi.fn(async () => 1),
    runDeepSeek: vi.fn(async () =>
      'I could not verify Netflix support from the supplied product facts.'),
    ...overrides,
  }
}

const env = {
  AI: {} as Ai,
  DB: {} as D1Database,
  FISH_AUDIO_API_KEY: 'fish-test-key',
  OPENAI_API_KEY: 'openai-test-key',
}

describe('handleScoutVoice', () => {
  it('reuses Mr Scout chat for paid members and synthesizes with S2.1 Pro Free', async () => {
    const deps = dependencies()
    const response = await handleScoutVoice({
      env,
      request: request({ question: 'What should I buy?', surface: 'scout' }),
    }, deps)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        answer: 'I found a current deal for you.',
        audioBase64: 'SUQz',
        mediaType: 'audio/mpeg',
        model: 's2.1-pro-free',
      },
    })
    expect(deps.answerScout).toHaveBeenCalledOnce()
    const fishRequest = vi.mocked(deps.fetchFish).mock.calls[0][0]
    expect(fishRequest.headers.get('model')).toBe('s2.1-pro-free')
    expect(fishRequest.headers.get('authorization')).toBe('Bearer fish-test-key')
    expect(await fishRequest.clone().json()).toMatchObject({
      text: 'I found a current deal for you.',
      format: 'mp3',
    })
  })

  it('blocks Free members from the Mr Scout voice surface before any provider call', async () => {
    const deps = dependencies({
      getSession: vi.fn(async () => ({
        account: { id: 'free-member', planId: 'free' as const, planStatus: 'active' },
        isAuthenticated: true,
      })),
    })
    const response = await handleScoutVoice({
      env,
      request: request({ question: 'Find coffee', surface: 'scout' }),
    }, deps)

    expect(response.status).toBe(403)
    expect(deps.answerScout).not.toHaveBeenCalled()
    expect(deps.fetchFish).not.toHaveBeenCalled()
  })

  it('answers a showcased product with optional web search and returns citations', async () => {
    const deps = dependencies()
    const response = await handleScoutVoice({
      env,
      request: request({
        question: 'Does it have Netflix?',
        surface: 'showcase',
        product: {
          title: 'Samsung 65 inch television',
          retailerName: 'Example Store',
          priceText: 'R12 999',
          productUrl: 'https://retailer.test/tv',
        },
      }),
    }, deps)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        answer: 'Yes. This television supports Netflix.',
        sources: [{
          title: 'Manufacturer specifications',
          url: 'https://manufacturer.test/tv',
        }],
      },
    })
    expect(deps.incrementUsage).toHaveBeenCalledWith(expect.anything(), 'member-1')
    const modelRequest = vi.mocked(deps.fetchOpenAI).mock.calls[0][0]
    const body = await modelRequest.clone().json() as {
      model: string
      tools: Array<{ type: string }>
      tool_choice: string
    }
    expect(body).toMatchObject({
      model: 'gpt-5.6-sol',
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
    })
  })

  it('uses DeepSeek when OpenAI reports exhausted credits', async () => {
    const deps = dependencies({
      fetchOpenAI: vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'insufficient_quota', message: 'Credit balance is empty.' },
      }), { status: 429 })),
      runDeepSeek: vi.fn(async () =>
        'The supplied product facts do not confirm Netflix support.'),
    })
    const response = await handleScoutVoice({
      env,
      request: request({
        question: 'Does it have Netflix?',
        surface: 'showcase',
        product: product(),
      }),
    }, deps)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      data: {
        answer: 'The supplied product facts do not confirm Netflix support.',
        sources: [],
      },
    })
    expect(deps.runDeepSeek).toHaveBeenCalledOnce()
    expect(await vi.mocked(deps.fetchFish).mock.calls[0][0].clone().json())
      .toMatchObject({ text: 'The supplied product facts do not confirm Netflix support.' })
  })

  it('requires a signed-in account and both server-side provider keys', async () => {
    const signedOut = dependencies({
      getSession: vi.fn(async () => ({ isAuthenticated: false })),
    })
    const unauthorized = await handleScoutVoice({
      env,
      request: request({ question: 'Hello', surface: 'showcase', product: product() }),
    }, signedOut)
    expect(unauthorized.status).toBe(401)

    const unconfigured = await handleScoutVoice({
      env: { DB: {} as D1Database, OPENAI_API_KEY: 'openai-test-key' },
      request: request({ question: 'Hello', surface: 'showcase', product: product() }),
    }, dependencies())
    expect(unconfigured.status).toBe(503)
  })
})

describe('extractOpenAIAnswer', () => {
  it('rejects an empty response instead of speaking invented filler', () => {
    expect(() => extractOpenAIAnswer({ output: [] })).toThrow('Missing answer')
  })
})

function request(body: Record<string, unknown>): Request {
  return new Request('https://example.test/api/scout-voice', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', cookie: 'ts_member_session=test' },
    method: 'POST',
  })
}

function product() {
  return { retailerName: 'Store', title: 'Television' }
}
