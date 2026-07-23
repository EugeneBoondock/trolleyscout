import {
  BookmarkSimple,
  Check,
  Copy,
  LinkSimple,
  Ticket,
  Trash,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ScoutMark } from '../components/ScoutMark'
import {
  safeVoucherImageUrl,
  safeVoucherRetailerUrl,
} from '../services/vouchers/voucherApi'
import type { Voucher } from '../services/vouchers/types'
import './VouchersView.css'

interface VoucherFeedback {
  kind: 'alert' | 'status'
  message: string
}

export function VouchersView({
  isAuthenticated,
  isLoading,
  onClaim,
  onRemove,
  onRequireAuth,
  vouchers,
}: {
  isAuthenticated: boolean
  isLoading: boolean
  onClaim: (voucherId: string) => void | Promise<void>
  onRemove: (voucherId: string) => void | Promise<void>
  onRequireAuth: () => void
  vouchers: Voucher[]
}) {
  const [query, setQuery] = useState('')
  const [retailerId, setRetailerId] = useState('all')
  const [savedOnly, setSavedOnly] = useState(false)
  const [copiedId, setCopiedId] = useState<string>()
  const [feedback, setFeedback] = useState<VoucherFeedback>()
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const copiedTimerRef = useRef<number | undefined>(undefined)
  const pendingIdsRef = useRef(new Set<string>())
  const retailers = useMemo(
    () => [...new Set(vouchers.map((voucher) => voucher.retailerId))].sort(),
    [vouchers],
  )
  const filtered = vouchers.filter((voucher) => {
    const haystack = [
      voucher.title,
      voucher.benefitText,
      voucher.retailerId,
      voucher.code ?? '',
    ].join(' ').toLowerCase()
    return (!query.trim() || haystack.includes(query.trim().toLowerCase())) &&
      (retailerId === 'all' || voucher.retailerId === retailerId) &&
      (!savedOnly || voucher.claimed)
  })

  useEffect(() => () => {
    if (copiedTimerRef.current !== undefined) {
      window.clearTimeout(copiedTimerRef.current)
    }
  }, [])

  async function copyCode(voucher: Voucher) {
    const code = publicVoucherCode(voucher)
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (!code || !clipboard?.writeText) {
      setCopiedId(undefined)
      setFeedback({ kind: 'alert', message: 'Could not copy this voucher code.' })
      return
    }

    try {
      await clipboard.writeText(code)
      setCopiedId(voucher.id)
      setFeedback({ kind: 'status', message: 'Voucher code copied.' })
      if (copiedTimerRef.current !== undefined) {
        window.clearTimeout(copiedTimerRef.current)
      }
      copiedTimerRef.current = window.setTimeout(
        () => setCopiedId((current) => current === voucher.id ? undefined : current),
        2_000,
      )
    } catch {
      setCopiedId(undefined)
      setFeedback({ kind: 'alert', message: 'Could not copy this voucher code.' })
    }
  }

  async function updateSavedVoucher(voucher: Voucher) {
    if (!isAuthenticated) {
      onRequireAuth()
      return
    }
    if (pendingIdsRef.current.has(voucher.id)) {
      return
    }

    pendingIdsRef.current.add(voucher.id)
    setPendingIds(new Set(pendingIdsRef.current))
    try {
      if (voucher.claimed) {
        await onRemove(voucher.id)
        setFeedback({ kind: 'status', message: 'Saved voucher removed.' })
      } else {
        await onClaim(voucher.id)
        setFeedback({ kind: 'status', message: 'Voucher saved.' })
      }
    } catch {
      setFeedback({ kind: 'alert', message: 'Could not update this saved voucher.' })
    } finally {
      pendingIdsRef.current.delete(voucher.id)
      setPendingIds(new Set(pendingIdsRef.current))
    }
  }

  return (
    <section aria-busy={isLoading} className="voucher-board" aria-label="Current vouchers">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Voucher scout</p>
          <h1>Current retailer vouchers</h1>
          <p>
            Verified public codes, product coupons, and loyalty offers from official retailer
            sources. Personal single-use codes are never stored.
          </p>
        </div>
        <Ticket size={30} weight="duotone" />
      </div>

      <div className="voucher-filter-bar">
        <label>
          Search vouchers
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Benefit, retailer, or code"
            type="search"
            value={query}
          />
        </label>
        <label>
          Retailer
          <select onChange={(event) => setRetailerId(event.target.value)} value={retailerId}>
            <option value="all">All retailers</option>
            {retailers.map((retailer) => (
              <option key={retailer} value={retailer}>{formatRetailer(retailer)}</option>
            ))}
          </select>
        </label>
        <label className="deal-filter-check">
          <input
            checked={savedOnly}
            onChange={(event) => setSavedOnly(event.target.checked)}
            type="checkbox"
          />
          Saved only
        </label>
      </div>

      <p aria-atomic="true" aria-live="polite" className="voucher-result-status">
        {isLoading
          ? 'Loading current vouchers.'
          : filtered.length + (filtered.length === 1 ? ' voucher shown.' : ' vouchers shown.')}
      </p>

      {feedback && (
        <p
          aria-atomic="true"
          aria-live={feedback.kind === 'alert' ? 'assertive' : 'polite'}
          className={'voucher-feedback voucher-feedback-' + feedback.kind}
          role={feedback.kind}
        >
          {feedback.message}
        </p>
      )}

      {isLoading ? (
        <div className="loading-strip" role="status">
          <ScoutMark motion="spin" size={28} />
          Loading current vouchers
        </div>
      ) : filtered.length === 0 ? (
        <div aria-live="polite" className="empty-panel" role="status">
          <Ticket size={42} />
          <p>No vouchers match those filters.</p>
        </div>
      ) : (
        <div className="voucher-grid">
          {filtered.map((voucher) => {
            const code = publicVoucherCode(voucher)
            const imageUrl = voucher.imageUrl
              ? safeVoucherImageUrl(voucher.imageUrl)
              : undefined
            const redemptionUrl = safeVoucherRetailerUrl(
              voucher.redemptionUrl,
              voucher.retailerId,
            )
            const isPending = pendingIds.has(voucher.id)
            const actionLabel = isPending
              ? voucher.claimed ? 'Removing saved voucher' : 'Saving voucher'
              : voucher.claimed ? 'Remove saved voucher' : 'Save voucher'

            return (
              <article className="voucher-card" key={voucher.id}>
                {imageUrl ? (
                  <img
                    alt=""
                    className="voucher-image"
                    loading="lazy"
                    onError={(event) => { event.currentTarget.hidden = true }}
                    referrerPolicy="no-referrer"
                    src={imageUrl}
                  />
                ) : (
                  <span className="voucher-image voucher-image-fallback">
                    <Ticket size={28} />
                  </span>
                )}
                <div className="voucher-card-body">
                  <div className="voucher-card-meta">
                    <span>{formatRetailer(voucher.retailerId)}</span>
                    <span>{formatVoucherKind(voucher.voucherKind)}</span>
                  </div>
                  <h3>{cleanUiText(voucher.title)}</h3>
                  <p className="voucher-benefit">{cleanUiText(voucher.benefitText)}</p>
                  {code && (
                    <div className="voucher-code">
                      <code style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{code}</code>
                      <button
                        aria-label={copiedId === voucher.id
                          ? 'Voucher code copied'
                          : 'Copy voucher code ' + code}
                        onClick={() => void copyCode(voucher)}
                        type="button"
                      >
                        {copiedId === voucher.id ? <Check size={16} /> : <Copy size={16} />}
                        {copiedId === voucher.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  )}
                  <p className="voucher-terms">
                    {voucher.validTo
                      ? 'Valid until ' + formatDate(voucher.validTo)
                      : 'Recently verified'}
                    {voucher.accountRequired ? ' | Retailer account required' : ''}
                  </p>
                  <div className="voucher-actions">
                    <button
                      aria-busy={isPending || undefined}
                      aria-label={actionLabel}
                      className={voucher.claimed ? 'ghost-button' : 'primary-button'}
                      disabled={isPending}
                      onClick={() => void updateSavedVoucher(voucher)}
                      type="button"
                    >
                      {voucher.claimed ? <Trash size={16} /> : <BookmarkSimple size={16} />}
                      {isPending
                        ? voucher.claimed ? 'Removing' : 'Saving'
                        : voucher.claimed ? 'Remove saved' : 'Save voucher'}
                    </button>
                    {redemptionUrl && (
                      <a
                        className="ghost-button"
                        href={redemptionUrl}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Redeem at retailer
                        <LinkSimple size={16} />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function publicVoucherCode(voucher: Voucher) {
  const code = voucher.code?.trim()
  if (!voucher.publicReusable || !code || code.length > 100 || hasUnsafeSourceCharacters(code)) {
    return undefined
  }
  return code
}

function cleanUiText(value: string) {
  return replaceAsciiControlCharacters(value)
    .replace(/\u00e2\u20ac\u201d/g, ': ')
    .replace(/\s*\u2014\s*/g, ': ')
    .replace(/[\u202a-\u202e\u2066-\u2069]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasUnsafeSourceCharacters(value: string) {
  return value.includes('\u00e2\u20ac\u201d') ||
    value.includes('\u2014') ||
    /[\u202a-\u202e\u2066-\u2069]/i.test(value) ||
    hasAsciiControlCharacter(value)
}

function replaceAsciiControlCharacters(value: string) {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127 ? ' ' : character
  }).join('')
}

function hasAsciiControlCharacter(value: string) {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}

function formatRetailer(value: string) {
  const cleanValue = cleanUiText(value)
  if (!cleanValue) {
    return 'Retailer'
  }
  return cleanValue
    .split('-')
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : part)
    .join(' ')
    .replace(/\bZa\b/, 'ZA')
}

function formatVoucherKind(value: Voucher['voucherKind']) {
  if (value === 'public_code') {
    return 'Public code'
  }
  if (value === 'product_coupon') {
    return 'Product coupon'
  }
  return 'Loyalty offer'
}

function formatDate(value: string) {
  let date: Date
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    const calendarDate = new Date(Date.UTC(year, month - 1, day))
    if (calendarDate.getUTCFullYear() !== year ||
      calendarDate.getUTCMonth() !== month - 1 ||
      calendarDate.getUTCDate() !== day) {
      return 'Date unavailable'
    }
    date = new Date(value + 'T12:00:00+02:00')
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
