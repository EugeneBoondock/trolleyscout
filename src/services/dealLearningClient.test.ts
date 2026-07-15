import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDealLearningHistory,
  loadDealLearning,
  recordDealLearningActivity,
  setDealLearningEnabled,
} from './dealLearningClient'

function response(enabled: boolean, activityCount: number) {
  return new Response(
    JSON.stringify({
      data: {
        learning: {
          activities: Array.from({ length: activityCount }, (_, index) => ({
            createdAt: '2026-07-15T00:00:00.000Z',
            eventType: 'search_submitted',
            id: `activity-${index}`,
            term: 'coffee',
          })),
          enabled,
        },
      },
      meta: {
        generatedAt: '2026-07-15T00:00:00.000Z',
        source: 'cloudflare-pages',
      },
    }),
    { headers: { 'content-type': 'application/json' }, status: 200 },
  )
}

describe('dealLearningClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads and records signed-in learning activity', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(true, 0))
      .mockResolvedValueOnce(response(true, 1))
    vi.stubGlobal('fetch', fetcher)

    await expect(loadDealLearning()).resolves.toMatchObject({ enabled: true })
    await expect(
      recordDealLearningActivity({ eventType: 'search_submitted', term: 'coffee' }),
    ).resolves.toMatchObject({ activities: [{ term: 'coffee' }] })
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/activity',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('pauses learning and clears its history', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(false, 1))
      .mockResolvedValueOnce(response(false, 0))
    vi.stubGlobal('fetch', fetcher)

    await expect(setDealLearningEnabled(false)).resolves.toMatchObject({ enabled: false })
    await expect(clearDealLearningHistory()).resolves.toMatchObject({ activities: [] })
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      '/api/activity',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      '/api/activity',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
