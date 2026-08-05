import { Calculator, Plus, Trash, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

const ENABLED_KEY = 'trolley-scout-shopper-calculator-enabled-v1'
const STATE_KEY = 'trolley-scout-shopper-calculator-state-v1'
const CHANGE_EVENT = 'trolley-scout-shopper-calculator-change'

interface CalculatorLine {
  id: string
  label: string
  priceCents: number
  quantity: number
}

interface CalculatorState {
  budgetCents?: number
  lines: CalculatorLine[]
}

function readEnabled() {
  return typeof window !== 'undefined' && window.localStorage.getItem(ENABLED_KEY) === 'true'
}

function setEnabledPreference(value: boolean) {
  window.localStorage.setItem(ENABLED_KEY, String(value))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function useEnabledPreference(): [boolean, (value: boolean) => void] {
  const [enabled, setEnabled] = useState(readEnabled)
  useEffect(() => {
    const update = () => setEnabled(readEnabled())
    window.addEventListener(CHANGE_EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(CHANGE_EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return [enabled, setEnabledPreference]
}

function readState(): CalculatorState {
  try {
    const decoded = JSON.parse(window.localStorage.getItem(STATE_KEY) ?? '{}') as Partial<CalculatorState>
    const lines = Array.isArray(decoded.lines)
      ? decoded.lines.filter((line): line is CalculatorLine => Boolean(
          line && typeof line.id === 'string' && typeof line.label === 'string' &&
          typeof line.priceCents === 'number' && line.priceCents > 0 &&
          typeof line.quantity === 'number' && line.quantity > 0,
        )).slice(0, 100)
      : []
    return {
      budgetCents: typeof decoded.budgetCents === 'number' && decoded.budgetCents >= 0
        ? Math.round(decoded.budgetCents)
        : undefined,
      lines,
    }
  } catch {
    return { lines: [] }
  }
}

function money(cents: number) {
  return `R${(Math.abs(cents) / 100).toFixed(2)}`
}

function cents(value: string) {
  const normalized = value.trim().replace(',', '.').replace(/[^0-9.-]/g, '')
  if (!normalized) return undefined
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : undefined
}

export function ShopperCalculatorSetting() {
  const [enabled, setEnabled] = useEnabledPreference()
  return (
    <section className="shopper-calculator-setting" aria-labelledby="shopper-calculator-setting-title">
      <div>
        <Calculator aria-hidden="true" size={22} />
        <span>
          <strong id="shopper-calculator-setting-title">Floating shopper calculator</strong>
          <small>Keep a budget, discounts, unit prices, and live trolley total one click away.</small>
        </span>
      </div>
      <label className="shopper-calculator-switch">
        <input
          aria-label="Floating shopper calculator"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" />
      </label>
    </section>
  )
}

export function FloatingShopperCalculator() {
  const [enabled] = useEnabledPreference()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<CalculatorState>(readState)
  const [label, setLabel] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [packUnits, setPackUnits] = useState('')
  const [budget, setBudget] = useState(() => state.budgetCents === undefined
    ? ''
    : (state.budgetCents / 100).toFixed(2))
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  const totalCents = useMemo(
    () => state.lines.reduce((total, line) => total + line.priceCents * line.quantity, 0),
    [state.lines],
  )
  const itemCount = state.lines.reduce((total, line) => total + line.quantity, 0)
  const enteredPrice = cents(price)
  const payCents = enteredPrice === undefined
    ? undefined
    : Math.round(enteredPrice * (100 - discount) / 100)
  const units = Number(packUnits.replace(',', '.'))
  const unitCents = payCents !== undefined && Number.isFinite(units) && units > 0
    ? Math.round(payCents / units)
    : undefined
  const remaining = state.budgetCents === undefined ? undefined : state.budgetCents - totalCents

  if (!enabled) return null

  function addItem() {
    const count = Number.parseInt(quantity, 10)
    if (payCents === undefined || payCents <= 0 || !Number.isFinite(count) || count < 1 || count > 99) return
    setState((current) => ({
      ...current,
      lines: [...current.lines, {
        id: `${Date.now()}-${current.lines.length}`,
        label: label.trim() || `Item ${current.lines.length + 1}`,
        priceCents: payCents,
        quantity: count,
      }],
    }))
    setLabel('')
    setPrice('')
    setQuantity('1')
    setPackUnits('')
    setDiscount(0)
  }

  function setShoppingBudget() {
    const value = budget.trim() ? cents(budget) : undefined
    if (budget.trim() && value === undefined) return
    setState((current) => ({ ...current, budgetCents: value }))
  }

  return (
    <>
      <button
        aria-label="Open shopper calculator"
        className="shopper-calculator-fab"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Calculator aria-hidden="true" size={27} />
        {itemCount > 0 && <span>{itemCount}</span>}
      </button>
      {open && (
        <div className="shopper-calculator-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            aria-label="Shopper calculator"
            aria-modal="true"
            className="shopper-calculator-panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span className="shopper-calculator-mark"><Calculator aria-hidden="true" size={24} /></span>
                <div><h2>Shopper calculator</h2><p>Track your trolley as you shop</p></div>
              </div>
              <button aria-label="Close calculator" onClick={() => setOpen(false)} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </header>

            <div className="shopper-calculator-summary">
              <span><small>TROLLEY TOTAL</small><strong>{money(totalCents)}</strong></span>
              <span><small>ITEMS</small><strong>{itemCount}</strong></span>
              <span className={remaining !== undefined && remaining < 0 ? 'is-over' : ''}>
                <small>{remaining !== undefined && remaining < 0 ? 'OVER BUDGET' : 'BUDGET LEFT'}</small>
                <strong>{remaining === undefined ? 'Set one' : money(remaining)}</strong>
              </span>
            </div>

            <div className="shopper-calculator-scroll">
              <section className="shopper-calculator-card">
                <h3>Stay on budget</h3>
                <p>See what remains before reaching the till.</p>
                <div className="shopper-calculator-row">
                  <label>Shopping budget<input inputMode="decimal" onChange={(event) => setBudget(event.target.value)} value={budget} /></label>
                  <button onClick={setShoppingBudget} type="button">Set</button>
                </div>
              </section>

              <section className="shopper-calculator-card">
                <h3>Add an item</h3>
                <p>Check a discount or unit price before it enters your total.</p>
                <label>Item name<input onChange={(event) => setLabel(event.target.value)} placeholder="Milk, bread, soap..." value={label} /></label>
                <div className="shopper-calculator-row">
                  <label>Shelf price<input inputMode="decimal" onChange={(event) => setPrice(event.target.value)} value={price} /></label>
                  <label>Quantity<input inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} value={quantity} /></label>
                </div>
                <span className="shopper-calculator-eyebrow">QUICK DISCOUNT</span>
                <div className="shopper-calculator-discounts">
                  {[0, 10, 20, 25, 30, 50].map((percent) => (
                    <button
                      aria-label={percent === 0 ? 'Use shelf price' : `${percent}% off`}
                      className={discount === percent ? 'is-active' : ''}
                      key={percent}
                      onClick={() => setDiscount(percent)}
                      type="button"
                    >
                      {percent === 0 ? 'Shelf price' : `-${percent}%`}
                    </button>
                  ))}
                </div>
                {payCents !== undefined && (
                  <strong className="shopper-calculator-pay">
                    {discount === 0 ? `Shelf price ${money(payCents)} each` : `Pay ${money(payCents)} each`}
                  </strong>
                )}
                <label>Pack size for unit check<input inputMode="decimal" onChange={(event) => setPackUnits(event.target.value)} placeholder="6 cans, 12 rolls, 1.5 kg" value={packUnits} />
                  <small>{unitCents === undefined ? 'Enter the number of units in one pack.' : `${money(unitCents)} per unit`}</small>
                </label>
                <button className="shopper-calculator-add" aria-label="Add item" onClick={addItem} type="button">
                  <Plus aria-hidden="true" size={18} />Add to trolley total
                </button>
              </section>

              <section className="shopper-calculator-card">
                <div className="shopper-calculator-card-head">
                  <div><h3>Your trolley</h3><p>{itemCount ? `${itemCount} items tracked` : 'Items you add will appear here.'}</p></div>
                  {state.lines.length > 0 && <button aria-label="Clear trolley" onClick={() => setState((current) => ({ ...current, lines: [] }))} type="button"><Trash aria-hidden="true" size={18} /></button>}
                </div>
                {state.lines.length === 0 ? <p>Start with the next item you pick up.</p> : (
                  <ul className="shopper-calculator-lines">
                    {state.lines.map((line) => (
                      <li key={line.id}>
                        <span><strong>{line.label}</strong><small>{money(line.priceCents)} × {line.quantity}</small></span>
                        <b>{money(line.priceCents * line.quantity)}</b>
                        <button aria-label={`Remove ${line.label}`} onClick={() => setState((current) => ({ ...current, lines: current.lines.filter((item) => item.id !== line.id) }))} type="button"><X aria-hidden="true" size={16} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
