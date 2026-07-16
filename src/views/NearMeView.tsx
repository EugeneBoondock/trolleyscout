import { useState } from 'react'
import { LinkSimple, MapPin, NavigationArrow, Storefront, Tag } from '@phosphor-icons/react'
import {
  loadNearbyStores,
  type NearbyStoresState,
  type NearbyStoreResult,
} from '../services/apiClient'

const INITIAL: NearbyStoresState = {
  message: 'Find the supermarkets around you and this week’s specials for each.',
  status: 'idle',
  stores: [],
}

export function NearMeView() {
  const [state, setState] = useState<NearbyStoresState>(INITIAL)

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
          .then(setState)
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
            catalogues for each — reused from other shoppers nearby so it loads fast.
          </p>
        </div>
        <button className="primary-button" disabled={isBusy} onClick={findNearby} type="button">
          <NavigationArrow size={18} className={isBusy ? 'is-spinning' : undefined} />
          {isBusy ? 'Searching' : 'Use my location'}
        </button>
      </section>

      {state.status !== 'ready' && (
        <div className="near-me-hint" role="status">
          <MapPin size={20} />
          <p>{state.message}</p>
        </div>
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
            <StoreCard key={store.placeId} store={store} />
          ))}
        </div>
      )}
    </div>
  )
}

function StoreCard({ store }: { store: NearbyStoreResult }) {
  const dealCount = store.deals.length + store.promotions.filter((p) => p.kind === 'deal').length
  const catalogueCount = store.leaflets.length + store.promotions.filter((p) => p.kind === 'catalogue').length

  return (
    <article className="store-card">
      <header className="store-card-head">
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

      {dealCount === 0 && catalogueCount === 0 ? (
        <p className="store-empty">
          {store.retailerId
            ? 'No current deals loaded for this chain yet — check back soon.'
            : store.website
              ? 'We’re checking this store’s specials. Come back shortly.'
              : 'No online specials page found for this store.'}
        </p>
      ) : (
        <>
          {store.deals.slice(0, 4).map((deal) => (
            <div className="store-deal" key={deal.id}>
              <span className="store-deal-title">{deal.title}</span>
              <span className="store-deal-price">
                {deal.priceText}
                {deal.previousPriceText && <s>{deal.previousPriceText}</s>}
              </span>
            </div>
          ))}

          {store.leaflets.slice(0, 3).map((leaflet) => (
            <a
              className="store-catalogue"
              href={leaflet.url}
              key={leaflet.id}
              rel="noreferrer"
              target="_blank"
            >
              <Tag size={14} />
              {leaflet.name}
              {describeValid(leaflet.validFrom, leaflet.validTo)}
              <LinkSimple size={12} />
            </a>
          ))}

          {store.promotions
            .filter((promotion) => promotion.kind === 'catalogue')
            .slice(0, 3)
            .map((promotion) => (
              <a
                className="store-catalogue"
                href={promotion.productUrl ?? promotion.sourceUrl}
                key={promotion.id}
                rel="noreferrer"
                target="_blank"
              >
                <Tag size={14} />
                {promotion.title}
                {describeValid(promotion.validFrom, promotion.validTo)}
                <LinkSimple size={12} />
              </a>
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
