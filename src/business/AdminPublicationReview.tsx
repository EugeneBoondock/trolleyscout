import { useEffect, useState } from 'react'
import {
  ArrowSquareOut,
  CheckCircle,
  Storefront,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import {
  BusinessApiError,
  loadOrganizationPublicationReviewQueue,
  reviewOrganizationPublication,
} from './api'
import type { BusinessPublication } from './types'

type ReviewDecision = 'approved' | 'changes_requested' | 'rejected'

export function AdminPublicationReview() {
  const [publications, setPublications] = useState<BusinessPublication[]>()
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string>()
  const [issues, setIssues] = useState<string[]>([])

  useEffect(() => {
    const controller = new AbortController()
    loadOrganizationPublicationReviewQueue()
      .then(setPublications)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setIssues(
          error instanceof BusinessApiError
            ? error.issues
            : ['The business review queue could not be loaded.'],
        )
        setPublications([])
      })
    return () => controller.abort()
  }, [])

  async function decide(publication: BusinessPublication, decision: ReviewDecision) {
    setPendingId(publication.id)
    setIssues([])
    try {
      const result = await reviewOrganizationPublication(
        publication.id,
        decision,
        notes[publication.id]?.trim() || undefined,
      )
      setPublications(result.publications)
    } catch (error) {
      setIssues(
        error instanceof BusinessApiError
          ? error.issues
          : ['The review decision could not be saved.'],
      )
    } finally {
      setPendingId(undefined)
    }
  }

  return (
    <section className="admin-publication-review" aria-labelledby="business-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Business publishing</p>
          <h2 id="business-review-title">Publication review</h2>
          <p>Check the offer, dates, destination, and shopper placement before approval.</p>
        </div>
        {publications && (
          <span className="admin-review-count">
            {publications.length} waiting
          </span>
        )}
      </div>

      {issues.length > 0 && (
        <div className="write-notice" role="alert">
          {issues.join(' ')}
        </div>
      )}

      {!publications && <p className="admin-access-note">Loading business publications.</p>}
      {publications?.length === 0 && (
        <div className="admin-review-empty">
          <CheckCircle size={26} weight="fill" />
          <span>No publications are waiting for review.</span>
        </div>
      )}

      <div className="admin-review-list">
        {publications?.map((publication) => (
          <article className="admin-review-card" key={publication.id}>
            <div className="admin-review-media">
              {publication.imageUrl ? (
                <img alt={publication.imageAlt || ''} src={publication.imageUrl} />
              ) : (
                <Storefront size={38} />
              )}
            </div>
            <div className="admin-review-copy">
              <div className="admin-review-meta">
                <strong>{publication.organizationName}</strong>
                <span>{publication.kind}</span>
                <span>{destinationLabel(publication)}</span>
              </div>
              <h3>{publication.title}</h3>
              <p>{publication.bodyText}</p>
              <div className="admin-review-facts">
                {publication.priceCents !== undefined && (
                  <strong>{formatMoney(publication.priceCents, publication.currencyCode)}</strong>
                )}
                <span>{dateWindow(publication.startsAt, publication.endsAt)}</span>
                {publication.targetUrl && (
                  <a href={publication.targetUrl} rel="noreferrer" target="_blank">
                    Check destination
                    <ArrowSquareOut size={15} />
                  </a>
                )}
              </div>
              <label>
                Review note for {publication.title}
                <textarea
                  aria-label={`Review note for ${publication.title}`}
                  maxLength={1000}
                  onChange={(event) => setNotes((current) => ({
                    ...current,
                    [publication.id]: event.target.value,
                  }))}
                  placeholder="Required when asking for changes or rejecting"
                  rows={3}
                  value={notes[publication.id] ?? ''}
                />
              </label>
              <div className="admin-review-actions">
                <button
                  aria-label={`Approve ${publication.title}`}
                  className="admin-review-approve"
                  disabled={pendingId === publication.id}
                  onClick={() => void decide(publication, 'approved')}
                  type="button"
                >
                  <CheckCircle size={17} weight="fill" />
                  Approve
                </button>
                <button
                  aria-label={`Request changes for ${publication.title}`}
                  disabled={pendingId === publication.id}
                  onClick={() => void decide(publication, 'changes_requested')}
                  type="button"
                >
                  <WarningCircle size={17} />
                  Request changes
                </button>
                <button
                  aria-label={`Reject ${publication.title}`}
                  disabled={pendingId === publication.id}
                  onClick={() => void decide(publication, 'rejected')}
                  type="button"
                >
                  <XCircle size={17} />
                  Reject
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function formatMoney(cents: number, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    currency,
    style: 'currency',
  }).format(cents / 100)
}

function destinationLabel(publication: BusinessPublication) {
  const destinations = publication.destinations ??
    (publication.placement === 'both'
      ? ['marketplace', 'window']
      : [publication.placement])
  return destinations.map((destination) =>
    destination === 'marketplace'
      ? 'Marketplace'
      : destination === 'window'
        ? 'Window Shopping'
        : 'Stories').join(', ')
}

function dateWindow(startsAt?: string, endsAt?: string) {
  const format = (value?: string) => value
    ? new Date(value).toLocaleString('en-ZA', {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
      })
    : 'Open'
  return `${format(startsAt)} to ${format(endsAt)}`
}
