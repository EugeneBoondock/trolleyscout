import { useRef, useState } from 'react'
import {
  Bookmarks,
  Buildings,
  CaretLeft,
  CaretRight,
  Check,
  Heart,
  Lock,
  MagnifyingGlass,
  NavigationArrow,
  ShareNetwork,
} from '@phosphor-icons/react'
import { searchProperties } from '../services/apiClient'
import { useSavedProperties } from '../hooks/useSavedProperties'
import type { MemberAccount, PropertyListing, PropertyListingType } from '../types'

type Props = {
  account: MemberAccount
  onUpgrade: () => void
}

type Status = 'idle' | 'loading' | 'ready' | 'error'
type ViewMode = 'search' | 'saved'

const SORTS: Array<{ label: string; value: string }> = [
  { label: 'Most relevant', value: 'relevance' },
  { label: 'Price: low to high', value: 'price_low' },
  { label: 'Price: high to low', value: 'price_high' },
  { label: 'Most bedrooms', value: 'beds' },
]

function toAmount(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number(digits) : undefined
}

function galleryOf(listing: PropertyListing): string[] {
  if (listing.images && listing.images.length > 0) return listing.images
  return listing.imageUrl ? [listing.imageUrl] : []
}

export function PropertiesView({ account, onUpgrade }: Props) {
  const [query, setQuery] = useState('')
  const [listingType, setListingType] = useState<PropertyListingType>('sale')
  const [minBeds, setMinBeds] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('relevance')

  const [listings, setListings] = useState<PropertyListing[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [searchedFor, setSearchedFor] = useState('')
  const [locating, setLocating] = useState(false)
  const [view, setView] = useState<ViewMode>('search')
  const [flash, setFlash] = useState('')

  const { saved, savedCount, isSaved, toggle } = useSavedProperties(true)

  if (!account.propertiesAccess) {
    return <PropertiesUpsell onUpgrade={onUpgrade} />
  }

  function showFlash(text: string) {
    setFlash(text)
    window.setTimeout(() => setFlash(''), 2400)
  }

  async function handleShare(listing: PropertyListing) {
    const shareData = {
      title: listing.title,
      text: `${listing.priceText ?? ''} — ${listing.title}`.trim(),
      url: listing.listingUrl,
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        return
      }
    } catch {
      // user cancelled or share failed — fall through to copy
    }
    try {
      await navigator.clipboard.writeText(listing.listingUrl)
      showFlash('Link copied to clipboard')
    } catch {
      showFlash('Could not share this listing')
    }
  }

  function handleToggleSave(listing: PropertyListing) {
    const wasSaved = isSaved(listing)
    toggle(listing)
    showFlash(wasSaved ? 'Removed from saved' : 'Saved')
  }

  async function doSearch(coords?: { lat: number; lon: number }) {
    const trimmed = query.trim()
    if (!coords && trimmed.length < 2) {
      setMessage('Enter a city, suburb, or area to search.')
      setStatus('error')
      return
    }

    setView('search')
    setStatus('loading')
    setMessage('')
    const outcome = await searchProperties({
      query: coords ? '' : trimmed,
      listingType,
      lat: coords?.lat,
      lon: coords?.lon,
      minBeds: minBeds ? Number(minBeds) : undefined,
      minPrice: toAmount(minPrice),
      maxPrice: toAmount(maxPrice),
      sort,
    })

    if (!outcome.ok) {
      setListings([])
      setStatus('error')
      setMessage(outcome.message)
      return
    }

    const where = outcome.result.locationText || trimmed
    setListings(outcome.result.listings)
    setSearchedFor(where)
    setStatus('ready')
    if (outcome.result.listings.length === 0) {
      setMessage(`No ${listingType === 'rent' ? 'rentals' : 'listings'} found near ${where}.`)
    }
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault()
    void doSearch()
  }

  function runNearMe() {
    if (!('geolocation' in navigator)) {
      setStatus('error')
      setMessage('Location is not available in this browser. Search by name instead.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        void doSearch({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        setLocating(false)
        setStatus('error')
        setMessage('Could not get your location. Allow location access, or search by name.')
      },
      { timeout: 10000, maximumAge: 300000 },
    )
  }

  const shownListings = view === 'saved' ? saved : listings

  return (
    <section className="properties" aria-label="Properties Scout">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Household · Properties Scout</p>
          <h1>Find a home</h1>
          <p className="section-lede">
            Search homes to buy or rent across South Africa, pulled live from 25 property portals.
          </p>
        </div>
        <div className="properties-view-switch" role="tablist" aria-label="Search or saved">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'search'}
            className={view === 'search' ? 'is-active' : ''}
            onClick={() => setView('search')}
          >
            <MagnifyingGlass size={16} weight="bold" /> Search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'saved'}
            className={view === 'saved' ? 'is-active' : ''}
            onClick={() => setView('saved')}
          >
            <Bookmarks size={16} weight={view === 'saved' ? 'fill' : 'bold'} /> Saved
            {savedCount > 0 && <span className="properties-badge">{savedCount}</span>}
          </button>
        </div>
      </div>

      {view === 'search' && (
        <form className="properties-search" onSubmit={runSearch}>
          <div className="properties-toggle" role="tablist" aria-label="Buy or rent">
            <button
              type="button"
              role="tab"
              aria-selected={listingType === 'sale'}
              className={listingType === 'sale' ? 'is-active' : ''}
              onClick={() => setListingType('sale')}
            >
              Buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={listingType === 'rent'}
              className={listingType === 'rent' ? 'is-active' : ''}
              onClick={() => setListingType('rent')}
            >
              Rent
            </button>
          </div>

          <div className="properties-search-row">
            <label className="properties-field properties-field-grow">
              <span className="sr-only">Location</span>
              <MagnifyingGlass size={18} aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="City, suburb or area (e.g. Cape Town)"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="properties-submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Searching…' : 'Search'}
            </button>
            <button
              type="button"
              className="properties-nearme"
              onClick={runNearMe}
              disabled={locating || status === 'loading'}
              title="Find homes near your current location"
            >
              <NavigationArrow size={18} weight="fill" />
              {locating ? 'Locating…' : 'Near me'}
            </button>
          </div>

          <div className="properties-filters">
            <label className="properties-field">
              <span>Min beds</span>
              <select value={minBeds} onChange={(event) => setMinBeds(event.target.value)}>
                <option value="">Any</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}+
                  </option>
                ))}
              </select>
            </label>
            <label className="properties-field">
              <span>Min price</span>
              <input
                inputMode="numeric"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
                placeholder="R"
              />
            </label>
            <label className="properties-field">
              <span>Max price</span>
              <input
                inputMode="numeric"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                placeholder="R"
              />
            </label>
            <label className="properties-field">
              <span>Sort</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      )}

      {view === 'search' && status === 'error' && (
        <div className="write-notice" role="status">
          {message}
        </div>
      )}

      {view === 'search' && status === 'loading' && (
        <div className="properties-grid" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="property-card property-card-skeleton" />
          ))}
        </div>
      )}

      {view === 'search' && status === 'ready' && listings.length > 0 && (
        <p className="properties-count">
          {listings.length} {listingType === 'rent' ? 'to rent' : 'for sale'} near {searchedFor}
        </p>
      )}

      {view === 'saved' && (
        <p className="properties-count">
          {savedCount > 0
            ? `${savedCount} saved ${savedCount === 1 ? 'home' : 'homes'}`
            : 'No saved homes yet'}
        </p>
      )}

      {shownListings.length > 0 && (
        <div className="properties-grid">
          {shownListings.map((listing) => (
            <PropertyCard
              key={`${listing.portal}-${listing.id}`}
              listing={listing}
              saved={isSaved(listing)}
              onToggleSave={() => handleToggleSave(listing)}
              onShare={() => void handleShare(listing)}
            />
          ))}
        </div>
      )}

      {view === 'search' && status === 'ready' && listings.length === 0 && (
        <div className="properties-empty" role="status">
          {message}
        </div>
      )}

      {view === 'search' && status === 'idle' && (
        <div className="properties-empty">
          Search a location above to see homes for sale or to rent.
        </div>
      )}

      {view === 'saved' && savedCount === 0 && (
        <div className="properties-empty">
          Tap the heart on any home to save it here — your saved homes follow your account across
          devices.
        </div>
      )}

      {flash && (
        <div className="properties-flash" role="status" aria-live="polite">
          <Check size={16} weight="bold" /> {flash}
        </div>
      )}
    </section>
  )
}

type CardProps = {
  listing: PropertyListing
  saved: boolean
  onToggleSave: () => void
  onShare: () => void
}

function PropertyCard({ listing, saved, onToggleSave, onShare }: CardProps) {
  const images = galleryOf(listing)
  const facts = [
    listing.bedrooms ? `${listing.bedrooms} bed` : undefined,
    listing.bathrooms ? `${listing.bathrooms} bath` : undefined,
    listing.garages ? `${listing.garages} garage` : undefined,
  ].filter(Boolean)

  return (
    <article className="property-card">
      <div className="property-card-media">
        <PropertyGallery images={images} alt={listing.title} />
        <span className="property-card-portal">{listing.portalName}</span>
        <span className={`property-card-type property-card-type-${listing.listingType}`}>
          {listing.listingType === 'rent' ? 'To rent' : 'For sale'}
        </span>
        <div className="property-card-actions">
          <button
            type="button"
            className={`property-action ${saved ? 'is-saved' : ''}`}
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? 'Remove from saved' : 'Save this home'}
            title={saved ? 'Remove from saved' : 'Save this home'}
          >
            <Heart size={18} weight={saved ? 'fill' : 'bold'} />
          </button>
          <button
            type="button"
            className="property-action"
            onClick={onShare}
            aria-label="Share this home"
            title="Share this home"
          >
            <ShareNetwork size={18} weight="bold" />
          </button>
        </div>
      </div>
      <div className="property-card-body">
        <p className="property-card-price">{listing.priceText ?? 'Price on application'}</p>
        <a
          className="property-card-title"
          href={listing.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {listing.title}
        </a>
        {listing.location && <p className="property-card-location">{listing.location}</p>}
        {facts.length > 0 && <p className="property-card-facts">{facts.join(' · ')}</p>}
        <a
          className="property-card-view"
          href={listing.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on {listing.portalName} →
        </a>
      </div>
    </article>
  )
}

function PropertyGallery({ images, alt }: { images: string[]; alt: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<Record<number, boolean>>({})

  if (images.length === 0) {
    return (
      <div className="property-gallery property-gallery-empty" aria-hidden>
        <Buildings size={40} />
      </div>
    )
  }

  function scrollTo(next: number) {
    const track = trackRef.current
    if (!track) return
    const clamped = Math.max(0, Math.min(next, images.length - 1))
    track.scrollTo({ left: track.clientWidth * clamped, behavior: 'smooth' })
  }

  function handleScroll() {
    const track = trackRef.current
    if (!track) return
    const next = Math.round(track.scrollLeft / track.clientWidth)
    if (next !== index) setIndex(next)
  }

  return (
    <div className="property-gallery">
      <div className="property-gallery-track" ref={trackRef} onScroll={handleScroll}>
        {images.map((src, i) => (
          <div className="property-gallery-slide" key={`${src}-${i}`}>
            {broken[i] ? (
              <div className="property-gallery-fallback" aria-hidden>
                <Buildings size={40} />
              </div>
            ) : (
              <img
                src={src}
                alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
                loading="lazy"
                onError={() => setBroken((b) => ({ ...b, [i]: true }))}
              />
            )}
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="property-gallery-arrow property-gallery-prev"
            onClick={() => scrollTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous photo"
          >
            <CaretLeft size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="property-gallery-arrow property-gallery-next"
            onClick={() => scrollTo(index + 1)}
            disabled={index === images.length - 1}
            aria-label="Next photo"
          >
            <CaretRight size={18} weight="bold" />
          </button>
          <span className="property-gallery-counter">
            {index + 1}/{images.length}
          </span>
          <div className="property-gallery-dots" aria-hidden>
            {images.slice(0, 8).map((_, i) => (
              <span key={i} className={i === index ? 'is-active' : ''} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function PropertiesUpsell({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <section className="properties" aria-label="Properties Scout">
      <div className="properties-locked">
        <div className="properties-locked-badge" aria-hidden>
          <Lock size={30} weight="fill" />
        </div>
        <p className="eyebrow">Household plan</p>
        <h1>Properties Scout</h1>
        <p className="properties-locked-lede">
          Search homes to buy or rent across South Africa — 25 portals in one place, with swipeable
          photos, saved homes and one-tap sharing. Properties Scout is included with the Household
          plan.
        </p>
        <ul className="properties-locked-list">
          <li>Homes to buy and to rent, nationwide</li>
          <li>Swipe photos, save favourites, share links</li>
          <li>Live listings from the major SA portals</li>
        </ul>
        <button type="button" className="properties-submit" onClick={onUpgrade}>
          Upgrade to Household
        </button>
      </div>
    </section>
  )
}
