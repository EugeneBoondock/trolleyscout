import { ArrowClockwise, CheckCircle, Flag, LinkSimple, XCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { loadAdminDealReports, reviewAdminDealReport } from '../services/apiClient'
import type { DealReport } from '../types'

const reasonLabels: Record<DealReport['reason'], string> = {
  expired: 'Offer has ended',
  other: 'Other issue',
  price_wrong: 'Price is wrong',
  unavailable: 'Item is unavailable',
  wrong_item: 'Wrong item or description',
}

export function AdminDealReportsPanel() {
  const [reports, setReports] = useState<DealReport[]>([])
  const [message, setMessage] = useState('Loading deal reports.')
  const [pendingId, setPendingId] = useState('')

  const load = async () => {
    setMessage('Loading deal reports.')
    try {
      const next = await loadAdminDealReports('pending')
      setReports(next)
      setMessage(next.length === 0 ? 'No deal reports need review.' : '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Deal reports could not be loaded.')
    }
  }

  useEffect(() => { void load() }, [])

  const review = async (
    id: string,
    status: 'confirmed' | 'dismissed' | 'resolved',
  ) => {
    setPendingId(id)
    setMessage('')
    try {
      const next = await reviewAdminDealReport(id, status)
      setReports(next)
      setMessage(next.length === 0 ? 'The review queue is clear.' : '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The report could not be reviewed.')
    } finally {
      setPendingId('')
    }
  }

  return (
    <section className="admin-deal-reports" aria-label="Deal report moderation">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deal accuracy</p>
          <h2>Shopper reports</h2>
          <p>Check each claim against the saved retailer source before changing a deal.</p>
        </div>
        <button className="ghost-button" disabled={message === 'Loading deal reports.'} onClick={() => void load()} type="button">
          <ArrowClockwise size={17} />
          Refresh
        </button>
      </div>

      {message && <div className="write-notice" role="status">{message}</div>}
      <div className="admin-deal-report-list">
        {reports.map((report) => (
          <article className="admin-deal-report-card" key={report.id}>
            <header>
              <span><Flag size={18} weight="fill" /> {reasonLabels[report.reason]}</span>
              <small>{new Date(report.createdAt).toLocaleString('en-ZA')}</small>
            </header>
            <h3>{report.title}</h3>
            <p className="admin-deal-report-store">{report.retailerName} · {report.countryCode}</p>
            {report.note && <blockquote>{report.note}</blockquote>}
            <div className="admin-deal-report-links">
              <a href={report.sourceUrl} rel="noreferrer" target="_blank">
                Retailer source <LinkSimple size={14} />
              </a>
              {report.productUrl && (
                <a href={report.productUrl} rel="noreferrer" target="_blank">
                  Product page <LinkSimple size={14} />
                </a>
              )}
            </div>
            <footer>
              <button
                className="ghost-button"
                disabled={pendingId === report.id}
                onClick={() => void review(report.id, 'dismissed')}
                type="button"
              >
                <XCircle size={17} /> Dismiss
              </button>
              <button
                className="primary-button"
                disabled={pendingId === report.id}
                onClick={() => void review(report.id, 'confirmed')}
                type="button"
              >
                <CheckCircle size={17} /> Confirm issue
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}
