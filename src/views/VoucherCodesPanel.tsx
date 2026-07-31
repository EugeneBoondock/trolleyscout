import { useEffect, useState } from 'react'
import { Check, Copy, ThumbsDown, ThumbsUp } from '@phosphor-icons/react'
import clsx from 'clsx'
import {
  loadVoucherCodes,
  rateVoucherCode,
  shareVoucherCode,
} from '../services/apiClient'
import type { VoucherCode } from '../types'

/**
 * Checkout codes: the thing you paste into a promo-code box.
 *
 * We cannot test a code at a retailer's checkout the way a browser extension
 * can, so nothing here is ever labelled "verified". What is shown instead is
 * how many shoppers it worked for, how recently, and where it came from. A
 * code enough people report as dead retires itself.
 */

export interface VoucherCodesPanelProps {
  isAuthenticated: boolean
  onRequireAuth: () => void
  retailerId?: string
  retailerOptions: Array<{ id: string; name: string }>
}

export function VoucherCodesPanel({
  isAuthenticated,
  onRequireAuth,
  retailerId,
  retailerOptions,
}: VoucherCodesPanelProps) {
  const [codes, setCodes] = useState<VoucherCode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copiedId, setCopiedId] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    loadVoucherCodes(retailerId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return
        setCodes(loaded)
        setIsLoading(false)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [retailerId])

  async function copy(voucherCode: VoucherCode) {
    try {
      await navigator.clipboard?.writeText(voucherCode.code)
      setCopiedId(voucherCode.id)
      setNotice(`${voucherCode.code} copied. Paste it at checkout.`)
      window.setTimeout(() => setCopiedId(''), 2_000)
    } catch {
      setNotice('Could not copy that code.')
    }
  }

  async function rate(voucherCode: VoucherCode, worked: boolean) {
    if (!isAuthenticated) {
      onRequireAuth()
      return
    }
    const updated = await rateVoucherCode(voucherCode.id, worked)
    if (!updated) {
      setNotice('Could not record that.')
      return
    }
    setCodes((current) =>
      current.map((entry) => (entry.id === updated.id ? updated : entry)))
    setNotice(worked ? 'Thanks, that helps the next shopper.' : 'Noted, thanks.')
  }

  return (
    <section aria-label="Checkout codes" className="voucher-codes">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Checkout codes</p>
          <h2>Codes to paste at checkout</h2>
          <p className="section-lede">
            Shared by shoppers and ranked by what actually worked. We cannot test these
            at the shop's till, so try the top one first and tell us how it went.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="section-lede">Loading codes…</p>
      ) : codes.length === 0 ? (
        <p className="section-lede">
          No codes for this shop yet. If you have one that works, share it below.
        </p>
      ) : (
        <ul className="voucher-code-list">
          {codes.map((voucherCode) => (
            <li className="voucher-code-row" key={voucherCode.id}>
              <div className="voucher-code-main">
                <code>{voucherCode.code}</code>
                <button
                  aria-label={`Copy code ${voucherCode.code}`}
                  onClick={() => void copy(voucherCode)}
                  type="button"
                >
                  {copiedId === voucherCode.id ? <Check size={16} /> : <Copy size={16} />}
                  {copiedId === voucherCode.id ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="voucher-code-benefit">{voucherCode.benefitText}</p>
              {voucherCode.minimumSpendText && (
                <p className="voucher-code-terms">{voucherCode.minimumSpendText}</p>
              )}
              <p className="voucher-code-confidence">
                {describeConfidence(voucherCode)}
                {voucherCode.source.startsWith('affiliate:') && (
                  <> · from {voucherCode.source.replace('affiliate:', '')}</>
                )}
              </p>
              <div className="voucher-code-vote">
                <span>Did it work?</span>
                <button
                  aria-label={`${voucherCode.code} worked`}
                  aria-pressed={voucherCode.yourVote === 'worked'}
                  className={clsx(voucherCode.yourVote === 'worked' && 'is-on')}
                  onClick={() => void rate(voucherCode, true)}
                  type="button"
                >
                  <ThumbsUp size={15} /> {voucherCode.workedCount}
                </button>
                <button
                  aria-label={`${voucherCode.code} did not work`}
                  aria-pressed={voucherCode.yourVote === 'failed'}
                  className={clsx(voucherCode.yourVote === 'failed' && 'is-on')}
                  onClick={() => void rate(voucherCode, false)}
                  type="button"
                >
                  <ThumbsDown size={15} /> {voucherCode.failedCount}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ShareCodeForm
        isAuthenticated={isAuthenticated}
        isSharing={isSharing}
        onRequireAuth={onRequireAuth}
        onShare={async (draft) => {
          setIsSharing(true)
          const result = await shareVoucherCode(draft)
          setIsSharing(false)
          if (result.issues?.length) {
            setNotice(result.issues[0])
            return false
          }
          setNotice('Thanks, your code is live for other shoppers.')
          setCodes(await loadVoucherCodes(retailerId))
          return true
        }}
        retailerId={retailerId}
        retailerOptions={retailerOptions}
      />

      {notice && <p aria-live="polite" className="voucher-code-notice">{notice}</p>}
    </section>
  )
}

/**
 * How much to trust a code, said plainly. No "verified" badge, because we have
 * verified nothing: these are other shoppers' reports.
 */
function describeConfidence(voucherCode: VoucherCode): string {
  const { failedCount, workedCount } = voucherCode
  if (workedCount === 0 && failedCount === 0) return 'Just shared, nobody has tried it yet'
  if (workedCount === 0) {
    return `Did not work for ${failedCount} ${failedCount === 1 ? 'shopper' : 'shoppers'}`
  }
  const suffix = failedCount > 0 ? `, failed for ${failedCount}` : ''
  return `Worked for ${workedCount} ${workedCount === 1 ? 'shopper' : 'shoppers'}${suffix}`
}

function ShareCodeForm({
  isAuthenticated,
  isSharing,
  onRequireAuth,
  onShare,
  retailerId,
  retailerOptions,
}: {
  isAuthenticated: boolean
  isSharing: boolean
  onRequireAuth: () => void
  onShare: (draft: {
    benefitText: string
    code: string
    minimumSpendText?: string
    retailerId: string
  }) => Promise<boolean>
  retailerId?: string
  retailerOptions: Array<{ id: string; name: string }>
}) {
  const [code, setCode] = useState('')
  const [benefitText, setBenefitText] = useState('')
  const [minimumSpendText, setMinimumSpendText] = useState('')
  const [shop, setShop] = useState(retailerId && retailerId !== 'all' ? retailerId : '')

  return (
    <form
      className="voucher-code-share"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!isAuthenticated) {
          onRequireAuth()
          return
        }
        const shared = await onShare({ benefitText, code, minimumSpendText, retailerId: shop })
        if (shared) {
          setCode('')
          setBenefitText('')
          setMinimumSpendText('')
        }
      }}
    >
      <h3>Share a code that worked</h3>
      <label>
        Shop
        <select onChange={(event) => setShop(event.target.value)} required value={shop}>
          <option value="">Choose a shop</option>
          {retailerOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
      </label>
      <label>
        Code
        <input
          onChange={(event) => setCode(event.target.value)}
          placeholder="SAVE20"
          required
          value={code}
        />
      </label>
      <label>
        What it gives you
        <input
          onChange={(event) => setBenefitText(event.target.value)}
          placeholder="20% off your order"
          required
          value={benefitText}
        />
      </label>
      <label>
        Minimum spend (optional)
        <input
          onChange={(event) => setMinimumSpendText(event.target.value)}
          placeholder="Spend R500 or more"
          value={minimumSpendText}
        />
      </label>
      <button className="primary-button" disabled={isSharing} type="submit">
        {isSharing ? 'Sharing…' : 'Share code'}
      </button>
    </form>
  )
}
