import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  CheckCircle,
  Clock,
  ListChecks,
  MagnifyingGlass,
  Scales,
  Storefront,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import {
  loadRetailers,
  readMemberState,
  searchProductPrices,
  setMemberState,
} from '../services/apiClient'
import type {
  CountryOption,
  ProductComparisonResult,
  Retailer,
  RetailerProductSearchMatch,
} from '../types'
import {
  buildTripComparison,
  MAX_TRIP_ITEMS,
  parseTripQueries,
  type TripComparison,
} from '../services/tripCompare'

const COMPARE_RETAILERS_STATE_KEY = 'compare_retailers_v1'
const COMPARE_RETAILERS_LOCAL_KEY = 'ts_compare_retailers_v1'
const MAX_COMPARE_RETAILERS = 16

export function ToolkitView({ preferenceOwnerId }: { preferenceOwnerId?: string } = {}) {
  return (
    <div className="toolkit-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Compare before you buy</h1>
          <p className="section-lede">
            Search the same product across as many stores as you like and see what each one
            charges, from live prices where we have them.
          </p>
        </div>
      </section>
      <AutoShopCompare preferenceOwnerId={preferenceOwnerId} />
    </div>
  )
}

interface CompareRetailerSelection {
  ids: string[]
  updatedAt: number
}

// Auto compare searches each selected retailer when the shopper asks. This is
// separate from discovery because regular shelf products may have no promotion.
function AutoShopCompare({ preferenceOwnerId }: { preferenceOwnerId?: string }) {
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'item' | 'trip'>('item')
  const [tripText, setTripText] = useState('')
  // undefined until the store list loads; [] afterwards is a real "none
  // picked" choice, so deselecting every store must not resurrect defaults.
  const [selectedIds, setSelectedIds] = useState<string[] | undefined>()
  const [result, setResult] = useState<ProductComparisonResult | undefined>()
  const [tripResult, setTripResult] = useState<TripComparison | undefined>()
  const preferenceSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const lastPreferenceUpdate = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    const localKey = compareRetailersLocalKey(preferenceOwnerId)
    const accountLocalValue = readLocalCompareRetailerSelection(localKey)
    const publicLocalValue = preferenceOwnerId
      ? readLocalCompareRetailerSelection(COMPARE_RETAILERS_LOCAL_KEY)
      : undefined

    Promise.all([
      loadRetailers({ query: '', signal: controller.signal, sourceKind: 'all' }),
      readMemberState<unknown>(COMPARE_RETAILERS_STATE_KEY, controller.signal),
    ])
      .then(([state, remoteRead]) => {
        if (controller.signal.aborted) {
          return
        }
        const loaded = state.data.retailers
        const remoteSelection = parseCompareRetailerSelection(remoteRead.value, loaded)
        const localSelection =
          parseCompareRetailerSelection(accountLocalValue, loaded) ??
          parseCompareRetailerSelection(publicLocalValue, loaded)
        const savedSelection = newerCompareRetailerSelection(remoteSelection, localSelection)
        const initialSelection = savedSelection ?? {
          ids: loaded.slice(0, 2).map((retailer) => retailer.id),
          updatedAt: 0,
        }
        setRetailers(loaded)
        setSelectedIds(initialSelection.ids)
        lastPreferenceUpdate.current = Math.max(
          lastPreferenceUpdate.current,
          initialSelection.updatedAt,
        )
        writeLocalCompareRetailerSelection(localKey, initialSelection)
        if (localSelection && remoteRead.ok && (
          !remoteSelection || localSelection.updatedAt > remoteSelection.updatedAt
        )) {
          preferenceSaveQueue.current = preferenceSaveQueue.current
            .catch(() => undefined)
            .then(() => setMemberState(COMPARE_RETAILERS_STATE_KEY, localSelection))
            .then(() => undefined)
        }
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))

    return () => controller.abort()
  }, [preferenceOwnerId])

  const storeOptions = retailers.map((retailer) => ({ id: retailer.id, name: retailer.name }))
  const stores = selectedIds ?? []

  function saveStoreSelection(next: string[]) {
    setResult(undefined)
    setTripResult(undefined)
    setError('')
    const updatedAt = Math.max(Date.now(), lastPreferenceUpdate.current + 1)
    lastPreferenceUpdate.current = updatedAt
    const selection = { ids: next, updatedAt }
    setSelectedIds(next)
    writeLocalCompareRetailerSelection(compareRetailersLocalKey(preferenceOwnerId), selection)
    preferenceSaveQueue.current = preferenceSaveQueue.current
      .catch(() => undefined)
      .then(() => setMemberState(COMPARE_RETAILERS_STATE_KEY, selection))
      .then(() => undefined)
  }

  function toggleStore(id: string) {
    if (!stores.includes(id) && stores.length >= MAX_COMPARE_RETAILERS) {
      setResult(undefined)
      setError(`Choose up to ${MAX_COMPARE_RETAILERS} stores at a time.`)
      return
    }
    saveStoreSelection(stores.includes(id)
      ? stores.filter((storeId) => storeId !== id)
      : [...stores, id])
  }

  async function compare() {
    if (!canCompare) return
    setError('')
    setResult(undefined)
    setIsSearching(true)
    const outcome = await searchProductPrices({
      query: query.trim(),
      retailerIds: stores,
    })
    if (outcome.ok) {
      setResult(outcome.result)
    } else {
      setError(outcome.message)
    }
    setIsSearching(false)
  }

  async function compareTrip() {
    const queries = parseTripQueries(tripText)
    if (queries.length < 2 || stores.length < 2 || isSearching) return
    setError('')
    setResult(undefined)
    setTripResult(undefined)
    setIsSearching(true)

    const results: ProductComparisonResult[] = []
    for (let index = 0; index < queries.length; index += 2) {
      const outcomes = await Promise.all(
        queries.slice(index, index + 2).map((item) => searchProductPrices({
          query: item,
          retailerIds: stores,
        })),
      )
      const failed = outcomes.find((outcome) => !outcome.ok)
      if (failed && !failed.ok) {
        setError(failed.message)
        setIsSearching(false)
        return
      }
      results.push(...outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.result))
    }

    setTripResult(buildTripComparison(results))
    setIsSearching(false)
  }

  const canCompare = query.trim().length > 1 && stores.length >= 2 && !isSearching
  const tripQueries = parseTripQueries(tripText)
  const canCompareTrip = tripQueries.length >= 2 && stores.length >= 2 && !isSearching

  return (
    <section className="shop-compare auto-compare" aria-label="Automatic price comparison">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>{mode === 'item' ? 'Compare a product across stores' : 'Plan the cheapest shopping trip'}</h1>
          <p className="section-lede">
            {mode === 'item'
              ? 'Pick the stores you shop at and type what you are buying. We search regular products and promotions at those stores now.'
              : 'Paste several items. We price each one, compare a split trip with a one-store trip, and keep missing prices visible.'}
          </p>
        </div>
      </div>

      <div className="compare-mode-picker" aria-label="Comparison type" role="group">
        <button
          aria-pressed={mode === 'item'}
          className={clsx(mode === 'item' && 'is-active')}
          onClick={() => {
            setMode('item')
            setError('')
            setTripResult(undefined)
          }}
          type="button"
        >
          <Scales size={19} weight="bold" />
          One item
        </button>
        <button
          aria-pressed={mode === 'trip'}
          className={clsx(mode === 'trip' && 'is-active')}
          onClick={() => {
            setMode('trip')
            setError('')
            setResult(undefined)
          }}
          type="button"
        >
          <ListChecks size={19} weight="bold" />
          Shopping trip
        </button>
      </div>

      {isLoading ? (
        <p className="section-lede">Loading stores available in your country…</p>
      ) : storeOptions.length === 0 ? (
        <p className="section-lede">No stores are available right now. Try again shortly.</p>
      ) : (
        <>
          <details className="auto-compare-store-picker">
            <summary>
              <span><strong>{stores.length} stores selected</strong><small>Your regular comparison stores</small></span>
              <b>Choose stores</b>
            </summary>
            <fieldset className="auto-compare-stores">
            <legend>Store selection</legend>
            <div className="auto-compare-store-toolbar">
              <span>{stores.length} selected</span>
              <div>
                <button
                  disabled={stores.length === Math.min(storeOptions.length, MAX_COMPARE_RETAILERS)}
                  onClick={() => saveStoreSelection(storeOptions.slice(0, MAX_COMPARE_RETAILERS).map((store) => store.id))}
                  type="button"
                >
                  Select all
                </button>
                <button disabled={stores.length === 0} onClick={() => saveStoreSelection([])} type="button">
                  Clear
                </button>
              </div>
            </div>
            <p className="auto-compare-preference-note">
              Choose up to {MAX_COMPARE_RETAILERS}. Your choice is saved across web and mobile.
            </p>
            {storeOptions.map((store) => (
              <label
                className={clsx('auto-compare-store', stores.includes(store.id) && 'is-picked')}
                key={store.id}
              >
                <input
                  checked={stores.includes(store.id)}
                  onChange={() => toggleStore(store.id)}
                  type="checkbox"
                />
                {store.name}
              </label>
            ))}
            </fieldset>
          </details>

          <div className={clsx('auto-compare-controls', mode === 'trip' && 'is-trip')}>
            {mode === 'item' ? <input
              aria-label="Item to compare"
              className="auto-compare-query"
              onChange={(event) => {
                setQuery(event.target.value)
                setResult(undefined)
                setError('')
              }}
              placeholder="e.g. white bread"
              value={query}
            /> : (
              <label className="trip-compare-input">
                <span>One product per line</span>
                <textarea
                  aria-label="Shopping trip items"
                  maxLength={640}
                  onChange={(event) => {
                    setTripText(event.target.value)
                    setTripResult(undefined)
                    setError('')
                  }}
                  placeholder={'Milk 2L\nBrown bread 700g\nEggs 18 pack'}
                  rows={6}
                  value={tripText}
                />
                <small>{tripQueries.length} of {MAX_TRIP_ITEMS} products ready</small>
              </label>
            )}
            <button
              className="primary-button"
              disabled={mode === 'item' ? !canCompare : !canCompareTrip}
              onClick={mode === 'item' ? compare : compareTrip}
              type="button"
            >
              <MagnifyingGlass size={16} weight="bold" />
              {isSearching
                ? mode === 'item' ? 'Searching stores…' : `Pricing ${tripQueries.length} products…`
                : mode === 'item' ? 'Compare' : 'Plan trip'}
            </button>
          </div>

          {mode === 'trip' && tripQueries.length < 2 && (
            <p className="section-lede">Add at least two products, one per line.</p>
          )}

          {stores.length < 2 && (
            <p className="section-lede">Pick at least two stores to compare.</p>
          )}

          {error && <p className="compare-verdict" role="alert">{error}</p>}
          {result && <AutoCompareResult result={result} />}
          {tripResult && <TripCompareResult comparison={tripResult} />}
        </>
      )}
    </section>
  )
}

function TripCompareResult({ comparison }: { comparison: TripComparison }) {
  const country = comparison.country ?? {
    code: 'ZA',
    currencyCode: 'ZAR',
    flag: '',
    name: 'South Africa',
  }
  const missingCount = comparison.items.length - comparison.pricedItemCount

  return (
    <div className="trip-compare-result" aria-live="polite">
      <div className="trip-summary-grid">
        <section className="trip-summary-card is-split">
          <span>CHEAPEST SPLIT</span>
          <strong>{formatCountryMoney(comparison.splitTotalCents, country)}</strong>
          <small>
            {comparison.isComplete
              ? `${comparison.splitStoreCount} store ${comparison.splitStoreCount === 1 ? 'stop' : 'stops'}`
              : `${comparison.pricedItemCount} of ${comparison.items.length} products priced`}
          </small>
        </section>
        <section className="trip-summary-card">
          <span>BEST ONE STORE</span>
          {comparison.bestOneStore ? (
            <>
              <strong>{formatCountryMoney(comparison.bestOneStore.totalCents, country)}</strong>
              <small>{comparison.bestOneStore.retailerName}</small>
            </>
          ) : (
            <>
              <strong>More prices needed</strong>
              <small>No store priced every product</small>
            </>
          )}
        </section>
      </div>

      {comparison.isComplete && comparison.bestOneStore && comparison.convenienceCostCents !== undefined && (
        <p className="trip-verdict">
          One stop at <strong>{comparison.bestOneStore.retailerName}</strong> costs{' '}
          <strong>{formatCountryMoney(comparison.convenienceCostCents, country)} more</strong> than splitting the trip.
        </p>
      )}
      {!comparison.isComplete && (
        <p className="trip-verdict">
          This is a known-price estimate. {missingCount}{' '}
          {missingCount === 1 ? 'product still needs' : 'products still need'} a verified price.
        </p>
      )}

      <section className="trip-section" aria-label="Cheapest product stops">
        <h2>Cheapest product stops</h2>
        <ul className="trip-item-list">
          {comparison.items.map((item) => (
            <li key={item.query}>
              <span className={clsx('trip-item-status', item.match && 'is-priced')}>
                <CheckCircle size={20} weight={item.match ? 'fill' : 'regular'} />
              </span>
              <div>
                <strong>{item.query}</strong>
                <small>{item.match ? item.match.retailerName : 'No verified price found'}</small>
              </div>
              {item.match?.priceCents !== undefined && (
                <strong>{formatCountryMoney(item.match.priceCents, country)}</strong>
              )}
              {item.match?.productUrl && (
                <a
                  href={item.match.productUrl}
                  rel="noreferrer"
                  target="_blank"
                  aria-label={`Open ${item.query} at ${item.match.retailerName}`}
                >
                  <ArrowSquareOut size={18} />
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="trip-section" aria-label="Store coverage">
        <h2>Store coverage</h2>
        <div className="trip-store-grid">
          {comparison.stores.map((store) => (
            <article key={store.retailerId}>
              <div>
                <strong>{store.retailerName}</strong>
                <small>{store.pricedItemCount} of {comparison.items.length} products priced</small>
              </div>
              <div>
                <strong>
                  {store.pricedItemCount === 0 ? 'No prices' : formatCountryMoney(store.totalCents, country)}
                </strong>
                <small>
                  {store.pricedItemCount === 0
                    ? 'nothing verified'
                    : store.pricedItemCount === comparison.items.length
                      ? 'complete total'
                      : 'known subtotal'}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function AutoCompareResult({ result }: { result: ProductComparisonResult }) {
  const cheapest = result.matches.find((match) => match.retailerId === result.cheapestRetailerId)
  const bestPrice = cheapest?.priceCents
  const orderedMatches = [...result.matches].sort((left, right) => {
    if (left.priceCents !== undefined && right.priceCents !== undefined) {
      return left.priceCents - right.priceCents
    }
    if (left.priceCents !== undefined) return -1
    if (right.priceCents !== undefined) return 1
    if (left.status === 'found' && right.status === 'unavailable') return -1
    if (right.status === 'found' && left.status === 'unavailable') return 1
    return left.retailerName.localeCompare(right.retailerName)
  })
  const checkedLabel = formatCheckedAt(result.checkedAt)

  return (
    <div className="auto-compare-result">
      {result.pricedCount >= 2 && cheapest && bestPrice !== undefined ? (
        <section className="auto-compare-winner" aria-label="Best live price">
          <div className="auto-compare-winner-icon"><CheckCircle size={28} weight="fill" /></div>
          <div>
            <span>BEST LIVE PRICE</span>
            <strong>{cheapest.retailerName}</strong>
            <small>{cheapest.title ?? result.query}</small>
          </div>
          <div className="auto-compare-winner-price">
            <strong>{formatCountryMoney(bestPrice, result.country)}</strong>
            {result.savingsCents > 0 && <small>Save up to {formatCountryMoney(result.savingsCents, result.country)}</small>}
          </div>
        </section>
      ) : (
        <section className="auto-compare-no-winner">
          <Storefront size={24} />
          <div><strong>More prices needed</strong><small>We name a best price only when at least two stores return one.</small></div>
        </section>
      )}

      <div className="auto-compare-coverage" aria-label="Price coverage">
        <span><strong>{result.pricedCount} of {result.matches.length}</strong> stores priced</span>
        <span><Clock size={15} /> Checked {checkedLabel}</span>
      </div>

      <ul className="auto-compare-list">
        {orderedMatches.map((match, index) => (
          <li
            className={clsx('auto-compare-row', match.isCheapest && 'is-cheapest')}
            data-testid="price-comparison-row"
            key={match.retailerId}
          >
            <span className="auto-compare-rank" aria-label={`Rank ${index + 1}`}>{index + 1}</span>
            <div className="auto-compare-product">
              <span className="auto-compare-store-name">
                {match.retailerName}
                {match.isCheapest && <small>Best price</small>}
              </span>
            {match.status === 'unavailable' ? (
              <span className="auto-compare-missing">{unavailableMessage(match)}</span>
            ) : (
              <>
                {match.productUrl ? (
                  <a
                    className="auto-compare-title"
                    href={match.productUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {match.title ?? 'View product'}
                  </a>
                ) : (
                  <span className="auto-compare-title">{match.title ?? 'Product found'}</span>
                )}
                {match.priceCents === undefined ? (
                  <span className="auto-compare-status">
                    Product found. The site hides its price from us, so open the product page.
                  </span>
                ) : null}
              </>
            )}
            </div>
            {match.priceCents !== undefined && (
              <div className="auto-compare-price-block">
                <strong>{formatCountryMoney(match.priceCents, result.country)}</strong>
                {bestPrice !== undefined && match.priceCents > bestPrice && (
                  <small>{formatCountryMoney(match.priceCents - bestPrice, result.country)} more</small>
                )}
              </div>
            )}
            {match.productUrl && (
              <a className="auto-compare-open" href={match.productUrl} rel="noreferrer" target="_blank" aria-label={`Open ${match.retailerName} product`}>
                <ArrowSquareOut size={18} />
              </a>
            )}
          </li>
        ))}
      </ul>

      {result.pricedCount === 0 ? (
        <p className="compare-verdict">
          {result.foundCount > 0
            ? `We found an official product page for “${result.query}”, but no selected store returned a live price.`
            : `The selected stores returned no verified live price for “${result.query}” right now.`}
        </p>
      ) : result.pricedCount === 1 ? (
        <p className="compare-verdict">
          Only one selected store returned a live price for “{result.query}”. We need at least two
          live prices before naming the cheapest.
        </p>
      ) : cheapest ? (
        <p className="compare-verdict">
          <strong>{cheapest.retailerName}</strong> is cheapest for “{result.query}”
          {result.savingsCents > 0 && (
            <>, saving you {formatCountryMoney(result.savingsCents, result.country)}</>
          )}.
          {result.unavailableCount > 0 && (
            <> {result.unavailableCount} selected {result.unavailableCount === 1 ? 'store did' : 'stores did'} not return a verified live price.</>
          )}
        </p>
      ) : null}
    </div>
  )
}

/**
 * "We could not reach the shop" and "the shop does not stock this" are
 * different answers, and a shopper deciding where to drive needs to know
 * which one they got. They used to share a single message.
 */
function unavailableMessage(match: RetailerProductSearchMatch): string {
  if (match.unavailableReason === 'not-stocked') {
    return 'This store searched and does not stock it. Try another size or brand.'
  }
  if (match.unavailableReason === 'store-unreachable') {
    return 'This store is not answering us right now. Try again shortly.'
  }
  return 'This store has no public price search we can read. Check in store.'
}

function compareRetailersLocalKey(preferenceOwnerId: string | undefined): string {
  return preferenceOwnerId
    ? `${COMPARE_RETAILERS_LOCAL_KEY}:${encodeURIComponent(preferenceOwnerId)}`
    : COMPARE_RETAILERS_LOCAL_KEY
}

function readLocalCompareRetailerSelection(key: string): unknown {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : undefined
  } catch {
    return undefined
  }
}

function writeLocalCompareRetailerSelection(
  key: string,
  selection: CompareRetailerSelection,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(selection))
  } catch {
    // Account sync still keeps the choice when browser storage is unavailable.
  }
}

function parseCompareRetailerSelection(
  value: unknown,
  retailers: Retailer[],
): CompareRetailerSelection | undefined {
  const rawIds = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.ids)
      ? value.ids
      : undefined
  if (!rawIds) {
    return undefined
  }
  const available = new Set(retailers.map((retailer) => retailer.id))
  const ids = rawIds
    .filter((id): id is string => typeof id === 'string' && available.has(id))
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, MAX_COMPARE_RETAILERS)

  if (rawIds.length > 0 && ids.length === 0) {
    return undefined
  }
  const updatedAt = isRecord(value) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    value.updatedAt >= 0
    ? value.updatedAt
    : 0
  return { ids, updatedAt }
}

function newerCompareRetailerSelection(
  remote: CompareRetailerSelection | undefined,
  local: CompareRetailerSelection | undefined,
): CompareRetailerSelection | undefined {
  if (remote && local) {
    return local.updatedAt > remote.updatedAt ? local : remote
  }
  return remote ?? local
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function formatCountryMoney(cents: number, country: CountryOption): string {
  try {
    return new Intl.NumberFormat(`en-${country.code}`, {
      currency: country.currencyCode,
      style: 'currency',
    }).format(cents / 100)
  } catch {
    return `${country.currencyCode} ${(cents / 100).toFixed(2)}`
  }
}

function formatCheckedAt(value: string): string {
  const checkedAt = new Date(value)
  if (Number.isNaN(checkedAt.getTime())) return 'just now'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(checkedAt)
}

