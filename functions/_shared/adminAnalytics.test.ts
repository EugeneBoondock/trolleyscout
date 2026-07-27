import { describe, expect, it, vi } from 'vitest'
import {
  clampAnalyticsDays,
  getCloudflareTraffic,
  hasCloudflareAnalytics,
} from './adminAnalytics'
import type { TrolleyScoutEnv } from './env'

const configured: TrolleyScoutEnv = {
  CLOUDFLARE_ANALYTICS_TOKEN: 'token',
  CLOUDFLARE_ZONE_ID: 'zone',
}

describe('analytics window', () => {
  it('defaults to 30 days and keeps a request inside 1 to 90', () => {
    expect(clampAnalyticsDays(undefined)).toBe(30)
    expect(clampAnalyticsDays('not a number')).toBe(30)
    expect(clampAnalyticsDays('7')).toBe(7)
    expect(clampAnalyticsDays(0)).toBe(1)
    expect(clampAnalyticsDays(365)).toBe(90)
  })
})

describe('cloudflare traffic', () => {
  it('says it is not connected, with the setup steps, when no token is set', async () => {
    expect(hasCloudflareAnalytics({})).toBe(false)

    const report = await getCloudflareTraffic({}, 7)

    expect(report.configured).toBe(false)
    expect(report.issue).toContain('CLOUDFLARE_ANALYTICS_TOKEN')
    expect(report.days).toEqual([])
  })

  it('fills every day in the window so a quiet day is a zero, not a gap', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              zones: [
                {
                  httpRequests1dGroups: [
                    {
                      dimensions: { date: today },
                      sum: { requests: 120, pageViews: 90, bytes: 4096 },
                      uniq: { uniques: 40 },
                    },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200 },
      ),
    )

    const report = await getCloudflareTraffic(configured, 3)
    vi.restoreAllMocks()

    expect(report.configured).toBe(true)
    expect(report.days).toHaveLength(3)
    expect(report.days[0].requests).toBe(0)
    expect(report.days[2]).toMatchObject({ date: today, pageViews: 90, requests: 120, uniques: 40 })
    expect(report.totals).toMatchObject({ pageViews: 90, requests: 120, uniques: 40 })
  })

  it('reports a rejected query as an issue rather than as empty traffic', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'zone not found' }] }), { status: 200 }),
    )

    const report = await getCloudflareTraffic(configured, 3)
    vi.restoreAllMocks()

    expect(report.configured).toBe(true)
    expect(report.issue).toBe('zone not found')
  })

  it('survives an unreachable Cloudflare', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    const report = await getCloudflareTraffic(configured, 3)
    vi.restoreAllMocks()

    expect(report.configured).toBe(true)
    expect(report.issue).toContain('could not be reached')
  })

  it('names the permission to fix when Cloudflare refuses the token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 403 }))

    const report = await getCloudflareTraffic(configured, 3)
    vi.restoreAllMocks()

    expect(report.issue).toContain('403')
  })
})
