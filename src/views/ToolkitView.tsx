import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Calculator, MagnifyingGlass, Plus, Trash, WifiSlash } from '@phosphor-icons/react'
import clsx from 'clsx'
import {
  compareUnitPrices,
  formatUnitPrice,
  type PackDraft,
  type PackUnit,
} from '../services/unitPrice'
import { compareShops, formatCents, parsePriceInput } from '../services/shopCompare'
import { autoComparePrices, type AutoComparison } from '../services/priceCompare'
import { loadDiscovery } from '../services/apiClient'
import type { DiscoveredDeal } from '../types'

const unitOptions: Array<{ label: string; value: PackUnit }> = [
  { label: 'g', value: 'g' },
  { label: 'kg', value: 'kg' },
  { label: 'ml', value: 'ml' },
  { label: 'litre', value: 'l' },
  { label: 'items', value: 'each' },
]

const MAX_PACKS = 4

let packCounter = 2

function blankPack(id: string): PackDraft {
  return { id, priceText: '', quantityText: '', unit: 'kg' }
}

export function ToolkitView() {
  const [packs, setPacks] = useState<PackDraft[]>([blankPack('pack-1'), blankPack('pack-2')])

  const comparison = compareUnitPrices(packs)
  const best = comparison.results.find((result) => result.isBest)
  const others = comparison.results.filter((result) => !result.isBest)

  function updatePack(id: string, field: 'priceText' | 'quantityText' | 'unit', value: string) {
    setPacks((current) =>
      current.map((pack) => (pack.id === id ? { ...pack, [field]: value } : pack)),
    )
  }

  function addPack() {
    packCounter += 1
    setPacks((current) =>
      current.length >= MAX_PACKS ? current : [...current, blankPack(`pack-${packCounter}`)],
    )
  }

  function removePack(id: string) {
    setPacks((current) => (current.length > 2 ? current.filter((pack) => pack.id !== id) : current))
  }

  return (
    <div className="toolkit-view">
      <section className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Unit price checker</h1>
          <p className="section-lede">
            The big pack is not always the cheap pack. Type in the shelf price and size of each
            option, and see which one really costs less per kilogram, litre, or item.
          </p>
        </div>
      </section>

      <div className="offline-note" role="note">
        <WifiSlash size={18} />
        <p>Works without signal once the page has loaded. Use it right in the aisle.</p>
      </div>

      <section className="unit-checker" aria-label="Pack comparison">
        <div className="unit-pack-list">
          {packs.map((pack, index) => {
            const result = comparison.results.find((row) => row.id === pack.id)

            return (
              <article
                className={clsx('unit-pack-card', result?.isBest && !comparison.hasMixedUnits && comparison.results.length > 1 && 'is-best')}
                key={pack.id}
              >
                <header>
                  <strong>Pack {index + 1}</strong>
                  {result?.isBest && !comparison.hasMixedUnits && comparison.results.length > 1 && (
                    <span className="best-tag">Cheapest</span>
                  )}
                  {packs.length > 2 && (
                    <button
                      aria-label={`Remove pack ${index + 1}`}
                      className="icon-button"
                      onClick={() => removePack(pack.id)}
                      type="button"
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </header>

                <div className="unit-pack-fields">
                  <label className="field">
                    Price
                    <input
                      inputMode="decimal"
                      onChange={(event) => updatePack(pack.id, 'priceText', event.target.value)}
                      placeholder="R 0,00"
                      value={pack.priceText}
                    />
                  </label>
                  <label className="field">
                    Size
                    <input
                      inputMode="decimal"
                      onChange={(event) => updatePack(pack.id, 'quantityText', event.target.value)}
                      placeholder="0"
                      value={pack.quantityText}
                    />
                  </label>
                  <label className="field">
                    Unit
                    <select
                      onChange={(event) => updatePack(pack.id, 'unit', event.target.value)}
                      value={pack.unit}
                    >
                      {unitOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <footer className="unit-pack-result">
                  {result ? (
                    <strong>{formatUnitPrice(result.unitPriceCents, result.baseUnit)}</strong>
                  ) : (
                    <span>Enter price and size</span>
                  )}
                </footer>
              </article>
            )
          })}
        </div>

        {packs.length < MAX_PACKS && (
          <button className="ghost-button" onClick={addPack} type="button">
            <Plus size={16} />
            Add another pack
          </button>
        )}

        <div className="unit-verdict" aria-live="polite">
          {comparison.hasMixedUnits ? (
            <p>
              These packs use different kinds of units (weight vs volume vs items), so they cannot
              be compared directly. Use the same unit type for every pack.
            </p>
          ) : best && others.length > 0 ? (
            <p>
              <strong>
                Pack {packs.findIndex((pack) => pack.id === best.id) + 1} is the best value
              </strong>{' '}
              at {formatUnitPrice(best.unitPriceCents, best.baseUnit)}.
              {others.map((other) => {
                const packNumber = packs.findIndex((pack) => pack.id === other.id) + 1

                return (
                  <span key={other.id}>
                    {' '}
                    Pack {packNumber} costs{' '}
                    {other.percentMoreThanBest !== undefined
                      ? `${other.percentMoreThanBest}% more`
                      : 'more'}{' '}
                    per {other.baseUnit === 'each' ? 'item' : other.baseUnit}.
                  </span>
                )
              })}
            </p>
          ) : (
            <p>
              <Calculator size={18} /> Fill in at least two packs to compare them.
            </p>
          )}
        </div>
      </section>

      <AutoShopCompare />
      <ShopCompare />

      <section className="shelf-tips" aria-label="Shelf tips">
        <h2>Three shelf habits that save real money</h2>
        <ul>
          <li>
            <strong>Read the small grey price.</strong> Most shelf labels already show a price per
            kg or per 100g in small print. It is the only number that lets you compare fairly.
          </li>
          <li>
            <strong>Check the member price.</strong> If the shelf shows two prices, the lower one
            usually needs the store’s free loyalty card. Signing up costs nothing.
          </li>
          <li>
            <strong>Compare across brands, not just sizes.</strong> House brands are often the
            same product from the same factory at a lower price per unit.
          </li>
        </ul>
      </section>
    </div>
  )
}

interface CompareRow {
  id: string
  name: string
  prices: string[]
}

// Auto compare: the shopper picks real stores we hold deals for, types an
// item, and we search our own deal database for each store's price. Two stores
// by default because that is the common "here or there?" question, but any
// number can be compared.
const DEFAULT_STORE_COUNT = 2

function AutoShopCompare() {
  const [deals, setDeals] = useState<DiscoveredDeal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [result, setResult] = useState<AutoComparison | undefined>()

  useEffect(() => {
    const controller = new AbortController()

    loadDiscovery(controller.signal)
      .then((state) => {
        if (controller.signal.aborted) {
          return
        }
        setDeals(state.data?.discovery.deals ?? [])
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))

    return () => controller.abort()
  }, [])

  // Only offer stores we can actually price against right now.
  const storeOptions = Array.from(
    deals
      .reduce((map, deal) => {
        if (!map.has(deal.retailerId)) {
          map.set(deal.retailerId, deal.retailerName)
        }
        return map
      }, new Map<string, string>())
      .entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Preselect the first couple of stores so the tool is usable immediately.
  const stores = selectedIds.length > 0
    ? selectedIds
    : storeOptions.slice(0, DEFAULT_STORE_COUNT).map((store) => store.id)

  function toggleStore(id: string) {
    setResult(undefined)
    setSelectedIds((current) => {
      const base = current.length > 0
        ? current
        : storeOptions.slice(0, DEFAULT_STORE_COUNT).map((store) => store.id)
      return base.includes(id) ? base.filter((storeId) => storeId !== id) : [...base, id]
    })
  }

  function compare() {
    const chosen = storeOptions.filter((store) => stores.includes(store.id))
    setResult(autoComparePrices(deals, query, chosen))
  }

  const canCompare = query.trim().length > 1 && stores.length >= 2

  return (
    <section className="shop-compare auto-compare" aria-label="Automatic price comparison">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Tools</p>
          <h1>Compare a product across stores</h1>
          <p className="section-lede">
            Pick the stores you shop at, type what you are buying, and we check our deal
            database for each store's price. Compare two stores or as many as you like.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="section-lede">Loading the stores we have prices for…</p>
      ) : storeOptions.length === 0 ? (
        <p className="section-lede">No store prices are loaded right now. Try again shortly.</p>
      ) : (
        <>
          <fieldset className="auto-compare-stores">
            <legend>Stores to compare ({stores.length} picked)</legend>
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
              <MagnifyingGlass size={16} weight="bold" /> Compare
            </button>
          </div>

          {stores.length < 2 && (
            <p className="section-lede">Pick at least two stores to compare.</p>
          )}

          {result && <AutoCompareResult result={result} />}
        </>
      )}
    </section>
  )
}

function AutoCompareResult({ result }: { result: AutoComparison }) {
  if (result.foundCount === 0) {
    return (
      <p className="compare-verdict">
        No current deals match “{result.query}” at the stores you picked. Try a simpler word, or
        add it to your watchlist and we will tell you when it goes on special.
      </p>
    )
  }

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
            {match.priceCents === undefined ? (
              <span className="auto-compare-missing">No match found</span>
            ) : (
              <>
                <span className="auto-compare-title">{match.deal?.title}</span>
                <span className="auto-compare-price">{formatCents(match.priceCents)}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      {cheapest && (
        <p className="compare-verdict">
          <strong>{cheapest.retailerName}</strong> is cheapest for “{result.query}”
          {result.savingsCents > 0 && <>, saving you {formatCents(result.savingsCents)}</>}.
          {result.missingCount > 0 && (
            <> We hold no match at {result.missingCount} of the stores you picked.</>
          )}
        </p>
      )}
    </div>
  )
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
