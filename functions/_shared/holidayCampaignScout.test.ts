import { describe, expect, it, vi } from 'vitest'
import {
  buildHolidayCampaignPlan,
  campaignMatchesSearchResult,
  robotsTextAllowsPath,
  runHolidayCampaignScout,
} from './holidayCampaignScout'

describe('holiday campaign planning', () => {
  it('scouts a nearby South African public holiday before it starts', () => {
    const plan = buildHolidayCampaignPlan(
      new Date('2026-08-03T08:00:00.000Z'),
      [{ date: '2026-08-09', name: 'National Women’s Day' }],
    )

    const campaign = plan.find((entry) => entry.title === 'National Women’s Day')
    expect(campaign).toMatchObject({
      cadenceMs: 3 * 60 * 60 * 1000,
      startsOn: '2026-08-09',
    })
    expect(campaign?.queries).toContain(
      '"Women’s Day" deals specials South Africa',
    )
  })

  it('gives Black Friday a wide category query pack and hourly final fortnight', () => {
    const early = buildHolidayCampaignPlan(
      new Date('2026-09-30T08:00:00.000Z'),
      [],
    ).find((entry) => entry.id === 'black-friday-2026')
    const close = buildHolidayCampaignPlan(
      new Date('2026-11-20T08:00:00.000Z'),
      [],
    ).find((entry) => entry.id === 'black-friday-2026')

    expect(early?.queries.length).toBeGreaterThanOrEqual(10)
    expect(early?.cadenceMs).toBe(3 * 60 * 60 * 1000)
    expect(close?.cadenceMs).toBe(60 * 60 * 1000)
    expect(early?.queries).toContain(
      'Black Friday South Africa travel flights hotel deals',
    )
  })
})

describe('holiday campaign source admission', () => {
  const campaign = {
    aliases: ['women s day'],
    cadenceMs: 1,
    endsOn: '2026-08-09',
    id: 'holiday-2026-08-09-women-s-day',
    queries: [],
    startsOn: '2026-08-09',
    title: 'National Women’s Day',
  }

  it('accepts a current official South African campaign page', () => {
    expect(campaignMatchesSearchResult({
      title: 'Women’s Day Deals | adidas ZA',
      url: 'https://www.adidas.co.za/women-womens-day',
    }, campaign)).toBe(true)
  })

  it('rejects stale, marketplace and unrelated results', () => {
    expect(campaignMatchesSearchResult({
      title: 'Women’s Day Deals 2025 | adidas ZA',
      url: 'https://www.adidas.co.za/women-womens-day-2025',
    }, campaign)).toBe(false)
    expect(campaignMatchesSearchResult({
      title: 'Women’s Day Deals',
      url: 'https://hyperli.com/collections/womens-day',
    }, campaign)).toBe(false)
    expect(campaignMatchesSearchResult({
      title: 'Every weekly catalogue',
      url: 'https://specialstoday.co.za/',
    }, campaign)).toBe(false)
  })

  it('honours the most specific robots rule', () => {
    const robots = `
      User-agent: *
      Disallow: /women
      Allow: /women-womens-day
    `
    expect(robotsTextAllowsPath(robots, '/women-womens-day')).toBe(true)
    expect(robotsTextAllowsPath(robots, '/women/shoes')).toBe(false)
  })
})

describe('runHolidayCampaignScout', () => {
  it('adds a newly discovered official retailer and offers its exact campaign page', async () => {
    const scoutStores = vi.fn(async () => undefined)
    const mergeRetailers = vi.fn(async (_env, _country, retailers) => retailers)
    const markRun = vi.fn(async () => undefined)

    const result = await runHolidayCampaignScout(
      { DB: {} as D1Database },
      vi.fn() as unknown as typeof fetch,
      {
        isDue: async () => true,
        markRun,
        mergeRetailers,
        now: () => new Date('2026-08-03T08:00:00.000Z'),
        readHolidays: async () => [
          { date: '2026-08-09', name: 'National Women’s Day' },
        ],
        robotsAllows: async () => true,
        savePromotions: async () => true,
        scoutStores,
        search: async (query) => ({
          results: query.toLowerCase().includes('women')
            ? [{
                title: 'Women’s Day Deals | adidas ZA',
                url: 'https://www.adidas.co.za/women-womens-day',
              }]
            : [],
          status: 'success',
        }),
      },
    )

    expect(result.discoveredRetailerCount).toBe(1)
    expect(result.offeredStoreCount).toBe(1)
    expect(mergeRetailers).toHaveBeenCalled()
    expect(scoutStores).toHaveBeenCalledWith(
      expect.anything(),
      [expect.objectContaining({
        name: 'Adidas',
        sourceCategory: 'holiday-campaign',
        website: 'https://www.adidas.co.za/women-womens-day',
      })],
      Date.parse('2026-08-03T08:00:00.000Z'),
      1,
      expect.any(Number),
    )
    expect(markRun).toHaveBeenCalled()
  })
})
