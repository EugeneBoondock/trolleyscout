import { useEffect, useState } from 'react'
import { ArrowRight, Clock, LinkSimple, MapPin, NavigationArrow, Storefront, Tag, Trash } from '@phosphor-icons/react'
import {
  loadNearbyStores,
  type NearbyStoresState,
  type NearbyStoreResult,
} from '../services/apiClient'
import {
  loadNearbyHistory,
  removeNearbyHistoryEntry,
  saveNearbyHistorySearch,
  type NearbyHistoryEntry,
} from '../services/nearbyHistory'
import type { StoreLeaflet } from '../types'
import { LeafletViewer } from '../components/LeafletViewer'
import { ScoutMark } from '../components/ScoutMark'

const INITIAL: NearbyStoresState = {
  message: 'Find the supermarkets around you and this week’s specials for each.',
  status: 'idle',
  stores: [],
}

export function NearMeView({
  onViewStoreDeals,
}: {
  onViewStoreDeals?: (store: NearbyStoreResult) => void
}) {
  const [state, setState] = useState<NearbyStoresState>(INITIAL)
  const [openLeaflet, setOpenLeaflet] = useState<StoreLeaflet | undefined>()
  const [history, setHistory] = useState<NearbyHistoryEntry[]>([])
  const [viewingLabel, setViewingLabel] = useState<string>()

  // On first open, restore the most recent search so the page is never blank.
  useEffect(() => {
    const stored = loadNearbyHistory()
    setHistory(stored)
    if (stored.length > 0) {
      const latest = stored[0]
      setState({
        message: `${latest.stores.length} stores from your last search near ${latest.locationLabel}.`,
        status: 'ready',
        stores: latest.stores,
        summary: summariseStores(latest.stores),
      })
      setViewingLabel(latest.locationLabel)
    }
  }, [])

  function showHistoryEntry(entry: NearbyHistoryEntry) {
    setState({
      message: `${entry.stores.length} stores near ${entry.locationLabel}.`,
      status: 'ready',
      stores: entry.stores,
      summary: summariseStores(entry.stores),
    })
    setViewingLabel(entry.locationLabel)
  }

  function removeHistory(id: string) {
    setHistory(removeNearbyHistoryEntry(id))
  }

  function findNearby() {
    if (!('geolocation' in navigator)) {
      setState({ message: 'Your device does not support location.', status: 'error', stores: [] })
      return
    }

    setState({ message: 'Finding your location…', status: 'locating', stores: [] })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({ message: 'Checking stores near you…', status: 'loading', stores: [] })

        loadNearbyStores(position.coords.latitude, position.coords.longitude)
          .then((result) => {
            setState(result)
            if (result.stores.length > 0) {
              const saved = saveNearbyHistorySearch(
                position.coords.latitude,
                position.coords.longitude,
                result.stores,
              )
              setHistory(saved)
              setViewingLabel(saved[0]?.locationLabel)
            }
          })
          .catch(() => {
            setState({ message: 'Store discovery is unavailable.', status: 'error', stores: [] })
          })
      },
      (error) => {
        setState({
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was blocked. Allow location to see stores near you.'
              : 'Could not read your location. Try again.',
          status: 'error',
          stores: [],
        })
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 12000 },
    )
  }

  const isBusy = state.status === 'locating' || state.status === 'loading'

  return (
    <div className="near-me-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Near me</p>
          <h1>Stores around you</h1>
          <p className="section-lede">
            Trolley Scout finds the supermarkets closest to you and pulls this week’s deals and
            catalogues for each. Tap a store to see its deals in Find deals.
          </p>
        </div>
        <button className="primary-button" disabled={isBusy} onClick={findNearby} type="button">
          {isBusy ? <ScoutMark motion="spin" size={20} /> : <NavigationArrow size={18} />}
          {isBusy ? 'Searching' : 'Use my location'}
        </button>
      </section>

      {(isBusy || state.status === 'error' || (state.status === 'idle' && history.length === 0)) && (
        <div className="near-me-hint" role="status">
          {isBusy ? <ScoutMark motion="spin" size={24} /> : <MapPin size={20} />}
          <p>{state.message}</p>
        </div>
      )}

      {history.length > 0 && (
        <section className="near-me-history" aria-label="Past searches">
          <p className="eyebrow">Your searches</p>
          <div className="near-me-history-list">
            {history.map((entry) => (
              <div
                className={`near-me-history-chip${viewingLabel === entry.locationLabel ? ' is-active' : ''}`}
                key={entry.id}
              >
                <button onClick={() => showHistoryEntry(entry)} type="button">
                  <MapPin size={14} />
                  <span className="near-me-history-label">{entry.locationLabel}</span>
                  <span className="near-me-history-meta">
                    <Clock size={11} /> {formatWhen(entry.capturedAt)} · {entry.stores.length} stores
                  </span>
                </button>
                <button
                  aria-label={`Remove ${entry.locationLabel} from history`}
                  className="near-me-history-remove"
                  onClick={() => removeHistory(entry.id)}
                  type="button"
                >
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {state.status === 'ready' && state.summary && (
        <div className="discovery-summary">
          <Metric label="Stores found" value={`${state.summary.storeCount}`} />
          <Metric label="Known chains" value={`${state.summary.knownChainCount}`} />
          <Metric label="With deals" value={`${state.summary.withDealsCount}`} />
        </div>
      )}

      {state.status === 'ready' && state.stores.length === 0 && (
        <div className="near-me-hint" role="status">
          <Storefront size={20} />
          <p>No supermarkets found within a few kilometres. Try again from a different spot.</p>
        </div>
      )}

      {state.stores.length > 0 && (
        <div className="near-me-list">
          {state.stores.map((store) => (
            <StoreCard
              key={store.placeId}
              onOpenLeaflet={setOpenLeaflet}
              onViewDeals={onViewStoreDeals}
              store={store}
            />
          ))}
        </div>
      )}

      {openLeaflet && (
        <LeafletViewer leaflet={openLeaflet} onClose={() => setOpenLeaflet(undefined)} />
      )}
    </div>
  )
}

function summariseStores(stores: NearbyStoreResult[]): NonNullable<NearbyStoresState['summary']> {
  return {
    knownChainCount: stores.filter((store) => store.retailerId).length,
    storeCount: stores.length,
    withDealsCount: stores.filter(
      (store) =>
        store.deals.length > 0 || store.leaflets.length > 0 || store.promotions.length > 0,
    ).length,
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = Date.now()
  const mins = Math.round((now - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function StoreCard({
  onOpenLeaflet,
  onViewDeals,
  store,
}: {
  onOpenLeaflet: (leaflet: StoreLeaflet) => void
  onViewDeals?: (store: NearbyStoreResult) => void
  store: NearbyStoreResult
}) {
  const dealCount = store.deals.length + store.promotions.filter((p) => p.kind === 'deal').length
  const catalogueCount = store.leaflets.length + store.promotions.filter((p) => p.kind === 'catalogue').length

  const hasDeals =
    store.deals.length > 0 || store.promotions.some((promotion) => promotion.kind === 'deal')
  const canViewDeals = Boolean(onViewDeals) && hasDeals

  return (
    <article className="store-card">
      <header className="store-card-head">
        {store.logoUrl ? (
          <img alt="" className="store-logo" loading="lazy" src={store.logoUrl} />
        ) : (
          <span className="store-logo-fallback"><Storefront size={22} /></span>
        )}
        <div>
          <h3>{store.name}</h3>
          {store.address && <p className="store-address">{store.address}</p>}
        </div>
        <div className="store-tags">
          {store.retailerId && <span className="store-chain-tag">Known chain</span>}
          {typeof store.distanceM === 'number' && (
            <span className="store-distance">{formatDistance(store.distanceM)}</span>
          )}
        </div>
      </header>

      {canViewDeals && (
        <button className="store-view-deals" onClick={() => onViewDeals?.(store)} type="button">
          See {store.name}’s deals in Find deals
          <ArrowRight size={14} />
        </button>
      )}

      {dealCount === 0 && catalogueCount === 0 ? (
        <p className="store-empty">
          {store.retailerId
            ? 'No current deals loaded for this chain yet. Check back soon.'
            : store.website
              ? 'We’re checking this store’s specials. Come back shortly.'
              : 'No online specials page found for this store.'}
        </p>
      ) : (
        <>
          {store.deals.slice(0, 4).map((deal) => (
            <div className="store-deal" key={deal.id}>
              {deal.imageUrl && <img alt="" className="near-deal-image" loading="lazy" src={deal.imageUrl} />}
              <span className="store-deal-title">{deal.title}</span>
              <span className="store-deal-price">
                {deal.priceText}
                {deal.previousPriceText && <s>{deal.previousPriceText}</s>}
              </span>
            </div>
          ))}

          {store.leaflets.map((leaflet) => (
            <button
              aria-label={`Read ${cleanUiText(leaflet.name)}`}
              className="store-catalogue"
              key={leaflet.id}
              onClick={() => onOpenLeaflet(leaflet)}
              type="button"
            >
              {leaflet.imageUrl ? (
                <img alt="" className="near-catalogue-image" loading="lazy" src={leaflet.imageUrl} />
              ) : <Tag size={14} />}
              {cleanUiText(leaflet.name)}
              {describeValid(leaflet.validFrom, leaflet.validTo)}
              <span className="store-catalogue-action">Read here</span>
            </button>
          ))}

          {store.promotions
            .filter((promotion) => promotion.kind === 'catalogue')
            .map((promotion) => (
              <button
                aria-label={`Read ${cleanUiText(promotion.title)}`}
                className="store-catalogue"
                key={promotion.id}
                onClick={() => onOpenLeaflet(promotionToLeaflet(store, promotion))}
                type="button"
              >
                {promotion.imageUrl ? (
                  <img alt="" className="near-catalogue-image" loading="lazy" src={promotion.imageUrl} />
                ) : <Tag size={14} />}
                {cleanUiText(promotion.title)}
                {describeValid(promotion.validFrom, promotion.validTo)}
                <span className="store-catalogue-action">Read here</span>
              </button>
            ))}
        </>
      )}

      {store.website && (
        <a className="store-website" href={store.website} rel="noreferrer" target="_blank">
          Visit store site
          <LinkSimple size={12} />
        </a>
      )}
    </article>
  )
}

function promotionToLeaflet(
  store: NearbyStoreResult,
  promotion: NearbyStoreResult['promotions'][number],
): StoreLeaflet {
  return {
    capturedAt: store.lastSeenAt ?? new Date().toISOString(),
    documentUrl: promotion.productUrl ?? promotion.sourceUrl,
    id: promotion.id,
    imageUrl: promotion.imageUrl,
    name: cleanUiText(promotion.title),
    retailerId: store.retailerId ?? store.placeId,
    retailerName: cleanUiText(store.name),
    sourceLabel: 'Official catalogue',
    url: promotion.sourceUrl,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function describeValid(validFrom?: string, validTo?: string): string {
  if (validTo) {
    return ` · until ${validTo.slice(0, 10)}`
  }

  if (validFrom) {
    return ` · from ${validFrom.slice(0, 10)}`
  }

  return ''
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function cleanUiText(value: string): string {
  return value.replace(/\s*\u2014\s*/g, ': ')
}
