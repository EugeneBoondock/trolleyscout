import { useEffect, useState } from 'react'
import { ArrowRight, Clock, LinkSimple, MapPin, NavigationArrow, Storefront, Tag, Trash, X } from '@phosphor-icons/react'
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
import { sortLeafletsMostRecent } from '../services/catalogueOrdering'
import { meaningfulWasPrice } from '../services/priceDisplay'

const INITIAL: NearbyStoresState = {
  message: 'Find the supermarkets around you and this week’s specials for each.',
  status: 'idle',
  stores: [],
}

export function NearMeView({
  countryCode = 'ZA',
  onViewStoreDeals,
}: {
  countryCode?: string
  onViewStoreDeals?: (store: NearbyStoreResult) => void
}) {
  const [state, setState] = useState<NearbyStoresState>(INITIAL)
  const [openLeaflet, setOpenLeaflet] = useState<StoreLeaflet | undefined>()
  const [openStore, setOpenStore] = useState<NearbyStoreResult | undefined>()
  const [history, setHistory] = useState<NearbyHistoryEntry[]>([])
  const [viewingLabel, setViewingLabel] = useState<string>()

  // Restore only searches from the active country. Changing an admin test
  // country also clears any open result from the previous country.
  useEffect(() => {
    const stored = loadNearbyHistory(countryCode)
    setState(INITIAL)
    setOpenLeaflet(undefined)
    setOpenStore(undefined)
    setHistory(stored)
    setViewingLabel(undefined)
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
  }, [countryCode])

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
    setHistory(removeNearbyHistoryEntry(id, countryCode))
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

        loadNearbyStores(
          position.coords.latitude,
          position.coords.longitude,
          undefined,
          countryCode,
        )
          .then((result) => {
            setState(result)
            if (result.stores.length > 0) {
              const saved = saveNearbyHistorySearch(
                position.coords.latitude,
                position.coords.longitude,
                result.stores,
                countryCode,
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
              onOpen={setOpenStore}
              store={store}
            />
          ))}
        </div>
      )}

      {openStore && (
        <StoreDetailModal
          onClose={() => setOpenStore(undefined)}
          onOpenLeaflet={setOpenLeaflet}
          onViewDeals={onViewStoreDeals}
          store={openStore}
        />
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

// One store, one compact card: name, distance, and a deal summary. The
// deals themselves live on the store's own curated page (the modal), so the
// Near me list stays scannable no matter how many specials a store has.
function StoreCard({
  onOpen,
  store,
}: {
  onOpen: (store: NearbyStoreResult) => void
  store: NearbyStoreResult
}) {
  const { catalogues, dealCount } = storeContent(store)
  const catalogueCount = catalogues.length
  const hasContent = dealCount > 0 || catalogueCount > 0

  return (
    <article className="store-card">
      <button
        aria-label={`Open ${store.name} deals and catalogues`}
        className="store-card-open"
        onClick={() => onOpen(store)}
        type="button"
      >
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

        {hasContent ? (
          <p className="store-summary-line">
            <Tag size={14} />
            {dealCount} {dealCount === 1 ? 'deal' : 'deals'} · {catalogueCount}{' '}
            {catalogueCount === 1 ? 'catalogue' : 'catalogues'}
            <span className="store-summary-action">
              View
              <ArrowRight size={14} />
            </span>
          </p>
        ) : (
          <p className="store-empty">
            {store.retailerId
              ? 'No current deals loaded for this chain yet. Check back soon.'
              : store.website
                ? 'We’re checking this store’s specials. Come back shortly.'
                : 'No online specials page found for this store.'}
          </p>
        )}
      </button>
    </article>
  )
}

// The curated per-store page: every deal and catalogue this store published,
// in one place.
function StoreDetailModal({
  onClose,
  onOpenLeaflet,
  onViewDeals,
  store,
}: {
  onClose: () => void
  onOpenLeaflet: (leaflet: StoreLeaflet) => void
  onViewDeals?: (store: NearbyStoreResult) => void
  store: NearbyStoreResult
}) {
  const { catalogues, dealCount } = storeContent(store)
  const promotionDeals = store.promotions.filter((promotion) => promotion.kind === 'deal')

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      className="store-directory-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby="near-store-title"
        aria-modal="true"
        className="store-directory-modal"
        role="dialog"
      >
        <header className="store-directory-modal-head">
          <div>
            <p className="eyebrow">Store deals and catalogues</p>
            <h3 id="near-store-title">{store.name}</h3>
            <p>
              {store.address ?? 'Near you'}
              {typeof store.distanceM === 'number' && ` · ${formatDistance(store.distanceM)} away`}
            </p>
          </div>
          <button
            aria-label="Close store details"
            autoFocus
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </header>

        <div className="store-location-list">
          {onViewDeals && dealCount > 0 && (
            <button
              className="store-view-deals"
              onClick={() => onViewDeals(store)}
              type="button"
            >
              See {store.name}’s deals in Find deals
              <ArrowRight size={14} />
            </button>
          )}

          {dealCount > 0 && (
            <section aria-label={`${store.name} deals`}>
              <p className="eyebrow">Current deals</p>
              {store.deals.map((deal) => (
                <div className="store-deal" key={deal.id}>
                  {deal.imageUrl && <img alt="" className="near-deal-image" loading="lazy" src={deal.imageUrl} />}
                  <span className="store-deal-title">{deal.title}</span>
                  <span className="store-deal-price">
                    {deal.priceText}
                    {meaningfulWasPrice(deal.previousPriceText, deal.priceText) && (
                      <s>{meaningfulWasPrice(deal.previousPriceText, deal.priceText)}</s>
                    )}
                    {deal.savingText && (
                      <span className="store-deal-saving">{cleanUiText(deal.savingText)}</span>
                    )}
                  </span>
                </div>
              ))}
              {promotionDeals.map((promotion) => (
                <div className="store-deal" key={promotion.id}>
                  {promotion.imageUrl && (
                    <img alt="" className="near-deal-image" loading="lazy" src={promotion.imageUrl} />
                  )}
                  <span className="store-deal-title">{cleanUiText(promotion.title)}</span>
                  <span className="store-deal-price">
                    {promotion.priceText}
                    {meaningfulWasPrice(promotion.previousPriceText, promotion.priceText) && (
                      <s>{meaningfulWasPrice(promotion.previousPriceText, promotion.priceText)}</s>
                    )}
                    {promotion.savingText && (
                      <span className="store-deal-saving">
                        {cleanUiText(promotion.savingText)}
                      </span>
                    )}
                    {(promotion.validFrom || promotion.validTo) && (
                      <span className="store-deal-validity">
                        {describeDealValidity(promotion.validFrom, promotion.validTo)}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </section>
          )}

          {catalogues.length > 0 && (
            <section aria-label={`${store.name} catalogues`}>
              <p className="eyebrow">Catalogues</p>
              {catalogues.map((leaflet) => (
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
            </section>
          )}

          {store.website && (
            <a className="store-website" href={store.website} rel="noreferrer" target="_blank">
              Visit store site
              <LinkSimple size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function storeContent(store: NearbyStoreResult) {
  return {
    catalogues: sortLeafletsMostRecent([
      ...store.leaflets,
      ...store.promotions
        .filter((promotion) => promotion.kind === 'catalogue')
        .map((promotion) => promotionToLeaflet(store, promotion)),
    ]),
    dealCount:
      store.deals.length + store.promotions.filter((p) => p.kind === 'deal').length,
  }
}

function promotionToLeaflet(
  store: NearbyStoreResult,
  promotion: NearbyStoreResult['promotions'][number],
): StoreLeaflet {
  return {
    capturedAt: promotion.capturedAt ?? store.lastSeenAt ?? new Date().toISOString(),
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

function describeDealValidity(validFrom?: string, validTo?: string): string {
  if (validTo) {
    return `Until ${validTo.slice(0, 10)}`
  }

  if (validFrom) {
    return `From ${validFrom.slice(0, 10)}`
  }

  return ''
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

function cleanUiText(value: string): string {
  return value.replace(/\s*\u2014\s*/g, ': ')
}
