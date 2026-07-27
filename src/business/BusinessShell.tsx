import { useMemo, useState } from 'react'
import {
  Archive,
  ArrowClockwise,
  ArrowRight,
  Bell,
  BookmarkSimple,
  Buildings,
  CalendarBlank,
  CaretDown,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  DotsThree,
  Eye,
  Funnel,
  HouseLine,
  Lifebuoy,
  LinkSimple,
  List,
  MagnifyingGlass,
  MapPin,
  MoonStars,
  Pause,
  PencilSimple,
  Play,
  Plus,
  SignOut,
  Storefront,
  Sun,
  Tag,
  UserCircle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { ScoutMark } from '../components/ScoutMark'
import {
  BusinessApiError,
  changeBusinessPublication,
  createBusinessLocation,
  createBusinessPublication,
  loadBusinessMetrics,
  signOutBusiness,
  updateBusinessPublication,
} from './api'
import { IssueList } from './BusinessFeedback'
import { PublicationComposer } from './PublicationComposer'
import type {
  BusinessBootstrap,
  BusinessLocationDraft,
  BusinessMutationResult,
  BusinessPublication,
  BusinessView,
  PublicationDraft,
  PublicationStatus,
} from './types'

type ThemeMode = 'light' | 'dark'

interface BusinessShellProps {
  bootstrap: BusinessBootstrap
  onBootstrap: (bootstrap: BusinessBootstrap) => void
  onReload: () => void
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}

const navItems: Array<{
  icon: typeof HouseLine
  label: string
  value: BusinessView
}> = [
  { icon: HouseLine, label: 'Overview', value: 'overview' },
  { icon: ClipboardText, label: 'Content', value: 'content' },
  { icon: Plus, label: 'Create', value: 'create' },
  { icon: Buildings, label: 'Locations', value: 'locations' },
  { icon: ChartLineUp, label: 'Insights', value: 'insights' },
]

export function BusinessShell({
  bootstrap,
  onBootstrap,
  onReload,
  onTheme,
  theme,
}: BusinessShellProps) {
  const [view, setView] = useState<BusinessView>('overview')
  const [editing, setEditing] = useState<BusinessPublication>()
  const [menuOpen, setMenuOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [issues, setIssues] = useState<string[]>([])
  const account = bootstrap.session.account!
  const organization = bootstrap.gate.organization!

  function go(next: BusinessView) {
    setView(next)
    setEditing(undefined)
    setRailOpen(false)
    setIssues([])
    setNotice(undefined)
    window.scrollTo?.({ top: 0 })
  }

  function applyPublicationResult(result: BusinessMutationResult) {
    onBootstrap({ ...bootstrap, publications: result.publications })
  }

  async function savePublication(
    draft: PublicationDraft,
    publicationId?: string,
  ): Promise<BusinessMutationResult> {
    const result = publicationId
      ? await updateBusinessPublication(publicationId, draft)
      : await createBusinessPublication(draft)
    applyPublicationResult(result)
    return result
  }

  async function submitPublication(publicationId: string): Promise<BusinessMutationResult> {
    const result = await changeBusinessPublication(publicationId, 'submit')
    applyPublicationResult(result)
    return result
  }

  async function publicationAction(
    publication: BusinessPublication,
    operation: 'submit' | 'pause' | 'resume' | 'sold_out' | 'archive',
  ) {
    if (
      operation === 'archive' &&
      !window.confirm(`Archive “${publication.title}”? It will leave shopper feeds.`)
    ) {
      return
    }
    setIssues([])
    setNotice(undefined)
    try {
      const result = await changeBusinessPublication(publication.id, operation)
      applyPublicationResult(result)
      setNotice(actionNotice(operation))
    } catch (caught) {
      setIssues(
        caught instanceof BusinessApiError
          ? caught.issues
          : ['The publication could not be changed. Try again.'],
      )
    }
  }

  async function signOut() {
    if (!window.confirm('Sign out of Trolley Scout for Business?')) return
    try {
      await signOutBusiness()
      window.location.reload()
    } catch {
      setIssues(['Sign-out could not be completed. Try again.'])
    }
  }

  const liveCount = bootstrap.publications.filter((publication) => liveLike(publication.status)).length
  const actionCount = bootstrap.publications.filter((publication) =>
    publication.status === 'changes_requested' || publication.status === 'rejected',
  ).length

  return (
    <div className="biz-app-shell">
      <aside className={clsx('biz-rail', railOpen && 'is-open')}>
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
              <span>FOR BUSINESS</span>
            </div>
          </button>
        </div>

        <div className="biz-org-chip">
          <span>{organization.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{organization.name}</strong>
            <small>Organization workspace</small>
          </div>
          <CaretDown size={16} />
        </div>

        <nav aria-label="Business workspace" className="biz-rail-nav">
          {navItems.map((item) => {
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
                {item.value === 'content' && actionCount > 0 && <b>{actionCount}</b>}
              </button>
            )
          })}
        </nav>

        <div className="biz-rail-bottom">
          <button onClick={() => go('account')} type="button">
            <Lifebuoy size={20} />
            Help and support
          </button>
          <div className="biz-plan-card">
            <div>
              <span>Business plan</span>
              <strong>{liveCount} of 25 active</strong>
            </div>
            <div className="biz-plan-meter" aria-label={`${liveCount} of 25 active publications`}>
              <span style={{ width: `${Math.min(100, liveCount * 4)}%` }} />
            </div>
            <button onClick={() => go('account')} type="button">View plan</button>
          </div>
        </div>
      </aside>
      {railOpen && <button aria-label="Close navigation overlay" className="biz-rail-backdrop" onClick={() => setRailOpen(false)} type="button" />}

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
            <span>FOR BUSINESS</span>
          </div>
          <div className="biz-topbar-context">
            <MapPin size={17} />
            <span>All locations</span>
            <CaretDown size={14} />
          </div>
          <div className="biz-topbar-actions">
            <button aria-label="Notifications" className="biz-icon-button" type="button">
              <Bell size={20} />
              {actionCount > 0 && <span className="biz-notification-dot">{actionCount}</span>}
            </button>
            <div className="biz-account-menu">
              <button
                aria-expanded={menuOpen}
                aria-label="Account and appearance"
                className="biz-account-trigger"
                onClick={() => setMenuOpen((open) => !open)}
                type="button"
              >
                <span>{account.initials || initials(account.displayName)}</span>
                <div>
                  <strong>{account.displayName}</strong>
                  <small>Owner</small>
                </div>
                <CaretDown size={16} />
              </button>
              {menuOpen && (
                <div className="biz-account-popover" role="menu">
                  <button onClick={() => { go('account'); setMenuOpen(false) }} role="menuitem" type="button">
                    <UserCircle size={18} />
                    Account settings
                  </button>
                  <button
                    onClick={() => {
                      onTheme(theme === 'light' ? 'dark' : 'light')
                      setMenuOpen(false)
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
            <button
              aria-label="Open publication composer"
              className="biz-primary-button biz-top-create"
              onClick={() => go('create')}
              type="button"
            >
              <Plus size={18} weight="bold" />
              Create
            </button>
          </div>
        </header>

        <main className="biz-main">
          {issues.length > 0 && <IssueList issues={issues} />}
          {notice && (
            <div className="biz-success-notice biz-global-notice" role="status">
              <CheckCircle size={20} weight="fill" />
              {notice}
              <button aria-label="Dismiss message" onClick={() => setNotice(undefined)} type="button">
                <X size={16} />
              </button>
            </div>
          )}

          {view === 'overview' && (
            <OverviewView
              bootstrap={bootstrap}
              onCreate={() => go('create')}
              onEdit={(publication) => {
                setEditing(publication)
                setView('create')
              }}
              onViewContent={() => go('content')}
            />
          )}
          {view === 'content' && (
            <ContentView
              publications={bootstrap.publications}
              onAction={publicationAction}
              onCreate={() => go('create')}
              onEdit={(publication) => {
                setEditing(publication)
                setView('create')
              }}
            />
          )}
          {view === 'create' && (
            <PublicationComposer
              locations={bootstrap.locations}
              onCancel={() => go('content')}
              onSave={savePublication}
              onSubmit={submitPublication}
              publication={editing}
            />
          )}
          {view === 'locations' && (
            <LocationsView
              bootstrap={bootstrap}
              onBootstrap={onBootstrap}
            />
          )}
          {view === 'insights' && (
            <InsightsView
              bootstrap={bootstrap}
              onBootstrap={onBootstrap}
            />
          )}
          {view === 'account' && (
            <AccountView
              bootstrap={bootstrap}
              onReload={onReload}
              onSignOut={() => void signOut()}
              onTheme={onTheme}
              theme={theme}
            />
          )}
        </main>

        <nav
          aria-label="Business mobile navigation"
          className={clsx('biz-bottom-nav', railOpen && 'is-hidden')}
        >
          {navItems.filter((item) => item.value !== 'locations').map((item) => {
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
              </button>
            )
          })}
          <button
            aria-current={view === 'account' || view === 'locations' ? 'page' : undefined}
            className={view === 'account' || view === 'locations' ? 'is-active' : ''}
            onClick={() => go('account')}
            type="button"
          >
            <DotsThree size={22} weight="bold" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  )
}

function OverviewView({
  bootstrap,
  onCreate,
  onEdit,
  onViewContent,
}: {
  bootstrap: BusinessBootstrap
  onCreate: () => void
  onEdit: (publication: BusinessPublication) => void
  onViewContent: () => void
}) {
  const account = bootstrap.session.account!
  const publications = bootstrap.publications
  const needsAction = publications.filter((publication) =>
    publication.status === 'changes_requested' || publication.status === 'rejected',
  )
  const live = publications.filter((publication) => publication.status === 'live')
  const scheduled = publications.filter((publication) => publication.status === 'scheduled')
  const drafts = publications.filter((publication) => publication.status === 'draft')
  const greeting = greetingForHour(new Date().getHours())

  return (
    <div className="biz-page biz-overview">
      <header className="biz-page-header biz-overview-header">
        <div>
          <p className="biz-kicker">{formatLongDate(new Date())}</p>
          <h1>{greeting}, {firstName(account.displayName)}</h1>
          <p>Here is what shoppers can see and what needs your attention.</p>
        </div>
        <button className="biz-primary-button" onClick={onCreate} type="button">
          <Plus size={18} />
          Create publication
        </button>
      </header>

      {needsAction.length > 0 && (
        <section className="biz-attention-panel">
          <div className="biz-attention-icon"><WarningCircle size={26} weight="fill" /></div>
          <div>
            <p className="biz-kicker">Action needed</p>
            <h2>{needsAction.length} {needsAction.length === 1 ? 'publication needs' : 'publications need'} attention</h2>
            <p>{needsAction[0]?.reviewNote ?? 'Open the review note, make the requested changes, and submit again.'}</p>
          </div>
          <button className="biz-secondary-button" onClick={onViewContent} type="button">
            Review content
            <ArrowRight size={17} />
          </button>
        </section>
      )}

      {publications.length === 0 ? (
        <EmptySetup onCreate={onCreate} hasLocation={bootstrap.locations.length > 0} />
      ) : (
        <>
          <section className="biz-status-grid" aria-label="Publication status">
            <StatusCard
              accent="green"
              detail="Visible to shoppers"
              icon={<Eye size={22} />}
              label="Live now"
              value={live.length}
            />
            <StatusCard
              accent="blue"
              detail={nextScheduleText(scheduled)}
              icon={<CalendarBlank size={22} />}
              label="Scheduled"
              value={scheduled.length}
            />
            <StatusCard
              accent="yellow"
              detail="Ready to finish"
              icon={<PencilSimple size={22} />}
              label="Drafts"
              value={drafts.length}
            />
            <StatusCard
              accent="ink"
              detail="Last 30 days"
              icon={<BookmarkSimple size={22} />}
              label="Shopper saves"
              value={bootstrap.metrics.totals.saves}
            />
          </section>

          <section className="biz-result-section">
            <div className="biz-section-heading">
              <div>
                <p className="biz-kicker">Last 30 days</p>
                <h2>Shopper response</h2>
              </div>
              <button onClick={onViewContent} type="button">
                View all content
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="biz-result-layout">
              <div className="biz-result-hero">
                <span>Publication views</span>
                <strong>{formatCount(bootstrap.metrics.totals.impressions)}</strong>
                <small>Across Marketplace and Window Shopping</small>
              </div>
              <div className="biz-result-breakdown">
                <MetricLine
                  label="Opened"
                  rate={rate(bootstrap.metrics.totals.opens, bootstrap.metrics.totals.impressions)}
                  value={bootstrap.metrics.totals.opens}
                />
                <MetricLine
                  label="Saved"
                  rate={rate(bootstrap.metrics.totals.saves, bootstrap.metrics.totals.impressions)}
                  value={bootstrap.metrics.totals.saves}
                />
                <MetricLine
                  label="Visited your link"
                  rate={rate(bootstrap.metrics.totals.outboundVisits, bootstrap.metrics.totals.impressions)}
                  value={bootstrap.metrics.totals.outboundVisits}
                />
              </div>
            </div>
          </section>

          <section className="biz-recent-section">
            <div className="biz-section-heading">
              <div>
                <p className="biz-kicker">Recent work</p>
                <h2>Publications</h2>
              </div>
              <button onClick={onViewContent} type="button">Open content workspace <ArrowRight size={16} /></button>
            </div>
            <div className="biz-publication-list">
              {publications.slice(0, 4).map((publication) => (
                <PublicationRow
                  key={publication.id}
                  onEdit={() => onEdit(publication)}
                  publication={publication}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ContentView({
  publications,
  onAction,
  onCreate,
  onEdit,
}: {
  publications: BusinessPublication[]
  onAction: (
    publication: BusinessPublication,
    action: 'submit' | 'pause' | 'resume' | 'sold_out' | 'archive',
  ) => void
  onCreate: () => void
  onEdit: (publication: BusinessPublication) => void
}) {
  const [status, setStatus] = useState<'all' | 'attention' | PublicationStatus>('all')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => publications.filter((publication) => {
    const matchesQuery = !query.trim() ||
      `${publication.title} ${publication.bodyText}`.toLowerCase().includes(query.toLowerCase())
    const matchesStatus = status === 'all'
      ? true
      : status === 'attention'
        ? publication.status === 'changes_requested' || publication.status === 'rejected'
        : publication.status === status
    return matchesQuery && matchesStatus
  }), [publications, query, status])

  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Publishing workspace</p>
          <h1>Content</h1>
          <p>Manage every deal, special, promotion, and Window Shopping post.</p>
        </div>
        <button className="biz-primary-button" onClick={onCreate} type="button">
          <Plus size={18} />
          Create publication
        </button>
      </header>

      <section className="biz-content-toolbar">
        <div className="biz-content-tabs" role="tablist" aria-label="Publication status">
          {([
            ['all', 'All'],
            ['attention', 'Action needed'],
            ['draft', 'Drafts'],
            ['submitted', 'In review'],
            ['scheduled', 'Scheduled'],
            ['live', 'Live'],
            ['expired', 'Finished'],
          ] as const).map(([value, label]) => (
            <button
              aria-selected={status === value}
              className={status === value ? 'is-active' : ''}
              key={value}
              onClick={() => setStatus(value)}
              role="tab"
              type="button"
            >
              {label}
              <span>{statusCount(publications, value)}</span>
            </button>
          ))}
        </div>
        <div className="biz-content-tools">
          <label className="biz-search-field">
            <MagnifyingGlass size={18} />
            <span className="sr-only">Search content</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search content"
              type="search"
              value={query}
            />
          </label>
          <button className="biz-filter-button" type="button">
            <Funnel size={18} />
            Filters
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <section className="biz-empty-state">
          <ClipboardText size={42} weight="duotone" />
          <h2>{publications.length === 0 ? 'Publish your first offer' : 'No content matches this view'}</h2>
          <p>
            {publications.length === 0
              ? 'Create a deal, special, promotion, or Window Shopping post.'
              : 'Change the status tab or clear the search.'}
          </p>
          {publications.length === 0 && <button className="biz-primary-button" onClick={onCreate} type="button">Create publication</button>}
        </section>
      ) : (
        <section className="biz-content-table" aria-label="Business publications">
          <div className="biz-content-table-head">
            <span>Publication</span>
            <span>Placement</span>
            <span>Timing</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.map((publication) => (
            <div className="biz-content-row" key={publication.id}>
              <div className="biz-content-identity">
                <div className="biz-content-thumb">
                  {publication.imageUrl
                    ? <img alt="" src={publication.imageUrl} />
                    : <Tag size={23} />}
                </div>
                <div>
                  <span className="biz-kind-label">{kindLabel(publication.kind)}</span>
                  <strong>{publication.title}</strong>
                  <small>Updated {formatRelativeDate(publication.updatedAt)}</small>
                </div>
              </div>
              <div className="biz-content-placement">
                <PlacementIcon publication={publication} />
              </div>
              <div className="biz-content-timing">
                <strong>{publication.startsAt ? formatShortDate(publication.startsAt) : 'Starts after approval'}</strong>
                <small>{publication.endsAt ? `Ends ${formatShortDate(publication.endsAt)}` : 'No end date'}</small>
              </div>
              <div><StatusBadge status={publication.status} /></div>
              <div className="biz-row-actions">
                <button aria-label={`Edit ${publication.title}`} onClick={() => onEdit(publication)} type="button">
                  <PencilSimple size={18} />
                </button>
                {(publication.status === 'draft' || publication.status === 'changes_requested' || publication.status === 'rejected') && (
                  <button aria-label={`Submit ${publication.title}`} onClick={() => onAction(publication, 'submit')} type="button">
                    <ArrowRight size={18} />
                  </button>
                )}
                {publication.status === 'live' && (
                  <button aria-label={`Pause ${publication.title}`} onClick={() => onAction(publication, 'pause')} type="button">
                    <Pause size={18} />
                  </button>
                )}
                {publication.status === 'paused' && (
                  <button aria-label={`Resume ${publication.title}`} onClick={() => onAction(publication, 'resume')} type="button">
                    <Play size={18} />
                  </button>
                )}
                <button aria-label={`Archive ${publication.title}`} onClick={() => onAction(publication, 'archive')} type="button">
                  <Archive size={18} />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function LocationsView({
  bootstrap,
  onBootstrap,
}: {
  bootstrap: BusinessBootstrap
  onBootstrap: (bootstrap: BusinessBootstrap) => void
}) {
  const [adding, setAdding] = useState(bootstrap.locations.length === 0)
  const [draft, setDraft] = useState<BusinessLocationDraft>({
    addressLine: '',
    city: '',
    countryCode: 'ZA',
    name: '',
    province: '',
  })
  const [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function update(field: keyof BusinessLocationDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setIssues([])
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await createBusinessLocation(draft)
      onBootstrap({ ...bootstrap, locations: result.locations })
      setAdding(false)
      setDraft({ addressLine: '', city: '', countryCode: 'ZA', name: '', province: '' })
    } catch (caught) {
      setIssues(
        caught instanceof BusinessApiError
          ? caught.issues
          : ['The location could not be saved. Try again.'],
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Store footprint</p>
          <h1>Locations</h1>
          <p>Choose where each publication is available and keep closed stores out of new work.</p>
        </div>
        <button className="biz-primary-button" onClick={() => setAdding(true)} type="button">
          <Plus size={18} />
          Add location
        </button>
      </header>

      <section className="biz-location-grid">
        {bootstrap.locations.map((location) => (
          <article className="biz-location-card" key={location.id}>
            <div className="biz-location-map"><MapPin size={34} weight="duotone" /></div>
            <div className="biz-location-card-head">
              <div>
                <StatusBadge status={location.status === 'active' ? 'live' : 'archived'} />
                <h2>{location.name}</h2>
              </div>
              <button aria-label={`Edit ${location.name}`} type="button"><PencilSimple size={18} /></button>
            </div>
            <p>{location.addressLine}</p>
            <p>{[location.city, location.province, location.countryCode].filter(Boolean).join(', ')}</p>
            <div className="biz-location-meta">
              <span><ClipboardText size={17} /> {publicationLocationCount(bootstrap.publications, location.id)} publications</span>
              {location.websiteUrl && <a href={location.websiteUrl} rel="noreferrer" target="_blank"><LinkSimple size={17} /> Store link</a>}
            </div>
          </article>
        ))}
      </section>

      {adding && (
        <div className="biz-dialog-backdrop">
          <section aria-labelledby="add-location-title" aria-modal="true" className="biz-dialog" role="dialog">
            <header>
              <div>
                <p className="biz-kicker">New store</p>
                <h2 id="add-location-title">Add location</h2>
              </div>
              <button aria-label="Close location form" onClick={() => setAdding(false)} type="button"><X size={20} /></button>
            </header>
            <form className="biz-form-stack" onSubmit={save}>
              <label>
                Location name
                <input onChange={(event) => update('name', event.target.value)} required value={draft.name} />
              </label>
              <label>
                Street address
                <input onChange={(event) => update('addressLine', event.target.value)} required value={draft.addressLine} />
              </label>
              <div className="biz-form-grid">
                <label>
                  City or town
                  <input onChange={(event) => update('city', event.target.value)} required value={draft.city} />
                </label>
                <label>
                  Province or region
                  <input onChange={(event) => update('province', event.target.value)} value={draft.province} />
                </label>
                <label>
                  Country code
                  <input maxLength={2} onChange={(event) => update('countryCode', event.target.value.toUpperCase())} required value={draft.countryCode} />
                </label>
                <label>
                  Store link
                  <input inputMode="url" onChange={(event) => update('websiteUrl', event.target.value)} placeholder="https://" value={draft.websiteUrl ?? ''} />
                </label>
              </div>
              {issues.length > 0 && <IssueList issues={issues} />}
              <div className="biz-dialog-actions">
                <button className="biz-secondary-button" onClick={() => setAdding(false)} type="button">Cancel</button>
                <button className="biz-primary-button" disabled={busy} type="submit">{busy ? 'Saving' : 'Save location'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

function InsightsView({
  bootstrap,
  onBootstrap,
}: {
  bootstrap: BusinessBootstrap
  onBootstrap: (bootstrap: BusinessBootstrap) => void
}) {
  const [range, setRange] = useState<7 | 30 | 90>(
    bootstrap.metrics.rangeDays === 7 || bootstrap.metrics.rangeDays === 90
      ? bootstrap.metrics.rangeDays
      : 30,
  )
  const [loading, setLoading] = useState(false)

  async function changeRange(days: 7 | 30 | 90) {
    setRange(days)
    setLoading(true)
    try {
      const metrics = await loadBusinessMetrics(days)
      onBootstrap({ ...bootstrap, metrics })
    } finally {
      setLoading(false)
    }
  }

  const metrics = bootstrap.metrics

  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Shopper results</p>
          <h1>Insights</h1>
          <p>See how people find, open, save, and visit your published offers.</p>
        </div>
        <div className="biz-range-switch" aria-label="Insight date range">
          {([7, 30, 90] as const).map((days) => (
            <button className={range === days ? 'is-active' : ''} key={days} onClick={() => void changeRange(days)} type="button">
              {days} days
            </button>
          ))}
        </div>
      </header>

      <section className="biz-insight-grid" aria-busy={loading}>
        <InsightCard icon={<Eye size={23} />} label="Impressions" value={metrics.totals.impressions} />
        <InsightCard icon={<ArrowRight size={23} />} label="Opened" value={metrics.totals.opens} />
        <InsightCard icon={<BookmarkSimple size={23} />} label="Saved" value={metrics.totals.saves} />
        <InsightCard icon={<LinkSimple size={23} />} label="Outbound visits" value={metrics.totals.outboundVisits} />
      </section>

      <section className="biz-insight-detail">
        <div className="biz-section-heading">
          <div>
            <p className="biz-kicker">Daily activity</p>
            <h2>Shopper response over time</h2>
          </div>
          {loading && <span>Loading range</span>}
        </div>
        {metrics.days.length === 0 ? (
          <div className="biz-empty-chart">
            <ChartLineUp size={45} weight="duotone" />
            <h3>Results will appear after shoppers see your content</h3>
            <p>Impressions, opens, saves, and outbound visits are counted without exposing shopper identity.</p>
          </div>
        ) : (
          <div className="biz-daily-table">
            <div><span>Date</span><span>Impressions</span><span>Opened</span><span>Saved</span><span>Visits</span></div>
            {metrics.days.map((day) => (
              <div key={day.date}>
                <strong>{formatShortDate(day.date)}</strong>
                <span>{formatCount(day.impressions)}</span>
                <span>{formatCount(day.opens)}</span>
                <span>{formatCount(day.saves)}</span>
                <span>{formatCount(day.outboundVisits)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AccountView({
  bootstrap,
  onReload,
  onSignOut,
  onTheme,
  theme,
}: {
  bootstrap: BusinessBootstrap
  onReload: () => void
  onSignOut: () => void
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  const account = bootstrap.session.account!
  const organization = bootstrap.gate.organization!
  return (
    <div className="biz-page">
      <header className="biz-page-header">
        <div>
          <p className="biz-kicker">Workspace controls</p>
          <h1>Account</h1>
          <p>Manage organization details, appearance, plan use, and support.</p>
        </div>
        <button className="biz-secondary-button" onClick={onReload} type="button">
          <ArrowClockwise size={18} />
          Refresh account
        </button>
      </header>
      <div className="biz-settings-layout">
        <section className="biz-settings-card">
          <div className="biz-settings-card-head">
            <span className="biz-settings-icon"><Storefront size={24} /></span>
            <div>
              <h2>Organization profile</h2>
              <p>Public identity shown on business publications.</p>
            </div>
          </div>
          <dl>
            <div><dt>Business name</dt><dd>{organization.name}</dd></div>
            <div><dt>Storefront address</dt><dd>/{organization.slug}</dd></div>
            <div><dt>Workspace status</dt><dd><StatusBadge status="live" /></dd></div>
          </dl>
          <button className="biz-secondary-button" type="button">Edit public profile</button>
        </section>
        <section className="biz-settings-card">
          <div className="biz-settings-card-head">
            <span className="biz-settings-icon"><UserCircle size={24} /></span>
            <div>
              <h2>Owner account</h2>
              <p>Account used to manage this workspace.</p>
            </div>
          </div>
          <dl>
            <div><dt>Name</dt><dd>{account.displayName}</dd></div>
            <div><dt>Email</dt><dd>{account.email}</dd></div>
            <div><dt>Role</dt><dd>Owner</dd></div>
          </dl>
        </section>
        <section className="biz-settings-card">
          <div className="biz-settings-card-head">
            <span className="biz-settings-icon">{theme === 'light' ? <Sun size={24} /> : <MoonStars size={24} />}</span>
            <div>
              <h2>Appearance</h2>
              <p>Choose the workspace theme for this device.</p>
            </div>
          </div>
          <div className="biz-theme-options">
            <button className={theme === 'light' ? 'is-active' : ''} onClick={() => onTheme('light')} type="button"><Sun size={19} /> Light</button>
            <button className={theme === 'dark' ? 'is-active' : ''} onClick={() => onTheme('dark')} type="button"><MoonStars size={19} /> Dark</button>
          </div>
        </section>
        <section className="biz-settings-card">
          <div className="biz-settings-card-head">
            <span className="biz-settings-icon"><Tag size={24} /></span>
            <div>
              <h2>Business plan</h2>
              <p>Your publication capacity and campaign benefits.</p>
            </div>
          </div>
          <dl>
            <div><dt>Live publications</dt><dd>{bootstrap.publications.filter((publication) => liveLike(publication.status)).length} of 25</dd></div>
            <div><dt>Shop profiles</dt><dd>1 of 1</dd></div>
            <div><dt>Sponsored campaigns</dt><dd>3 included monthly</dd></div>
          </dl>
          <button className="biz-secondary-button" type="button">Manage billing</button>
        </section>
        <section className="biz-settings-card biz-support-card">
          <div className="biz-settings-card-head">
            <span className="biz-settings-icon"><Lifebuoy size={24} /></span>
            <div>
              <h2>Support</h2>
              <p>Get help with review, billing, or publication setup.</p>
            </div>
          </div>
          <a className="biz-secondary-button" href="https://trolleyscout.co.za/support">Open support</a>
        </section>
        <section className="biz-settings-card biz-signout-card">
          <div>
            <h2>Sign out</h2>
            <p>End the business session on this device.</p>
          </div>
          <button className="biz-danger-button" onClick={onSignOut} type="button"><SignOut size={18} /> Sign out</button>
        </section>
      </div>
    </div>
  )
}

function EmptySetup({ hasLocation, onCreate }: { hasLocation: boolean; onCreate: () => void }) {
  return (
    <section className="biz-setup-panel">
      <div>
        <p className="biz-kicker">First publication</p>
        <h2>Put your storefront in front of shoppers</h2>
        <p>Create a deal with a photo, price, destination, and end date. The consumer preview shows the exact card before review.</p>
        <button className="biz-primary-button" onClick={onCreate} type="button">Create first deal <ArrowRight size={18} /></button>
      </div>
      <ol>
        <li className="is-complete"><CheckCircle size={20} weight="fill" /><span><strong>Organization approved</strong><small>Your business workspace is open.</small></span></li>
        <li className={hasLocation ? 'is-complete' : ''}>{hasLocation ? <CheckCircle size={20} weight="fill" /> : <span>2</span>}<span><strong>Add a location</strong><small>Target content to the correct stores.</small></span></li>
        <li><span>3</span><span><strong>Create a publication</strong><small>Submit it for the shopper feed.</small></span></li>
      </ol>
    </section>
  )
}

function StatusCard({
  accent,
  detail,
  icon,
  label,
  value,
}: {
  accent: 'green' | 'blue' | 'yellow' | 'ink'
  detail: string
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <article className={`biz-status-card is-${accent}`}>
      <div><span>{icon}</span><small>{label}</small></div>
      <strong>{formatCount(value)}</strong>
      <p>{detail}</p>
    </article>
  )
}

function InsightCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="biz-insight-card">
      <span>{icon}</span>
      <div><small>{label}</small><strong>{formatCount(value)}</strong></div>
    </article>
  )
}

function MetricLine({ label, rate: percentage, value }: { label: string; rate: number; value: number }) {
  return (
    <div className="biz-metric-line">
      <span>{label}</span>
      <strong>{formatCount(value)}</strong>
      <small>{percentage.toFixed(1)}% of impressions</small>
    </div>
  )
}

function PublicationRow({ onEdit, publication }: { onEdit: () => void; publication: BusinessPublication }) {
  return (
    <article className="biz-publication-row">
      <div className="biz-content-thumb">
        {publication.imageUrl ? <img alt="" src={publication.imageUrl} /> : <Tag size={22} />}
      </div>
      <div className="biz-publication-title">
        <span>{kindLabel(publication.kind)}</span>
        <strong>{publication.title}</strong>
      </div>
      <PlacementIcon publication={publication} />
      <StatusBadge status={publication.status} />
      <span className="biz-publication-date">{publication.endsAt ? `Ends ${formatShortDate(publication.endsAt)}` : 'No end date'}</span>
      <button aria-label={`Edit ${publication.title}`} onClick={onEdit} type="button"><ArrowRight size={18} /></button>
    </article>
  )
}

function PlacementIcon({ publication }: { publication: BusinessPublication }) {
  return (
    <span className="biz-placement-label">
      {publication.placement === 'window'
        ? <Storefront size={17} />
        : publication.placement === 'both'
          ? <Buildings size={17} />
          : <Tag size={17} />}
      {publication.placement === 'marketplace'
        ? 'Marketplace'
        : publication.placement === 'window'
          ? 'Window Shopping'
          : 'Both surfaces'}
    </span>
  )
}

function StatusBadge({ status }: { status: PublicationStatus }) {
  return <span className={`biz-status-badge is-${status}`}>{statusLabel(status)}</span>
}

function statusLabel(status: PublicationStatus): string {
  return {
    archived: 'Archived',
    changes_requested: 'Changes requested',
    draft: 'Draft',
    expired: 'Finished',
    live: 'Live',
    paused: 'Paused',
    rejected: 'Not approved',
    scheduled: 'Scheduled',
    submitted: 'In review',
  }[status]
}

function kindLabel(kind: BusinessPublication['kind']): string {
  return { deal: 'Deal', post: 'Post', promotion: 'Promotion', special: 'Special' }[kind]
}

function statusCount(
  publications: BusinessPublication[],
  status: 'all' | 'attention' | PublicationStatus,
): number {
  if (status === 'all') return publications.length
  if (status === 'attention') {
    return publications.filter((publication) =>
      publication.status === 'changes_requested' || publication.status === 'rejected',
    ).length
  }
  return publications.filter((publication) => publication.status === status).length
}

function liveLike(status: PublicationStatus): boolean {
  return status === 'live' || status === 'scheduled'
}

function actionNotice(action: string): string {
  return {
    archive: 'Publication archived.',
    pause: 'Publication paused.',
    resume: 'Publication resumed.',
    sold_out: 'Publication marked sold out.',
    submit: 'Publication submitted for review.',
  }[action] ?? 'Publication updated.'
}

function nextScheduleText(publications: BusinessPublication[]): string {
  const next = publications
    .map((publication) => publication.startsAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]
  return next ? `Next ${formatShortDate(next)}` : 'Nothing queued'
}

function publicationLocationCount(publications: BusinessPublication[], locationId: string): number {
  return publications.filter((publication) => publication.locationIds?.includes(locationId)).length
}

function rate(value: number, total: number): number {
  return total > 0 ? value / total * 100 : 0
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-ZA', { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value)
}

function formatShortDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(date)
    : value
}

function formatLongDate(value: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(value)
}

function formatRelativeDate(value: string): string {
  const date = new Date(value)
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
  if (!Number.isFinite(days) || days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there'
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}
