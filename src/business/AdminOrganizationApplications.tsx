import { useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  ClockCountdown,
  EnvelopeSimple,
  Storefront,
  WarningCircle,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import {
  loadBusinessApplicationsForReview,
  reviewBusinessApplication,
} from '../services/apiClient'
import type { OrganizationApplication } from '../types'

export function AdminOrganizationApplications() {
  const [applications, setApplications] = useState<OrganizationApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [notes, setNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    const controller = new AbortController()
    loadBusinessApplicationsForReview(controller.signal)
      .then((result) => {
        setApplications(result.applications)
        if (!result.ok) setNotice(result.message)
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setNotice('Business applications are unavailable.')
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const pendingCount = useMemo(
    () => applications.filter((application) => application.status === 'pending').length,
    [applications],
  )

  async function decide(
    application: OrganizationApplication,
    decision: 'approved' | 'rejected',
  ) {
    setPendingId(application.id)
    setNotice(undefined)
    const result = await reviewBusinessApplication(
      application.id,
      decision,
      notes[application.id],
    )
    setPendingId(undefined)

    if (result.applications.length > 0) {
      setApplications(result.applications)
    }

    if (!result.ok) {
      setNotice(result.issues[0] ?? 'The application decision could not be saved.')
      return
    }

    if (decision === 'approved') {
      setNotice(
        result.emailSent
          ? 'Business approved. The owner’s access email was sent.'
          : result.emailIssue ?? 'Business approved. The access email still needs to be sent.',
      )
      return
    }

    setNotice('Application rejected. The review note is available to the owner.')
  }

  return (
    <section className="admin-business-applications" aria-label="Business applications">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Trolley Scout for Business</p>
          <h2>Business applications</h2>
          <p>
            Check business details, confirm the Organisation subscription, then approve workspace access.
          </p>
        </div>
        <span className="admin-queue-count">
          <ClockCountdown size={18} />
          {pendingCount} awaiting review
        </span>
      </div>

      {notice && <div className="write-notice" role="status">{notice}</div>}

      {loading ? (
        <div className="admin-business-loading" role="status">
          <ArrowClockwise className="is-spinning" size={20} />
          Loading business applications
        </div>
      ) : applications.length === 0 ? (
        <div className="admin-business-empty">
          <Storefront size={34} />
          <strong>No business applications yet</strong>
          <p>New applications appear here after a member submits business details.</p>
        </div>
      ) : (
        <div className="admin-business-list">
          {applications.map((application) => {
            const canApprove = application.businessSubscriptionActive
            const busy = pendingId === application.id
            return (
              <article
                className={clsx('admin-business-card', `is-${application.status}`)}
                key={application.id}
              >
                <header>
                  <div className="admin-business-identity">
                    <span aria-hidden="true">
                      {application.organisationName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="eyebrow">{application.category ?? 'Business application'}</p>
                      <h3>{application.organisationName}</h3>
                      {application.tradingName && <p>Trading as {application.tradingName}</p>}
                    </div>
                  </div>
                  <div className="admin-business-badges">
                    <span className={clsx('admin-state-badge', `is-${application.status}`)}>
                      {application.status}
                    </span>
                    <span className={clsx('admin-plan-badge', canApprove && 'is-active')}>
                      {canApprove ? <CheckCircle size={16} weight="fill" /> : <WarningCircle size={16} />}
                      {canApprove ? 'Subscription active' : 'Waiting for subscription'}
                    </span>
                  </div>
                </header>

                <p className="admin-business-description">{application.description}</p>

                <dl className="admin-business-details">
                  <div><dt>Contact</dt><dd>{application.contactName}</dd></div>
                  <div><dt>Email</dt><dd><a href={`mailto:${application.contactEmail}`}>{application.contactEmail}</a></dd></div>
                  <div><dt>Phone</dt><dd>{application.contactPhone ?? 'Not provided'}</dd></div>
                  <div><dt>Registration</dt><dd>{application.registrationNumber ?? 'Not provided'}</dd></div>
                  <div><dt>Location</dt><dd>{[application.city, application.province].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
                  <div>
                    <dt>Website</dt>
                    <dd>
                      {application.websiteUrl
                        ? <a href={application.websiteUrl} rel="noreferrer" target="_blank">Open website</a>
                        : 'Not provided'}
                    </dd>
                  </div>
                </dl>

                {application.reviewNote && (
                  <div className="admin-review-history">
                    <strong>Previous review note</strong>
                    <p>{application.reviewNote}</p>
                  </div>
                )}

                <label className="admin-review-note">
                  Review note
                  <textarea
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                    placeholder="Add a reason, check result or instruction for the owner"
                    rows={3}
                    value={notes[application.id] ?? ''}
                  />
                </label>

                <footer>
                  {application.status === 'pending' && (
                    <button
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => void decide(application, 'rejected')}
                      type="button"
                    >
                      Reject with note
                    </button>
                  )}
                  <button
                    className="primary-button"
                    disabled={busy || !canApprove}
                    onClick={() => void decide(application, 'approved')}
                    type="button"
                  >
                    {application.status === 'approved'
                      ? <EnvelopeSimple size={18} />
                      : <CheckCircle size={18} />}
                    {busy
                      ? 'Saving decision'
                      : application.status === 'approved'
                        ? 'Resend access email'
                        : 'Approve and send access'}
                  </button>
                </footer>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
