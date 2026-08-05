import { Flag, X } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import type { DiscoveredDeal, DealReportReason } from '../types'
import { reportDeal } from '../services/apiClient'

const reasons: Array<{ label: string; value: DealReportReason }> = [
  { label: 'Price is wrong', value: 'price_wrong' },
  { label: 'Offer has ended', value: 'expired' },
  { label: 'Item is unavailable', value: 'unavailable' },
  { label: 'Wrong item or description', value: 'wrong_item' },
  { label: 'Something else', value: 'other' },
]

export function DealReportButton({ deal }: { deal: DiscoveredDeal }) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<DealReportReason>('price_wrong')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const close = () => {
    if (status === 'saving') return
    setOpen(false)
    setStatus('idle')
    setMessage('')
  }

  const submit = async () => {
    setStatus('saving')
    setMessage('')
    try {
      await reportDeal({
        dealId: deal.id,
        note: note.trim() || undefined,
        productUrl: deal.productUrl || undefined,
        reason,
        retailerId: deal.retailerId,
        retailerName: deal.retailerName,
        sourceUrl: deal.sourceUrl,
        title: deal.title,
      })
      setStatus('saved')
      setMessage('Report received. An admin can now review it against the source.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'The report could not be saved.')
    }
  }

  return (
    <>
      <button className="deal-report-trigger" onClick={() => setOpen(true)} type="button">
        <Flag aria-hidden="true" size={15} />
        Report issue
      </button>
      {open && (
        <div className="deal-report-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) close()
        }}>
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="deal-report-dialog"
            role="dialog"
          >
            <header>
              <div>
                <p className="eyebrow">Deal accuracy</p>
                <h2 id={titleId}>Report an issue</h2>
              </div>
              <button aria-label="Close report" disabled={status === 'saving'} onClick={close} type="button">
                <X size={20} />
              </button>
            </header>
            {status === 'saved' ? (
              <div className="deal-report-success" role="status">
                <Flag aria-hidden="true" size={28} weight="fill" />
                <strong>Thanks for checking the deal.</strong>
                <p>{message}</p>
                <button className="primary-button" onClick={close} type="button">Done</button>
              </div>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
                <p className="deal-report-product">
                  <strong>{deal.retailerName}</strong>
                  <span>{deal.title}</span>
                </p>
                <fieldset>
                  <legend>What needs checking?</legend>
                  {reasons.map((option) => (
                    <label key={option.value}>
                      <input
                        checked={reason === option.value}
                        name={`deal-report-${deal.id}`}
                        onChange={() => setReason(option.value)}
                        type="radio"
                        value={option.value}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="deal-report-note">
                  <span>{reason === 'other' ? 'Short note' : 'Short note (optional)'}</span>
                  <textarea
                    maxLength={500}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Tell the reviewer what you found"
                    required={reason === 'other'}
                    rows={3}
                    value={note}
                  />
                </label>
                <p className="deal-report-source">The reviewer receives the retailer source link shown with this deal.</p>
                {message && <p className="write-notice" role="alert">{message}</p>}
                <div className="deal-report-actions">
                  <button className="ghost-button" disabled={status === 'saving'} onClick={close} type="button">Cancel</button>
                  <button className="primary-button" disabled={status === 'saving'} type="submit">
                    {status === 'saving' ? 'Sending report' : 'Send report'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
