import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequest } from './retail-calendar'

describe('/api/retail-calendar', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns national public holidays for the requested country and two years', async () => {
    const year = new Date().getUTCFullYear()
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          date: `${year}-08-09`,
          global: true,
          localName: 'National Women’s Day',
          name: "National Women's Day",
          types: ['Public'],
        },
        {
          date: `${year}-09-01`,
          global: false,
          localName: 'Provincial Day',
          name: 'Provincial Day',
          types: ['Public'],
        },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', upstream)

    const response = await onRequest({
      env: {},
      request: new Request('https://trolleyscout.co.za/api/retail-calendar?country=ZA'),
    } as never)
    const envelope = await response.json() as {
      data: {
        country: { code: string }
        holidays: Array<{ date: string; name: string }>
      }
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('s-maxage=86400')
    expect(envelope.data.country.code).toBe('ZA')
    expect(envelope.data.holidays).toEqual([
      { date: `${year}-08-09`, localName: 'National Women’s Day', name: "National Women's Day" },
    ])
    expect(upstream).toHaveBeenNthCalledWith(
      1,
      `https://date.nager.at/api/v3/publicholidays/${year}/ZA`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(upstream).toHaveBeenNthCalledWith(
      2,
      `https://date.nager.at/api/v3/publicholidays/${year + 1}/ZA`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('keeps the offline shopping calendar usable when the holiday provider is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const response = await onRequest({
      env: {},
      request: new Request('https://trolleyscout.co.za/api/retail-calendar?country=ZW'),
    } as never)
    const envelope = await response.json() as {
      data: { country: { code: string }; holidays: unknown[] }
    }

    expect(response.status).toBe(200)
    expect(envelope.data.country.code).toBe('ZW')
    expect(envelope.data.holidays).toEqual([])
  })
})
