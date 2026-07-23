import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MagnifyingGlass, Plus, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import { compareShops, formatCents, parsePriceInput } from '../services/shopCompare'
import {
  loadRetailers,
  readMemberState,
  searchProductPrices,
  setMemberState,
} from '../services/apiClient'
import type { CountryOption, ProductComparisonResult, Retailer } from '../types'

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
            Search the same product across selected stores, or compare a full shopping list side
            by side.
          </p>
        </div>
      </section>
      <AutoShopCompare preferenceOwnerId={preferenceOwnerId} />
      <ShopCompare />
    </div>
  )
}

interface CompareRow {
  id: string
  name: string
  prices: string[]
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
  // undefined until the store list loads; [] afterwards is a real "none
  // picked" choice, so deselecting every store must not resurrect defaults.
  const [selectedIds, setSelectedIds] = useState<string[] | undefined>()
  const [result, setResult] = useState<ProductComparisonResult | undefined>()
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

  function toggleStore(id: string) {
    setResult(undefined)
    setError('')
    if (!stores.includes(id) && stores.length >= MAX_COMPARE_RETAILERS) {
      setError(`Choose up to ${MAX_COMPARE_RETAILERS} stores at a time.`)
      return
    }
    const next = stores.includes(id)
      ? stores.filter((storeId) => storeId !== id)
      : [...stores, id]
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

  const canCompare = query.trim().length > 1 && stores.length >= 2 && !isSearching

  return (
    <section className="shop-compare auto-compare" aria-label="Automatic price comparison">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Compare a product across stores</h1>
          <p className="section-lede">
            Pick the stores you shop at and type what you are buying. We search regular products
            and promotions at those stores now, using retailer product search where available.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="section-lede">Loading stores available in your country…</p>
      ) : storeOptions.length === 0 ? (
        <p className="section-lede">No stores are available right now. Try again shortly.</p>
      ) : (
        <>
          <fieldset className="auto-compare-stores">
            <legend>Stores shown in compare ({stores.length} selected)</legend>
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

          <div className="auto-compare-controls">
            <input
              aria-label="Item to compare"
              className="auto-compare-query"
              onChange={(event) => {
                setQuery(event.target.value)
                setResult(undefined)
                setError('')
              }}
              placeholder="e.g. white bread"
              value={query}
            />
            <button
              className="primary-button"
              disabled={!canCompare}
              onClick={compare}
              type="button"
            >
              <MagnifyingGlass size={16} weight="bold" />
              {isSearching ? 'Searching stores…' : 'Compare'}
            </button>
          </div>

          {stores.length < 2 && (
            <p className="section-lede">Pick at least two stores to compare.</p>
          )}

          {error && <p className="compare-verdict" role="alert">{error}</p>}
          {result && <AutoCompareResult result={result} />}
        </>
      )}
    </section>
  )
}

function AutoCompareResult({ result }: { result: ProductComparisonResult }) {
  const cheapest = result.matches.find((match) => match.retailerId === result.cheapestRetailerId)

  return (
    <div className="auto-compare-result">
      <ul className="auto-compare-list">
        {result.matches.map((match) => (
          <li
            className={clsx('auto-compare-row', match.isCheapest && 'is-cheapest')}
            key={match.retailerId}
          >
            <span className="auto-compare-store-name">{match.retailerName}</span>
            {match.status === 'unavailable' ? (
              <span className="auto-compare-missing">
                This store has no public price search we can read. Check in store.
              </span>
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
                ) : (
                  <span className="auto-compare-price">
                    {formatCountryMoney(match.priceCents, result.country)}
                  </span>
                )}
              </>
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

const DEFAULT_SHOPS = ['Shop A', 'Shop B']
let compareCounter = 0

function blankCompareRow(shopCount: number): CompareRow {
  compareCounter += 1
  return { id: `row-${compareCounter}`, name: '', prices: Array.from({ length: shopCount }, () => '') }
}

function ShopCompare() {
  const [shops, setShops] = useState<string[]>(DEFAULT_SHOPS)
  const [rows, setRows] = useState<CompareRow[]>(() => [
    blankCompareRow(2),
    blankCompareRow(2),
    blankCompareRow(2),
  ])

  const comparison = compareShops(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      priceCents: row.prices.map((price) => parsePriceInput(price)),
    })),
    shops.length,
  )

  function updateShopName(index: number, value: string) {
    setShops((current) => current.map((name, i) => (i === index ? value : name)))
  }

  function updatePrice(rowId: string, shopIndex: number, value: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? { ...row, prices: row.prices.map((price, i) => (i === shopIndex ? value : price)) }
          : row,
      ),
    )
  }

  function updateName(rowId: string, value: string) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, name: value } : row)))
  }

  function addRow() {
    setRows((current) => [...current, blankCompareRow(shops.length)])
  }

  function removeRow(rowId: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.id !== rowId) : current))
  }

  function addShop() {
    if (shops.length >= 4) {
      return
    }
    setShops((current) => [...current, `Shop ${String.fromCharCode(65 + current.length)}`])
    setRows((current) => current.map((row) => ({ ...row, prices: [...row.prices, ''] })))
  }

  function clearAll() {
    setShops(DEFAULT_SHOPS)
    setRows([blankCompareRow(2), blankCompareRow(2), blankCompareRow(2)])
  }

  return (
    <section className="shop-compare" aria-label="Shop price comparison">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Which shop is cheapest?</h1>
          <p className="section-lede">
            Punch in the same items at each shop and see which one is cheapest for your whole
            list, plus who has the best price on each item. Nothing is saved, it clears when you
            leave.
          </p>
        </div>
        <button className="ghost-button" onClick={clearAll} type="button">
          Clear
        </button>
      </div>

      <div className="compare-grid" style={{ '--shop-count': shops.length } as CSSProperties}>
        <div className="compare-head">Item</div>
        {shops.map((shop, index) => (
          <input
            aria-label={`Shop ${index + 1} name`}
            className={clsx('compare-shop-name', comparison.cheapestShopIndex === index && 'is-cheapest')}
            key={index}
            onChange={(event) => updateShopName(index, event.target.value)}
            value={shop}
          />
        ))}

        {rows.map((row) => (
          <div className="compare-row-contents" key={row.id}>
            <div className="compare-item-cell">
              <input
                aria-label="Item name"
                onChange={(event) => updateName(row.id, event.target.value)}
                placeholder="e.g. Milk 2L"
                value={row.name}
              />
              {rows.length > 1 && (
                <button aria-label="Remove item" className="icon-button" onClick={() => removeRow(row.id)} type="button">
                  <Trash size={14} />
                </button>
              )}
            </div>
            {shops.map((_, shopIndex) => {
              const isCheapest = rowsCheapest(rows, row.id, shopIndex, comparison.cheapestShopByItem)

              return (
                <input
                  aria-label={`${row.name || 'Item'} price at shop ${shopIndex + 1}`}
                  className={clsx('compare-price', isCheapest && 'is-cheapest')}
                  inputMode="decimal"
                  key={shopIndex}
                  onChange={(event) => updatePrice(row.id, shopIndex, event.target.value)}
                  placeholder="R 0,00"
                  value={row.prices[shopIndex] ?? ''}
                />
              )
            })}
          </div>
        ))}

        <div className="compare-totals-label">Total</div>
        {comparison.shopTotals.map((shop) => (
          <div
            className={clsx('compare-total', comparison.cheapestShopIndex === shop.shopIndex && 'is-cheapest')}
            key={shop.shopIndex}
          >
            {shop.totalCents > 0 ? formatCents(shop.totalCents) : '·'}
            {shop.missingItemCount > 0 && <small>{shop.missingItemCount} missing</small>}
          </div>
        ))}
      </div>

      <div className="compare-actions">
        <button className="ghost-button" onClick={addRow} type="button">
          <Plus size={16} /> Add item
        </button>
        {shops.length < 4 && (
          <button className="ghost-button" onClick={addShop} type="button">
            <Plus size={16} /> Add shop
          </button>
        )}
      </div>

      {comparison.cheapestShopIndex !== undefined && comparison.savingsCents > 0 && (
        <div className="compare-verdict" role="status">
          <strong>{shops[comparison.cheapestShopIndex] || `Shop ${comparison.cheapestShopIndex + 1}`}</strong>{' '}
          is cheapest for this list, saving you {formatCents(comparison.savingsCents)}
          {comparison.hasCompleteShop ? '' : ' (some items are not priced everywhere)'}.
        </div>
      )}
    </section>
  )
}

function rowsCheapest(
  rows: CompareRow[],
  rowId: string,
  shopIndex: number,
  cheapestByItem: Array<number | undefined>,
): boolean {
  // cheapestByItem is aligned to the *priced* rows in draft order.
  const pricedRowIds = rows
    .filter((row) => row.prices.some((price) => parsePriceInput(price) !== undefined))
    .map((row) => row.id)
  const pricedIndex = pricedRowIds.indexOf(rowId)
  return pricedIndex >= 0 && cheapestByItem[pricedIndex] === shopIndex
}
