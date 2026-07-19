import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dealSitesNeedRefresh: vi.fn(),
  readDealSiteFeed: vi.fn(),
  refreshDealSites: vi.fn(),
}))

vi.mock('../_shared/dealSiteScout', () => ({
  dealSitesNeedRefresh: mocks.dealSitesNeedRefresh,
  readDealSiteFeed: mocks.readDealSiteFeed,
  refreshDealSites: mocks.refreshDealSites,
}))

import { onRequest } from './deal-sites'

describe('/api/deal-sites', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.dealSitesNeedRefresh.mockResolvedValue(false)
    mocks.refreshDealSites.mockResolvedValue(undefined)
  })

  it('refreshes inline and disables caching for an explicit refresh', async () => {
    mocks.dealSitesNeedRefresh.mockResolvedValue(true)
    mocks.readDealSiteFeed
      .mockResolvedValueOnce(feed('old-deal'))
      .mockResolvedValueOnce(feed('fresh-deal'))
    const waitUntil = vi.fn()

    const response = await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      waitUntil,
    )
    const envelope = await response.json() as {
      data: { deals: Array<{ id: string }> }
    }

    expect(mocks.refreshDealSites).toHaveBeenCalledTimes(1)
    expect(mocks.readDealSiteFeed).toHaveBeenCalledTimes(2)
    expect(envelope.data.deals.map((deal) => deal.id)).toEqual(['fresh-deal'])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('keeps the cached feed when an explicit refresh fails', async () => {
    mocks.dealSitesNeedRefresh.mockResolvedValue(true)
    mocks.readDealSiteFeed.mockResolvedValue(feed('cached-deal'))
    mocks.refreshDealSites.mockRejectedValue(new Error('upstream unavailable'))

    const response = await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
    )
    const envelope = await response.json() as {
      data: { deals: Array<{ id: string }> }
    }

    expect(response.status).toBe(200)
    expect(envelope.data.deals.map((deal) => deal.id)).toEqual(['cached-deal'])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('refreshes upstream even when the stored feed is recent', async () => {
    mocks.readDealSiteFeed
      .mockResolvedValueOnce(feed('recent-deal'))
      .mockResolvedValueOnce(feed('new-deal'))

    const response = await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
    )
    const envelope = await response.json() as {
      data: { deals: Array<{ id: string }> }
    }

    expect(response.status).toBe(200)
    expect(mocks.refreshDealSites).toHaveBeenCalledTimes(1)
    expect(mocks.readDealSiteFeed).toHaveBeenCalledTimes(2)
    expect(mocks.dealSitesNeedRefresh).not.toHaveBeenCalled()
    expect(envelope.data.deals.map((deal) => deal.id)).toEqual(['new-deal'])
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('keeps concurrent refresh work scoped to each Worker request', async () => {
    mocks.readDealSiteFeed.mockResolvedValue(feed('cached-deal'))
    mocks.refreshDealSites.mockResolvedValue(undefined)

    const first = invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
    )
    const second = invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
    )

    await Promise.all([first, second])
    expect(mocks.refreshDealSites).toHaveBeenCalledTimes(2)
  })

  it('uses the durable lease to back off after a failed refresh attempt', async () => {
    mocks.readDealSiteFeed.mockResolvedValue(feed('cached-deal'))
    mocks.refreshDealSites.mockRejectedValue(new Error('upstream unavailable'))
    const env = refreshLeaseEnv()

    await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
      env,
    )
    await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites?refresh=1'),
      vi.fn(),
      env,
    )

    expect(mocks.refreshDealSites).toHaveBeenCalledTimes(1)
  })

  it('keeps normal populated reads cached and refreshes stale data in background', async () => {
    mocks.readDealSiteFeed.mockResolvedValue(feed('cached-deal'))
    mocks.dealSitesNeedRefresh.mockResolvedValue(true)
    const waitUntil = vi.fn()

    const response = await invoke(
      new Request('https://trolleyscout.co.za/api/deal-sites'),
      waitUntil,
    )

    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })
})

function feed(id: string) {
  return {
    deals: [{ id }],
    refreshedAt: '2026-07-19T10:00:00.000Z',
    sources: [],
  }
}

function invoke(
  request: Request,
  waitUntil: ReturnType<typeof vi.fn>,
  env: unknown = { DB: {} },
) {
  return onRequest({
    env,
    request,
    waitUntil,
  } as never)
}

function refreshLeaseEnv() {
  let lastAttemptAt: number | undefined
  let leaseToken: string | undefined
  let leaseUntil: number | undefined

  return {
    DB: {
      prepare(sql: string) {
        let bindings: unknown[] = []
        return {
          bind(...values: unknown[]) {
            bindings = values
            return this
          },
          async run() {
            if (sql.includes('SET last_attempt_at')) {
              const [now, token, until, current, cutoff] = bindings as [
                number,
                string,
                number,
                number,
                number,
              ]
              const leaseFree = leaseUntil === undefined || leaseUntil <= current
              const backedOff = lastAttemptAt !== undefined && lastAttemptAt > cutoff
              if (!leaseFree || backedOff) return { meta: { changes: 0 } }
              lastAttemptAt = now
              leaseToken = token
              leaseUntil = until
              return { meta: { changes: 1 } }
            }
            if (sql.includes('SET lease_token = NULL') && bindings[0] === leaseToken) {
              leaseToken = undefined
              leaseUntil = undefined
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 0 } }
          },
        }
      },
    },
  }
}
