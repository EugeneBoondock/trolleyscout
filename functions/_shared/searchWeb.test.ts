// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchWeb } from './searchWeb'

describe('searchWeb', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the authenticated Jina Search API when DuckDuckGo and its reader return no results', async () => {
    const requests: Array<{ body?: string; headers: Headers; method?: string; url: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push({
        body: typeof init?.body === 'string' ? init.body : undefined,
        headers: new Headers(init?.headers),
        method: init?.method,
        url,
      })

      if (url === 'https://s.jina.ai/') {
        return new Response(JSON.stringify({
          code: 200,
          data: [
            {
              title: 'Property.co.zw | Houses for sale in Harare',
              url: 'https://www.property.co.zw/for-sale/harare',
            },
          ],
          status: 20000,
        }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }

      return new Response('', {
        headers: { 'content-type': 'text/html' },
        status: 200,
      })
    }))

    await expect(searchWeb('property for sale Harare Zimbabwe', 'jina-test-key')).resolves.toEqual([
      {
        title: 'Property.co.zw | Houses for sale in Harare',
        url: 'https://www.property.co.zw/for-sale/harare',
      },
    ])

    const jinaRequest = requests.find((request) => request.url === 'https://s.jina.ai/')
    expect(jinaRequest).toMatchObject({
      body: JSON.stringify({ num: 12, q: 'property for sale Harare Zimbabwe' }),
      method: 'POST',
    })
    expect(jinaRequest?.headers.get('authorization')).toBe('Bearer jina-test-key')
    expect(jinaRequest?.headers.get('x-respond-with')).toBe('no-content')
  })
})
