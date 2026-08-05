import { describe, expect, it } from 'vitest'
import type { DiscoveredDeal } from '../types'
import {
  buildRetailSeasons,
  matchesRetailSeason,
  retailSeasonMatchCount,
  southAfricanRetailHolidayFallback,
} from './retailSeasons'

const deal = (title: string, evidenceText = ''): DiscoveredDeal => ({
  capturedAt: '2026-08-02T00:00:00Z',
  evidenceText,
  id: title,
  productUrl: 'https://shop.example/deal',
  retailerId: 'shop',
  retailerName: 'Example Shop',
  sourceLabel: 'Official specials',
  sourceUrl: 'https://shop.example/specials',
  title,
})

describe('retail shopping calendar', () => {
  it('keeps key South African retail holidays available when the live calendar is down', () => {
    const holidays = southAfricanRetailHolidayFallback(new Date('2026-08-03T12:00:00Z'))

    expect(holidays).toContainEqual({
      date: '2026-08-09',
      name: 'National Women’s Day',
    })
    expect(holidays.some((holiday) => holiday.date === '2026-09-24')).toBe(true)
  })

  it('hides dated events beyond 60 days and keeps year-round discovery lanes', () => {
    const seasons = buildRetailSeasons('ZA', new Date('2026-08-02T12:00:00Z'))

    expect(seasons.map((season) => season.id)).not.toContain('black-friday-2026')
    expect(seasons.map((season) => season.id)).toContain('travel-deals')
    expect(seasons.map((season) => season.id)).toContain('student-offers')
  })

  it('shows a dated event once it reaches the 60-day horizon', () => {
    const seasons = buildRetailSeasons('ZA', new Date('2026-09-28T12:00:00Z'))
    const blackFriday = seasons.find((season) => season.id === 'black-friday-2026')

    expect(blackFriday?.timingLabel).toBe('Starts in 60 days')
  })

  it('uses southern and northern back-to-school windows', () => {
    const south = buildRetailSeasons('ZA', new Date('2026-12-01T12:00:00Z'))
    const north = buildRetailSeasons('GB', new Date('2026-08-02T12:00:00Z'))

    expect(south.find((season) => season.id.startsWith('back-to-school'))?.status).toBe('active')
    expect(north.find((season) => season.id.startsWith('back-to-school'))?.status).toBe('active')
  })

  it('computes Easter and keeps the event active on Easter Sunday', () => {
    const seasons = buildRetailSeasons('ZA', new Date('2027-03-28T12:00:00Z'))
    const easter = seasons.find((season) => season.id === 'easter-2027')

    expect(easter?.status).toBe('active')
    expect(easter?.startsOn).toBe('2027-02-11')
  })

  it('adds nearby country holidays and removes Christmas duplicates', () => {
    const seasons = buildRetailSeasons('ZA', new Date('2026-08-02T12:00:00Z'), [
      { date: '2026-08-09', localName: 'National Women’s Day', name: "National Women's Day" },
      { date: '2026-12-25', name: 'Christmas Day' },
    ])

    expect(seasons.some((season) => season.title === 'National Women’s Day')).toBe(true)
    expect(seasons.filter((season) => /christmas/i.test(season.title))).toHaveLength(0)
  })

  it('matches only explicit seasonal language in live deal evidence', () => {
    const seasons = buildRetailSeasons('ZA', new Date('2026-09-28T12:00:00Z'))
    const blackFriday = seasons.find((season) => season.id === 'black-friday-2026')!
    const deals = [
      deal('Black Friday television deal'),
      deal('Television deal', 'Part of the official Cyber Monday sale'),
      deal('Friday television deal'),
    ]

    expect(matchesRetailSeason(deals[0], blackFriday)).toBe(true)
    expect(matchesRetailSeason(deals[2], blackFriday)).toBe(false)
    expect(retailSeasonMatchCount(deals, blackFriday)).toBe(2)
  })

  it('matches flights, accommodation, packages and getaways without broad booking noise', () => {
    const travel = buildRetailSeasons('ZA', new Date('2026-08-02T12:00:00Z'))
      .find((season) => season.id === 'travel-deals')!
    const deals = [
      deal('FlySafair flight special from Johannesburg to Cape Town'),
      deal('Cape Winelands 1-night stay for two'),
      deal('Family holiday package in Durban'),
      deal('Restaurant table booking special'),
    ]

    expect(deals.map((item) => matchesRetailSeason(item, travel))).toEqual([
      true,
      true,
      true,
      false,
    ])
  })
})
