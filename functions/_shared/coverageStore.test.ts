import { describe, expect, it } from 'vitest'
import { readCoverageLedger } from './coverageStore'

describe('coverage ledger', () => {
  it('publishes real market totals and freshness without inventing coverage', async () => {
    const db = new CoverageDb()
    const ledger = await readCoverageLedger({ DB: db as never }, '2026-08-01T12:00:00.000Z')

    expect(ledger.markets.find((market) => market.code === 'BW')).toMatchObject({
      activeCatalogueCount: 2,
      activeCatalogueRetailerCount: 2,
      activeDealCount: 12,
      activeDealRetailerCount: 2,
      discoveredStoreCount: 4,
      freshness: 'live',
      officialSourceCount: 3,
      retailerCount: 2,
    })
    expect(ledger.summary.activeDealCount).toBe(12)
    expect(ledger.summary.activeCatalogueCount).toBe(2)
    expect(ledger.summary.discoveredStoreCount).toBe(4)
    expect(ledger.markets.find((market) => market.code === 'ZA')?.retailerCount).toBeGreaterThan(0)
  })

  it('still publishes the verified South African directory without a database', async () => {
    const ledger = await readCoverageLedger({}, '2026-08-01T12:00:00.000Z')
    expect(ledger.markets).toHaveLength(1)
    expect(ledger.markets[0]).toMatchObject({ code: 'ZA', freshness: 'building' })
  })

  it('counts the same usable catalogue inventory shoppers receive', async () => {
    const ledger = await readCoverageLedger(
      { DB: new DuplicateCatalogueDb() as never },
      '2026-08-01T12:00:00.000Z',
    )

    expect(ledger.markets.find((market) => market.code === 'BW')).toMatchObject({
      activeCatalogueCount: 1,
      activeCatalogueRetailerCount: 1,
    })
  })
})

class CoverageDb {
  prepare(sql: string) {
    return {
      bind: (..._values: unknown[]) => ({
        all: async () => ({ results: this.rows(sql) }),
      }),
    }
  }

  private rows(sql: string) {
    if (sql.includes('country_retailer_cache')) {
      return [{
        checked_at: '2026-08-01T10:00:00.000Z',
        country_code: 'BW',
        retailers_json: JSON.stringify([
          { id: 'choppies', name: 'Choppies', sources: [{ kind: 'specials', label: 'Specials', url: 'https://example.com' }] },
          { id: 'spar', name: 'SPAR', sources: [{ kind: 'specials', label: 'Deals', url: 'https://example.com' }] },
        ]),
        source_count: 3,
      }]
    }
    if (sql.includes('FROM discovered_stores')) {
      return [{ country_code: 'BW', store_count: 4, with_promotions_count: 2 }]
    }
    if (sql.includes('FROM deal_items')) {
      return [{
        country_code: 'BW',
        deal_count: 12,
        last_captured_at: '2026-08-01T11:00:00.000Z',
        retailer_count: 2,
      }]
    }
    if (sql.includes("source_key = '__leaflets__'")) {
      return [{
        checked_at: '2026-08-01T11:30:00.000Z',
        deals_json: JSON.stringify([
          {
            capturedAt: '2026-08-01T11:30:00.000Z',
            countryCode: 'BW',
            documentUrl: 'https://example.com/choppies.pdf',
            id: 'choppies-1',
            name: 'Weekend offers',
            retailerId: 'choppies',
            retailerName: 'Choppies',
            url: 'https://example.com/choppies',
            validFrom: '2026-08-01',
            validTo: '2026-08-07',
          },
          {
            capturedAt: '2026-08-01T11:30:00.000Z',
            countryCode: 'BW',
            documentUrl: 'https://example.com/spar.pdf',
            id: 'spar-1',
            name: 'Monthly offers',
            retailerId: 'spar',
            retailerName: 'SPAR',
            url: 'https://example.com/spar',
            validTo: '2026-08-31',
          },
          {
            capturedAt: '2026-07-01T11:30:00.000Z',
            countryCode: 'ZA',
            documentUrl: 'https://example.com/expired.pdf',
            id: 'expired-1',
            name: 'Expired offers',
            retailerId: 'expired',
            retailerName: 'Expired',
            url: 'https://example.com/expired',
            validTo: '2026-07-31',
          },
        ]),
      }]
    }
    return []
  }
}

class DuplicateCatalogueDb extends CoverageDb {
  prepare(sql: string) {
    if (!sql.includes("source_key = '__leaflets__'")) return super.prepare(sql)
    return {
      bind: (..._values: unknown[]) => ({
        all: async () => ({
          results: [{
            checked_at: '2026-08-01T11:30:00.000Z',
            deals_json: JSON.stringify([
              {
                capturedAt: '2026-08-01T11:30:00.000Z',
                countryCode: 'BW',
                documentUrl: 'https://example.com/choppies-week.pdf',
                id: 'choppies-primary',
                name: 'Weekly specials',
                retailerId: 'choppies',
                retailerName: 'Choppies',
                sourceLabel: 'Latest Specials',
                url: 'https://example.com/choppies-primary',
                validFrom: '2026-08-01',
                validTo: '2026-08-07',
              },
              {
                capturedAt: '2026-08-01T11:30:00.000Z',
                countryCode: 'BW',
                documentUrl: 'https://mirror.example.com/choppies-week.pdf',
                id: 'choppies-mirror',
                name: 'Weekly catalogue',
                retailerId: 'choppies',
                retailerName: 'Choppies',
                sourceLabel: 'Guzzle',
                url: 'https://mirror.example.com/choppies-mirror',
                validFrom: '2026-08-01',
                validTo: '2026-08-07',
              },
            ]),
          }],
        }),
      }),
    }
  }
}
