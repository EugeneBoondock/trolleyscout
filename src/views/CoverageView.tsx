import {
  ArrowClockwise,
  BookOpen,
  CheckCircle,
  GlobeHemisphereWest,
  MapPin,
  Storefront,
  Tag,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { loadCoverage } from '../services/apiClient'
import type { CoverageFreshness, CoverageLedger } from '../types'
import './CoverageView.css'

const FRESHNESS_COPY: Record<CoverageFreshness, { label: string; detail: string }> = {
  live: { label: 'Live', detail: 'Activity checked within 24 hours' },
  recent: { label: 'Recent', detail: 'Activity checked within 7 days' },
  building: { label: 'Building', detail: 'Directory available, with live activity still growing' },
}

export function CoverageView({ coverage: suppliedCoverage }: { coverage?: CoverageLedger }) {
  const [coverage, setCoverage] = useState<CoverageLedger | undefined>(suppliedCoverage)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(!suppliedCoverage)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (suppliedCoverage) return
    setLoading(true)
    setError(undefined)
    try {
      setCoverage(await loadCoverage(signal))
    } catch (reason) {
      if (signal?.aborted) return
      setError(reason instanceof Error ? reason.message : 'Coverage could not be loaded.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [suppliedCoverage])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  return (
    <section className="coverage-view" aria-busy={loading} aria-labelledby="coverage-title">
      <header className="coverage-hero">
        <div>
          <p className="eyebrow">Proof, not promises</p>
          <h1 id="coverage-title">Coverage you can inspect</h1>
          <p>
            See where Trolley Scout has retailer sources, current catalogues, store locations and active deals.
            Every figure comes from the current source, catalogue and deal indexes.
          </p>
        </div>
        <GlobeHemisphereWest aria-hidden="true" size={52} weight="duotone" />
      </header>

      {error && !coverage ? (
        <div className="coverage-message" role="alert">
          <strong>Coverage is temporarily unavailable.</strong>
          <span>{error}</span>
          <button className="secondary-button" onClick={() => void refresh()} type="button">
            <ArrowClockwise size={18} /> Try again
          </button>
        </div>
      ) : null}

      {loading && !coverage ? (
        <div className="coverage-message" role="status">Checking the live coverage ledger.</div>
      ) : null}

      {coverage ? (
        <>
          <div className="coverage-summary" aria-label="Coverage totals">
            <CoverageMetric icon={<GlobeHemisphereWest size={22} />} label="Active markets" value={coverage.summary.activeMarketCount} />
            <CoverageMetric icon={<Storefront size={22} />} label="Retailers listed" value={coverage.summary.retailerCount} />
            <CoverageMetric icon={<CheckCircle size={22} />} label="Official source links" value={coverage.summary.officialSourceCount} />
            <CoverageMetric icon={<MapPin size={22} />} label="Stores mapped" value={coverage.summary.discoveredStoreCount} />
            <CoverageMetric icon={<BookOpen size={22} />} label="Current catalogues" value={coverage.summary.activeCatalogueCount} />
            <CoverageMetric icon={<Tag size={22} />} label="Active deals" value={coverage.summary.activeDealCount} />
          </div>

          <div className="coverage-board">
            <div className="coverage-board-heading">
              <div>
                <p className="eyebrow">Market ledger</p>
                <h2>What is available right now</h2>
              </div>
              <p>Updated {formatDateTime(coverage.generatedAt)}</p>
            </div>

            {coverage.markets.length === 0 ? (
              <div className="coverage-message">The first verified market is being prepared.</div>
            ) : (
              <div className="coverage-market-grid">
                {coverage.markets.map((market) => {
                  const status = FRESHNESS_COPY[market.freshness]
                  const lastActivity = latestDate(
                    market.lastDealCapturedAt,
                    market.directoryCheckedAt,
                    market.catalogueCheckedAt,
                  )
                  return (
                    <article className="coverage-market-card" key={market.code}>
                      <div className="coverage-market-title">
                        <span className="coverage-flag" aria-hidden="true">{market.flag}</span>
                        <div>
                          <h3>{market.name}</h3>
                          <span className={`coverage-status is-${market.freshness}`}>
                            <span aria-hidden="true" /> {status.label}
                          </span>
                        </div>
                      </div>
                      <p className="coverage-status-detail">{status.detail}</p>
                      <dl className="coverage-market-stats">
                        <Stat label="Retailers" value={market.retailerCount} />
                        <Stat label="Official sources" value={market.officialSourceCount} />
                        <Stat label="Stores mapped" value={market.discoveredStoreCount} />
                        <Stat label="Stores with offers" value={market.storesWithPromotionsCount} />
                        <Stat label="Current catalogues" value={market.activeCatalogueCount} />
                        <Stat label="Catalogue retailers" value={market.activeCatalogueRetailerCount} />
                        <Stat label="Active deals" value={market.activeDealCount} />
                        <Stat label="Deal retailers" value={market.activeDealRetailerCount} />
                      </dl>
                      <p className="coverage-last-check">
                        {lastActivity
                          ? `Latest directory, catalogue or deal activity: ${formatDateTime(lastActivity)}`
                          : 'Official directory listed. Live catalogue and deal checks are still being added.'}
                      </p>
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="coverage-note">
            <CheckCircle aria-hidden="true" size={26} weight="duotone" />
            <div>
              <strong>Counts can move as retailers publish or remove offers.</strong>
              <p>We show zero when a measure has no current evidence. We do not fill gaps with estimates.</p>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  )
}

function CoverageMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="coverage-metric">
      {icon}
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value.toLocaleString()}</dd>
    </div>
  )
}

function latestDate(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}

function formatDateTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'time pending'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}
