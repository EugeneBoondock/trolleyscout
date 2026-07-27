import { useEffect, useMemo, useState } from 'react'
import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  Buildings,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  CreditCard,
  Eye,
  HouseLine,
  List,
  MagnifyingGlass,
  MoonStars,
  ShieldCheck,
  SignOut,
  Storefront,
  Sun,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { ScoutMark } from '../components/ScoutMark'
import { AdminOrganizationApplications } from './AdminOrganizationApplications'
import { AdminPublicationReview } from './AdminPublicationReview'
import {
  BusinessApiError,
  loadBusinessAdminOverview,
  setBusinessOrganizationStatus,
  signOutBusiness,
} from './api'
import type {
  BusinessAdminCampaign,
  BusinessAdminOrganization,
  BusinessAdminOverview,
  BusinessAdminView,
  BusinessBootstrap,
} from './types'

type ThemeMode = 'light' | 'dark'

interface BusinessAdminShellProps {
  bootstrap: BusinessBootstrap
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}

const adminNav: Array<{
  icon: typeof HouseLine
  label: string
  value: BusinessAdminView
}> = [
  { icon: HouseLine, label: 'Admin overview', value: 'overview' },
  { icon: Buildings, label: 'Businesses', value: 'businesses' },
  { icon: ShieldCheck, label: 'Moderation', value: 'moderation' },
  { icon: ClipboardText, label: 'Campaigns', value: 'campaigns' },
  { icon: CreditCard, label: 'Payments', value: 'payments' },
]

export function BusinessAdminShell({
  bootstrap,
  onTheme,
  theme,
}: BusinessAdminShellProps) {
  const [view, setView] = useState<BusinessAdminView>('overview')
  const [overview, setOverview] = useState<BusinessAdminOverview>()
  const [issues, setIssues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingBusinessId, setPendingBusinessId] = useState<string>()
  const [railOpen, setRailOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const account = bootstrap.session.account!

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    loadBusinessAdminOverview(controller.signal)
      .then(setOverview)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setIssues(
          error instanceof BusinessApiError
            ? error.issues
            : ['Business reporting could not be loaded.'],
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  function go(next: BusinessAdminView) {
    setView(next)
    setRailOpen(false)
    setAccountOpen(false)
    window.scrollTo?.({ top: 0 })
  }

  async function refresh() {
    setLoading(true)
    setIssues([])
    try {
      setOverview(await loadBusinessAdminOverview())
    } catch (error) {
      setIssues(
        error instanceof BusinessApiError
          ? error.issues
          : ['Business reporting could not be refreshed.'],
      )
    } finally {
      setLoading(false)
    }
  }

  async function changeBusinessStatus(
    business: BusinessAdminOrganization,
    status: 'active' | 'suspended',
  ) {
    const action = status === 'suspended' ? 'Suspend' : 'Reopen'
    if (
      !window.confirm(
        `${action} “${business.name}”? ${
          status === 'suspended'
            ? 'Its owners will lose business workspace access until you reopen it.'
            : 'Approved owners with an active subscription will regain workspace access.'
        }`,
      )
    ) {
      return
    }

    setPendingBusinessId(business.id)
    setIssues([])
    try {
      const result = await setBusinessOrganizationStatus(business.id, status)
      setOverview(result.overview)
    } catch (error) {
      setIssues(
        error instanceof BusinessApiError
          ? error.issues
          : ['The business status could not be changed.'],
      )
    } finally {
      setPendingBusinessId(undefined)
    }
  }

  async function signOut() {
    if (!window.confirm('Sign out of the Trolley Scout business admin console?')) return
    await signOutBusiness()
    window.location.reload()
  }

  const queueCount =
    (overview?.totals.pendingApplications ?? 0) +
    (overview?.totals.pendingModeration ?? 0)

  return (
    <div className="biz-app-shell biz-admin-shell">
      <aside className={clsx('biz-rail biz-admin-rail', railOpen && 'is-open')}>
        <div className="biz-rail-head">
          <button
            aria-label="Close navigation"
            className="biz-rail-close"
            onClick={() => setRailOpen(false)}
            type="button"
          >
            <X size={20} />
          </button>
          <button className="biz-brand-lockup" onClick={() => go('overview')} type="button">
            <ScoutMark size={42} variant="business" />
            <div>
              <strong>TROLLEY SCOUT</strong>
              <span>BUSINESS ADMIN</span>
            </div>
          </button>
        </div>

        <div className="biz-org-chip biz-admin-chip">
          <span><ShieldCheck size={21} weight="fill" /></span>
          <div>
            <strong>Platform control</strong>
            <small>Admin workspace</small>
          </div>
        </div>

        <nav aria-label="Business admin workspace" className="biz-rail-nav">
          {adminNav.map((item) => {
            const Icon = item.icon
            return (
              <button
                aria-current={view === item.value ? 'page' : undefined}
                className={view === item.value ? 'is-active' : ''}
                key={item.value}
                onClick={() => go(item.value)}
                type="button"
              >
                <Icon size={21} weight={view === item.value ? 'fill' : 'regular'} />
                <span>{item.label}</span>
                {item.value === 'moderation' && queueCount > 0 && <b>{queueCount}</b>}
              </button>
            )
          })}
        </nav>

        <div className="biz-rail-bottom">
          <div className="biz-admin-rail-status">
            <span><CheckCircle size={18} weight="fill" /></span>
            <div>
              <strong>Admin session</strong>
              <small>{account.email}</small>
            </div>
          </div>
        </div>
      </aside>

      {railOpen && (
        <button
          aria-label="Close navigation overlay"
          className="biz-rail-backdrop"
          onClick={() => setRailOpen(false)}
          type="button"
        />
      )}

      <div className="biz-workspace">
        <header className="biz-topbar">
          <button
            aria-label="Open navigation"
            className="biz-mobile-menu"
            onClick={() => setRailOpen(true)}
            type="button"
          >
            <List size={23} />
          </button>
          <div className="biz-mobile-brand">
            <ScoutMark size={34} variant="business" />
            <span>ADMIN</span>
          </div>
          <div className="biz-topbar-context biz-admin-top-context">
            <ShieldCheck size={17} weight="fill" />
            <span>Business platform</span>
          </div>
          <div className="biz-topbar-actions">
            <button
              aria-label="Refresh business reporting"
              className="biz-icon-button"
              disabled={loading}
              onClick={() => void refresh()}
              type="button"
            >
              <ArrowClockwise className={loading ? 'is-spinning' : ''} size={20} />
            </button>
            <div className="biz-account-menu">
              <button
                aria-expanded={accountOpen}
                aria-label="Admin account and appearance"
                className="biz-account-trigger"
                onClick={() => setAccountOpen((open) => !open)}
                type="button"
              >
                <span>{account.initials}</span>
                <div>
                  <strong>{account.displayName}</strong>
                  <small>Platform admin</small>
                </div>
                <CaretDown size={16} />
              </button>
              {accountOpen && (
                <div className="biz-account-popover" role="menu">
                  <button
                    onClick={() => {
                      onTheme(theme === 'light' ? 'dark' : 'light')
                      setAccountOpen(false)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {theme === 'light' ? <MoonStars size={18} /> : <Sun size={18} />}
                    {theme === 'light' ? 'Use dark theme' : 'Use light theme'}
                  </button>
                  <button onClick={() => void signOut()} role="menuitem" type="button">
                    <SignOut size={18} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="biz-main biz-admin-main">
          {issues.length > 0 && (
            <div className="biz-admin-issues" role="alert">
              <WarningCircle size={20} weight="fill" />
              <span>{issues.join(' ')}</span>
            </div>
          )}

          {!overview && loading ? (
            <AdminLoading />
          ) : !overview ? (
            <AdminUnavailable onRetry={() => void refresh()} />
          ) : (
            <>
              {view === 'overview' && (
                <AdminOverviewView
                  onGo={go}
                  overview={overview}
                />
              )}
              {view === 'businesses' && (
                <AdminBusinessesView
                  onStatus={changeBusinessStatus}
                  overview={overview}
                  pendingBusinessId={pendingBusinessId}
                />
              )}
              {view === 'moderation' && <AdminModerationView overview={overview} />}
              {view === 'campaigns' && <AdminCampaignsView overview={overview} />}
              {view === 'payments' && <AdminPaymentsView overview={overview} />}
            </>
          )}
        </main>

        <nav aria-label="Business admin mobile navigation" className="biz-bottom-nav biz-admin-bottom-nav">
          {adminNav.map((item) => {
            const Icon = item.icon
            return (
              <button
                aria-current={view === item.value ? 'page' : undefined}
                className={view === item.value ? 'is-active' : ''}
                key={item.value}
                onClick={() => go(item.value)}
                type="button"
              >
                <Icon size={21} weight={view === item.value ? 'fill' : 'regular'} />
                <span>{shortAdminLabel(item.value)}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

function AdminLoading() {
  return (
    <section className="biz-admin-loading" role="status">
      <ScoutMark motion="spin" size={52} variant="business" />
      <h1>Loading business control</h1>
      <p>Reading businesses, campaigns, moderation, and payments.</p>
    </section>
  )
}

function AdminUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="biz-empty-state">
      <WarningCircle size={42} weight="duotone" />
      <h1>Business reporting is unavailable</h1>
      <p>Your admin session is still active. Try the reporting service again.</p>
      <button className="biz-primary-button" onClick={onRetry} type="button">
        Try again
      </button>
    </section>
  )
}

function AdminOverviewView({
  onGo,
  overview,
}: {
  onGo: (view: BusinessAdminView) => void
  overview: BusinessAdminOverview
}) {
  const totals = overview.totals
  const responseRate = rate(
    overview.businesses.reduce((sum, business) => sum + business.opens, 0),
    overview.businesses.reduce((sum, business) => sum + business.impressions, 0),
  )

  return (
    <div className="biz-page biz-admin-overview">
      <header className="biz-page-header biz-admin-page-header">
        <div>
          <p className="biz-kicker">Platform administration</p>
          <h1>Business control</h1>
          <p>Monitor access, content, campaign results, and money received from one workspace.</p>
        </div>
        <button className="biz-primary-button" onClick={() => onGo('moderation')} type="button">
          <ShieldCheck size={18} weight="fill" />
          Open moderation
        </button>
      </header>

      <section className="biz-admin-metric-grid" aria-label="Business platform totals">
        <AdminMetricCard
          detail={`${totals.suspendedBusinesses} suspended`}
          icon={<Buildings size={24} />}
          label="Active businesses"
          tone="green"
          value={formatCount(totals.activeBusinesses)}
        />
        <AdminMetricCard
          detail={`${totals.pendingApplications} applications`}
          icon={<ShieldCheck size={24} />}
          label="Waiting for review"
          tone="yellow"
          value={formatCount(totals.pendingApplications + totals.pendingModeration)}
        />
        <AdminMetricCard
          detail={`${totals.liveCampaigns} live or scheduled`}
          icon={<ClipboardText size={24} />}
          label="Campaigns created"
          tone="blue"
          value={formatCount(totals.campaigns)}
        />
        <AdminMetricCard
          detail={`${formatCount(totals.paidTransactions)} completed payments`}
          icon={<CreditCard size={24} />}
          label="Money received"
          tone="red"
          value={formatMoney(totals.paidCents)}
        />
      </section>

      <section className="biz-admin-command-grid">
        <article className="biz-admin-command-card is-performance">
          <div className="biz-admin-card-heading">
            <div>
              <p className="biz-kicker">Shopper response</p>
              <h2>Campaign performance</h2>
            </div>
            <ChartLineUp size={28} weight="duotone" />
          </div>
          <div className="biz-admin-performance-value">
            <strong>{responseRate}%</strong>
            <span>open rate</span>
          </div>
          <div className="biz-admin-performance-rows">
            <span>
              <small>Views</small>
              <strong>{formatCount(sumBusinesses(overview, 'impressions'))}</strong>
            </span>
            <span>
              <small>Saves</small>
              <strong>{formatCount(sumBusinesses(overview, 'saves'))}</strong>
            </span>
            <span>
              <small>Store visits</small>
              <strong>{formatCount(sumBusinesses(overview, 'visits'))}</strong>
            </span>
          </div>
          <button onClick={() => onGo('campaigns')} type="button">
            Inspect campaigns <ArrowRight size={16} />
          </button>
        </article>

        <article className="biz-admin-command-card is-moderation">
          <div className="biz-admin-card-heading">
            <div>
              <p className="biz-kicker">Safety queue</p>
              <h2>Moderation</h2>
            </div>
            <ShieldCheck size={28} weight="duotone" />
          </div>
          <div className="biz-admin-queue-bars">
            <span>
              <i style={{ width: queueWidth(totals.pendingApplications, totals.businesses) }} />
              <b>{totals.pendingApplications}</b>
              Business applications
            </span>
            <span>
              <i style={{ width: queueWidth(totals.pendingModeration, totals.campaigns) }} />
              <b>{totals.pendingModeration}</b>
              Publications
            </span>
          </div>
          <button onClick={() => onGo('moderation')} type="button">
            Review queue <ArrowRight size={16} />
          </button>
        </article>
      </section>

      <section className="biz-admin-section">
        <div className="biz-section-heading">
          <div>
            <p className="biz-kicker">Latest activity</p>
            <h2>Businesses</h2>
          </div>
          <button onClick={() => onGo('businesses')} type="button">
            View every business <ArrowRight size={16} />
          </button>
        </div>
        <div className="biz-admin-business-list">
          {overview.businesses.slice(0, 4).map((business) => (
            <BusinessSummaryRow business={business} key={business.id} />
          ))}
          {overview.businesses.length === 0 && (
            <p className="biz-admin-empty-copy">Approved businesses will appear here.</p>
          )}
        </div>
      </section>

      <section className="biz-admin-section">
        <div className="biz-section-heading">
          <div>
            <p className="biz-kicker">Recent publishing</p>
            <h2>Campaigns and posts</h2>
          </div>
          <button onClick={() => onGo('campaigns')} type="button">
            Open campaign monitor <ArrowRight size={16} />
          </button>
        </div>
        <div className="biz-admin-campaign-strip">
          {overview.campaigns.slice(0, 4).map((campaign) => (
            <CampaignCard campaign={campaign} key={campaign.id} />
          ))}
          {overview.campaigns.length === 0 && (
            <p className="biz-admin-empty-copy">Business content will appear here after creation.</p>
          )}
        </div>
      </section>
    </div>
  )
}

function AdminBusinessesView({
  onStatus,
  overview,
  pendingBusinessId,
}: {
  onStatus: (
    business: BusinessAdminOrganization,
    status: 'active' | 'suspended',
  ) => void
  overview: BusinessAdminOverview
  pendingBusinessId?: string
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'suspended'>('all')
  const filtered = useMemo(() => overview.businesses.filter((business) => {
    const term = query.trim().toLowerCase()
    const matchesQuery =
      !term ||
      `${business.name} ${business.ownerName} ${business.category ?? ''}`
        .toLowerCase()
        .includes(term)
    return matchesQuery && (status === 'all' || business.status === status)
  }), [overview.businesses, query, status])

  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Access and account health</p>
          <h1>Businesses</h1>
          <p>See every approved business, its plan, publishing activity, payments, and access state.</p>
        </div>
      </header>

      <section className="biz-admin-toolbar">
        <label className="biz-search-field">
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search businesses</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search business or owner"
            type="search"
            value={query}
          />
        </label>
        <div className="biz-admin-filter-pills" role="group" aria-label="Business status">
          {(['all', 'active', 'suspended'] as const).map((value) => (
            <button
              aria-pressed={status === value}
              className={status === value ? 'is-active' : ''}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {capitalise(value)}
            </button>
          ))}
        </div>
      </section>

      <section className="biz-admin-business-grid">
        {filtered.map((business) => (
          <article className="biz-admin-business-card" key={business.id}>
            <header>
              <span className="biz-admin-business-avatar">
                {business.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className="biz-kicker">{business.category ?? 'Business'}</p>
                <h2>{business.name}</h2>
                <p>Owner: {business.ownerName}</p>
              </div>
              <AdminStateBadge status={business.status} />
            </header>
            <dl className="biz-admin-business-facts">
              <div><dt>Campaigns</dt><dd>{formatCount(business.campaigns)}</dd></div>
              <div><dt>Active</dt><dd>{formatCount(business.activeCampaigns)}</dd></div>
              <div><dt>Locations</dt><dd>{formatCount(business.locations)}</dd></div>
              <div><dt>Paid</dt><dd>{formatMoney(business.paidCents)}</dd></div>
              <div><dt>Views</dt><dd>{formatCount(business.impressions)}</dd></div>
              <div><dt>Saves</dt><dd>{formatCount(business.saves)}</dd></div>
            </dl>
            <div className="biz-admin-plan-line">
              <span>{capitalise(business.planId)} plan</span>
              <span>{capitalise(business.planStatus)}</span>
              <span>{business.paidTransactions} payments</span>
            </div>
            <footer>
              <small>
                {business.lastCampaignAt
                  ? `Last campaign ${formatRelative(business.lastCampaignAt)}`
                  : 'No campaign created yet'}
              </small>
              <button
                className={business.status === 'active' ? 'biz-admin-danger-button' : 'biz-secondary-button'}
                disabled={pendingBusinessId === business.id}
                onClick={() => onStatus(
                  business,
                  business.status === 'active' ? 'suspended' : 'active',
                )}
                type="button"
              >
                {pendingBusinessId === business.id
                  ? 'Saving'
                  : business.status === 'active'
                    ? 'Suspend access'
                    : 'Reopen access'}
              </button>
            </footer>
          </article>
        ))}
      </section>

      {filtered.length === 0 && (
        <section className="biz-empty-state">
          <Buildings size={42} weight="duotone" />
          <h2>No businesses match this view</h2>
          <p>Change the search or status filter.</p>
        </section>
      )}
    </div>
  )
}

function AdminModerationView({ overview }: { overview: BusinessAdminOverview }) {
  return (
    <div className="biz-page biz-admin-moderation">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Applications and content</p>
          <h1>Moderation</h1>
          <p>Approve trusted businesses, inspect what they publish, request changes, or reject it.</p>
        </div>
        <div className="biz-admin-queue-total">
          <strong>{overview.totals.pendingApplications + overview.totals.pendingModeration}</strong>
          <span>waiting</span>
        </div>
      </header>
      <AdminOrganizationApplications />
      <AdminPublicationReview />
    </div>
  )
}

function AdminCampaignsView({ overview }: { overview: BusinessAdminOverview }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const statuses = useMemo(
    () => ['all', ...new Set(overview.campaigns.map((campaign) => campaign.status))],
    [overview.campaigns],
  )
  const campaigns = useMemo(() => overview.campaigns.filter((campaign) => {
    const term = query.trim().toLowerCase()
    const matchesQuery =
      !term ||
      `${campaign.title} ${campaign.organizationName} ${campaign.kind}`
        .toLowerCase()
        .includes(term)
    return matchesQuery && (status === 'all' || campaign.status === status)
  }), [overview.campaigns, query, status])

  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Platform publishing</p>
          <h1>Campaigns</h1>
          <p>Track every deal, special, promotion, and post from creation through completion.</p>
        </div>
        <div className="biz-admin-queue-total">
          <strong>{overview.totals.campaigns}</strong>
          <span>created</span>
        </div>
      </header>

      <section className="biz-admin-toolbar">
        <label className="biz-search-field">
          <MagnifyingGlass size={18} />
          <span className="sr-only">Search campaigns</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campaign or business"
            type="search"
            value={query}
          />
        </label>
        <label className="biz-admin-select">
          Status
          <select onChange={(event) => setStatus(event.target.value)} value={status}>
            {statuses.map((value) => (
              <option key={value} value={value}>{capitalise(value.replace('_', ' '))}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="biz-admin-campaign-grid">
        {campaigns.map((campaign) => (
          <CampaignCard campaign={campaign} key={campaign.id} detailed />
        ))}
      </section>

      {campaigns.length === 0 && (
        <section className="biz-empty-state">
          <ClipboardText size={42} weight="duotone" />
          <h2>No campaigns match this view</h2>
          <p>Change the search or status filter.</p>
        </section>
      )}
    </div>
  )
}

function AdminPaymentsView({ overview }: { overview: BusinessAdminOverview }) {
  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">PayFast settlement reporting</p>
          <h1>Payments</h1>
          <p>Monitor completed Organisation plan payments connected to approved businesses.</p>
        </div>
      </header>

      <section className="biz-admin-payment-hero">
        <div>
          <span>Total received</span>
          <strong>{formatMoney(overview.totals.paidCents)}</strong>
          <small>Completed PayFast transactions recorded by Trolley Scout</small>
        </div>
        <div>
          <span>Transactions</span>
          <strong>{formatCount(overview.totals.paidTransactions)}</strong>
          <small>One ledger row per completed provider event</small>
        </div>
        <div>
          <span>Average payment</span>
          <strong>
            {formatMoney(
              overview.totals.paidTransactions > 0
                ? Math.round(overview.totals.paidCents / overview.totals.paidTransactions)
                : 0,
            )}
          </strong>
          <small>Across recorded business subscription payments</small>
        </div>
      </section>

      <section className="biz-admin-payment-table" aria-label="Business payments">
        <div className="biz-admin-payment-head">
          <span>Business</span>
          <span>Plan</span>
          <span>Provider reference</span>
          <span>Date</span>
          <span>Amount</span>
        </div>
        {overview.payments.map((payment) => (
          <div className="biz-admin-payment-row" key={payment.id}>
            <span>
              <strong>{payment.businessName}</strong>
              <small>Completed</small>
            </span>
            <span>{capitalise(payment.planId)}</span>
            <span>{payment.paymentId}</span>
            <span>{formatDate(payment.createdAt)}</span>
            <strong>{formatMoney(payment.amountCents)}</strong>
          </div>
        ))}
      </section>

      {overview.payments.length === 0 && (
        <section className="biz-empty-state">
          <CreditCard size={42} weight="duotone" />
          <h2>No completed business payments yet</h2>
          <p>Completed Organisation subscription payments will appear here.</p>
        </section>
      )}
    </div>
  )
}

function AdminMetricCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string
  icon: React.ReactNode
  label: string
  tone: string
  value: string
}) {
  return (
    <article className={clsx('biz-admin-metric-card', `is-${tone}`)}>
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  )
}

function BusinessSummaryRow({ business }: { business: BusinessAdminOrganization }) {
  return (
    <article>
      <span className="biz-admin-business-avatar">{business.name.slice(0, 1).toUpperCase()}</span>
      <div>
        <strong>{business.name}</strong>
        <small>{business.ownerName} · {business.campaigns} campaigns</small>
      </div>
      <span>
        <small>Views</small>
        <strong>{formatCount(business.impressions)}</strong>
      </span>
      <span>
        <small>Paid</small>
        <strong>{formatMoney(business.paidCents)}</strong>
      </span>
      <AdminStateBadge status={business.status} />
    </article>
  )
}

function CampaignCard({
  campaign,
  detailed = false,
}: {
  campaign: BusinessAdminCampaign
  detailed?: boolean
}) {
  return (
    <article className={clsx('biz-admin-campaign-card', detailed && 'is-detailed')}>
      <div className="biz-admin-campaign-media">
        {campaign.imageUrl ? (
          <img alt={campaign.imageAlt ?? ''} src={campaign.imageUrl} />
        ) : (
          <Storefront size={34} weight="duotone" />
        )}
        <span className={clsx('biz-admin-content-status', `is-${campaign.status}`)}>
          {capitalise(campaign.status.replace('_', ' '))}
        </span>
        {campaign.soldOut && <b>Sold out</b>}
      </div>
      <div className="biz-admin-campaign-copy">
        <p className="biz-kicker">{campaign.organizationName}</p>
        <h3>{campaign.title}</h3>
        <div className="biz-admin-campaign-meta">
          <span>{capitalise(campaign.kind)}</span>
          <span>{capitalise(campaign.placement)}</span>
          <span>{formatRelative(campaign.updatedAt)}</span>
        </div>
        <div className="biz-admin-campaign-results">
          <span><Eye size={16} /> {formatCount(campaign.impressions)}</span>
          <span>{formatCount(campaign.opens)} opens</span>
          <span>{formatCount(campaign.saves)} saves</span>
          <span>{formatCount(campaign.visits)} visits</span>
        </div>
        {detailed && campaign.targetUrl && (
          <a href={campaign.targetUrl} rel="noreferrer" target="_blank">
            Check destination <ArrowSquareOut size={15} />
          </a>
        )}
      </div>
    </article>
  )
}

function AdminStateBadge({ status }: { status: 'active' | 'suspended' }) {
  return (
    <span className={clsx('biz-admin-state-badge', `is-${status}`)}>
      {status === 'active'
        ? <CheckCircle size={15} weight="fill" />
        : <WarningCircle size={15} weight="fill" />}
      {capitalise(status)}
    </span>
  )
}

function sumBusinesses(
  overview: BusinessAdminOverview,
  field: 'impressions' | 'saves' | 'visits',
) {
  return overview.businesses.reduce((sum, business) => sum + business[field], 0)
}

function queueWidth(value: number, total: number) {
  return `${Math.max(value > 0 ? 8 : 0, Math.min(100, rate(value, Math.max(total, 1))))}%`
}

function rate(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-ZA', { notation: value >= 10_000 ? 'compact' : 'standard' })
    .format(value)
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    currency: 'ZAR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(cents / 100)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatRelative(value: string) {
  const difference = Date.now() - Date.parse(value)
  const days = Math.max(0, Math.floor(difference / 86_400_000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(value)
}

function capitalise(value: string) {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value
}

function shortAdminLabel(view: BusinessAdminView) {
  if (view === 'overview') return 'Overview'
  if (view === 'businesses') return 'Businesses'
  if (view === 'moderation') return 'Review'
  if (view === 'campaigns') return 'Campaigns'
  return 'Payments'
}
