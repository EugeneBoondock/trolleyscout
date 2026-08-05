import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CoverageLedger } from '../types'
import { CoverageView } from './CoverageView'

afterEach(cleanup)

const coverage: CoverageLedger = {
  generatedAt: '2026-08-01T08:00:00.000Z',
  markets: [{
    activeCatalogueCount: 321,
    activeCatalogueRetailerCount: 103,
    activeDealCount: 182,
    activeDealRetailerCount: 9,
    code: 'ZA',
    discoveredStoreCount: 241,
    flag: '🇿🇦',
    freshness: 'live',
    lastDealCapturedAt: '2026-08-01T07:45:00.000Z',
    name: 'South Africa',
    officialSourceCount: 32,
    retailerCount: 17,
    storesWithPromotionsCount: 88,
  }],
  summary: {
    activeCatalogueCount: 321,
    activeDealCount: 182,
    activeMarketCount: 1,
    discoveredStoreCount: 241,
    liveMarketCount: 1,
    officialSourceCount: 32,
    retailerCount: 17,
  },
}

describe('CoverageView', () => {
  it('shows exact ledger totals and market freshness', () => {
    render(<CoverageView coverage={coverage} />)

    expect(screen.getByRole('heading', { name: 'Coverage you can inspect' })).toBeTruthy()
    expect(screen.getByText('South Africa')).toBeTruthy()
    expect(screen.getByText('Activity checked within 24 hours')).toBeTruthy()
    expect(screen.getAllByText('182')).toHaveLength(2)
    expect(screen.getAllByText('241')).toHaveLength(2)
    expect(screen.getAllByText('321')).toHaveLength(2)
  })

  it('does not invent markets when the ledger is empty', () => {
    render(<CoverageView coverage={{ ...coverage, markets: [], summary: {
      activeCatalogueCount: 0,
      activeDealCount: 0,
      activeMarketCount: 0,
      discoveredStoreCount: 0,
      liveMarketCount: 0,
      officialSourceCount: 0,
      retailerCount: 0,
    } }} />)

    expect(screen.getByText('The first verified market is being prepared.')).toBeTruthy()
  })
})
