import { describe, expect, it, vi } from 'vitest'

import {
  buildStoreCoverageSeedBatch,
  GLOBAL_STORE_COVERAGE_POINTS,
  seedStoreCoverage,
  SOUTH_AFRICA_STORE_COVERAGE_POINTS,
} from './storeCoverageSeed'

describe('scheduled store coverage seed', () => {
  it('moves through three South African hubs and one supported global market per run', () => {
    const firstRun = Date.parse('2026-08-02T00:00:00.000Z')
    const first = buildStoreCoverageSeedBatch(firstRun)
    const second = buildStoreCoverageSeedBatch(firstRun + 3 * 60 * 60 * 1000)

    expect(first).toHaveLength(4)
    expect(first.filter((point) => point.countryCode === 'ZA')).toHaveLength(3)
    expect(first.filter((point) => point.countryCode !== 'ZA')).toHaveLength(1)
    expect(second.map((point) => point.label)).not.toEqual(first.map((point) => point.label))
    expect(SOUTH_AFRICA_STORE_COVERAGE_POINTS.length).toBeGreaterThan(50)
    expect(new Set(GLOBAL_STORE_COVERAGE_POINTS.map((point) => point.countryCode))).toEqual(
      new Set([
        'AE', 'AO', 'AR', 'AT', 'BW', 'CA', 'CD', 'GB', 'KE', 'KM', 'LS',
        'MG', 'MU', 'MW', 'MZ', 'NA', 'NL', 'NZ', 'SA', 'SC', 'SZ', 'TZ',
        'US', 'ZM', 'ZW',
      ]),
    )
  })

  it('uses the public Near me path and reports each bounded result', async () => {
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input)
      expect(url.pathname).toBe('/api/nearby-stores')
      expect(url.searchParams.get('radius')).toBe('15000')
      expect(url.searchParams.get('country')).toMatch(/^[A-Z]{2}$/)
      return Response.json({ stores: [{ placeId: 'one' }, { placeId: 'two' }] })
    })

    const result = await seedStoreCoverage(
      { SCOUT_ORIGIN: 'https://trolleyscout.co.za' },
      fetcher,
      Date.parse('2026-08-02T00:00:00.000Z'),
    )

    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(result).toEqual({
      candidateStoreCount: 8,
      failedPointCount: 0,
      pointCount: 4,
    })
  })

  it('skips an absent or unsafe origin without making requests', async () => {
    const fetcher = vi.fn()
    expect(await seedStoreCoverage({}, fetcher, 0)).toEqual({
      candidateStoreCount: 0,
      failedPointCount: 0,
      pointCount: 0,
    })
    expect(await seedStoreCoverage(
      { SCOUT_ORIGIN: 'http://trolleyscout.co.za' },
      fetcher,
      0,
    )).toEqual({
      candidateStoreCount: 0,
      failedPointCount: 0,
      pointCount: 0,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
