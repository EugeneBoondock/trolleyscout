import { useState } from 'react'
import { Buildings, Lock, MagnifyingGlass } from '@phosphor-icons/react'
import { searchProperties } from '../services/apiClient'
import type { MemberAccount, PropertyListing, PropertyListingType } from '../types'

type Props = {
  account: MemberAccount
  onUpgrade: () => void
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

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

  if (!account.propertiesAccess) {
    return <PropertiesUpsell onUpgrade={onUpgrade} />
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMessage('Enter a city, suburb, or area to search.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setMessage('')
    const outcome = await searchProperties({
      query: trimmed,
      listingType,
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

    setListings(outcome.result.listings)
    setSearchedFor(trimmed)
    setStatus('ready')
    if (outcome.result.listings.length === 0) {
      setMessage(`No ${listingType === 'rent' ? 'rentals' : 'listings'} found for “${trimmed}”.`)
    }
  }

  return (
    <section className="properties" aria-label="Properties Scout">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Household · Properties Scout</p>
          <h1>Find a home</h1>
          <p className="section-lede">
            Search homes to buy or rent across South Africa, pulled live from Property24 and
            Private Property.
          </p>
        </div>
      </div>

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

      {status === 'error' && (
        <div className="write-notice" role="status">
          {message}
        </div>
      )}

      {status === 'ready' && listings.length > 0 && (
        <>
          <p className="properties-count">
            {listings.length} {listingType === 'rent' ? 'to rent' : 'for sale'} near {searchedFor}
          </p>
          <div className="properties-grid">
            {listings.map((listing) => (
              <PropertyCard key={`${listing.portal}-${listing.id}`} listing={listing} />
            ))}
          </div>
        </>
      )}

      {status === 'ready' && listings.length === 0 && (
        <div className="properties-empty" role="status">
          {message}
        </div>
      )}

      {status === 'idle' && (
        <div className="properties-empty">
          Search a location above to see homes for sale or to rent.
        </div>
      )}
    </section>
  )
}

function PropertyCard({ listing }: { listing: PropertyListing }) {
  const [broken, setBroken] = useState(false)
  const facts = [
    listing.bedrooms ? `${listing.bedrooms} bed` : undefined,
    listing.bathrooms ? `${listing.bathrooms} bath` : undefined,
    listing.garages ? `${listing.garages} garage` : undefined,
  ].filter(Boolean)

  return (
    <a
      className="property-card"
      href={listing.listingUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="property-card-image">
        {listing.imageUrl && !broken ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="property-card-fallback" aria-hidden>
            <Buildings size={40} />
          </div>
        )}
        <span className="property-card-portal">{listing.portalName}</span>
      </div>
      <div className="property-card-body">
        <p className="property-card-price">{listing.priceText ?? 'Price on application'}</p>
        <p className="property-card-title">{listing.title}</p>
        {listing.location && <p className="property-card-location">{listing.location}</p>}
        {facts.length > 0 && <p className="property-card-facts">{facts.join(' · ')}</p>}
      </div>
    </a>
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
          Search homes to buy or rent across South Africa — Property24 and Private Property in one
          place, with your own filters. Properties Scout is included with the Household plan.
        </p>
        <ul className="properties-locked-list">
          <li>Homes to buy and to rent, nationwide</li>
          <li>Filter by suburb, price and bedrooms</li>
          <li>Live listings from the major SA portals</li>
        </ul>
        <button type="button" className="properties-submit" onClick={onUpgrade}>
          Upgrade to Household
        </button>
      </div>
    </section>
  )
}
