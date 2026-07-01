import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowClockwise,
  BookmarkSimple,
  CheckCircle,
  ClipboardText,
  CreditCard,
  HouseLine,
  LinkSimple,
  List,
  MagnifyingGlass,
  MoonStars,
  ReceiptX,
  ShieldCheck,
  SlidersHorizontal,
  SignOut,
  Storefront,
  Sun,
  Tag,
  UserCircle,
  Wallet,
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { motion } from 'motion/react'
import {
  getInitialOfferState,
  getInitialRetailerState,
  loadOffers,
  loadRetailers,
  type ResourceState,
  type OfferResource,
  type RetailerResource,
  createVerifiedOffer,
  deleteVerifiedOffer,
  deleteSavedSource,
  endMemberSession,
  getInitialMemberState,
  getInitialDiscoveryState,
  getInitialSavedSourceState,
  getInitialSubscriptionState,
  loadMemberSession,
  loadDiscovery,
  validateOfferDraft,
  loadSavedSources,
  loadSubscription,
  saveSourceForMember,
  startMemberSession,
  startSubscriptionCheckout,
} from './services/apiClient'
import type {
  MemberSession,
  MemberPlanId,
  MemberSessionDraft,
  OfferDraft,
  OfferValidationResult,
  Retailer,
  SourceKind,
  DiscoveredDeal,
  VerifiedOffer,
} from './types'
import type {
  DiscoveryResource,
  MemberResource,
  SavedSourceResource,
  SubscriptionResource,
} from './services/apiClient'

type ThemeMode = 'light' | 'dark'
type ActiveView = 'sources' | 'discovery' | 'offers' | 'scanner' | 'rules'
type MemberView =
  | 'dashboard'
  | 'sources'
  | 'discovery'
  | 'saved'
  | 'offers'
  | 'scanner'
  | 'subscription'
  | 'profile'
  | 'rules'

const viewOptions: Array<{ label: string; value: ActiveView }> = [
  { label: 'Sources', value: 'sources' },
  { label: 'Find deals', value: 'discovery' },
  { label: 'Offers', value: 'offers' },
  { label: 'Scanner', value: 'scanner' },
  { label: 'Rules', value: 'rules' },
]

const memberViewOptions: Array<{ icon: ReactNode; label: string; value: MemberView }> = [
  { icon: <HouseLine size={20} />, label: 'Dashboard', value: 'dashboard' },
  { icon: <Storefront size={20} />, label: 'Sources', value: 'sources' },
  { icon: <Tag size={20} />, label: 'Find deals', value: 'discovery' },
  { icon: <BookmarkSimple size={20} />, label: 'Saved sources', value: 'saved' },
  { icon: <ReceiptX size={20} />, label: 'Offers', value: 'offers' },
  { icon: <ShieldCheck size={20} />, label: 'Scanner', value: 'scanner' },
  { icon: <CreditCard size={20} />, label: 'Subscription', value: 'subscription' },
  { icon: <UserCircle size={20} />, label: 'Profile', value: 'profile' },
  { icon: <ClipboardText size={20} />, label: 'Rules', value: 'rules' },
]

const sourceLabels: Record<SourceKind | 'all', string> = {
  all: 'All',
  app: 'App',
  loyalty: 'Loyalty',
  specials: 'Specials',
  'store-finder': 'Store finder',
}

const initialRetailers = getInitialRetailerState().data.retailers
const defaultRetailerId = initialRetailers[0]?.id ?? 'pick-n-pay'

function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getPreferredTheme())
  const [activeView, setActiveView] = useState<ActiveView>('sources')
  const [query, setQuery] = useState('')
  const [sourceKind, setSourceKind] = useState<SourceKind | 'all'>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [retailerState, setRetailerState] = useState<ResourceState<RetailerResource>>(
    getInitialRetailerState,
  )
  const [offerState, setOfferState] = useState<ResourceState<OfferResource>>(getInitialOfferState)
  const [discoveryState, setDiscoveryState] = useState<ResourceState<DiscoveryResource>>(
    getInitialDiscoveryState,
  )
  const [discoveryKey, setDiscoveryKey] = useState(0)
  const [scannerDraft, setScannerDraft] = useState<OfferDraft>(() => createBlankDraft())
  const [scannerResult, setScannerResult] = useState<ResourceState<OfferValidationResult> | undefined>()
  const [isScanning, setIsScanning] = useState(false)
  const [isSavingOffer, setIsSavingOffer] = useState(false)
  const [deletingOfferId, setDeletingOfferId] = useState<string | undefined>()
  const [writeNotice, setWriteNotice] = useState<string | undefined>()
  const [memberMode, setMemberMode] = useState(false)
  const [memberView, setMemberView] = useState<MemberView>('dashboard')
  const [isMemberSidebarOpen, setIsMemberSidebarOpen] = useState(false)
  const [memberState, setMemberState] = useState<ResourceState<MemberResource>>(getInitialMemberState)
  const [savedSourceState, setSavedSourceState] = useState<ResourceState<SavedSourceResource>>(
    getInitialSavedSourceState,
  )
  const [subscriptionState, setSubscriptionState] = useState<ResourceState<SubscriptionResource>>(
    getInitialSubscriptionState,
  )
  const [memberDraft, setMemberDraft] = useState<MemberSessionDraft>({
    displayName: '',
    email: '',
  })
  const [memberNotice, setMemberNotice] = useState<string | undefined>()
  const [isStartingMemberSession, setIsStartingMemberSession] = useState(false)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [savingSourceUrl, setSavingSourceUrl] = useState<string | undefined>()
  const [deletingSourceId, setDeletingSourceId] = useState<string | undefined>()
  const [checkoutPlanId, setCheckoutPlanId] = useState<MemberPlanId | undefined>()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('trolley-scout-theme', theme)
  }, [theme])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setRetailerState((current) => ({
        ...current,
        message: 'Checking source directory.',
        status: 'loading',
      }))

      loadRetailers({
        query,
        sourceKind,
        signal: controller.signal,
      })
        .then(setRetailerState)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
        })
        .finally(() => setIsRefreshing(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, refreshKey, sourceKind])

  useEffect(() => {
    const controller = new AbortController()

    setOfferState((current) => ({
      ...current,
      message: 'Checking offer board.',
      status: 'loading',
    }))

    loadOffers(controller.signal)
      .then(setOfferState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
      .finally(() => setIsRefreshing(false))

    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const controller = new AbortController()

    loadMemberSession(controller.signal)
      .then((state) => {
        setMemberState(state)

        if (state.data.session.isAuthenticated) {
          setMemberMode(true)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    if (!memberState.data.session.isAuthenticated) {
      setSavedSourceState(getInitialSavedSourceState())
      setSubscriptionState(getInitialSubscriptionState())
      return () => controller.abort()
    }

    setSavedSourceState((current) => ({
      ...current,
      message: 'Checking saved sources.',
      status: 'loading',
    }))
    setSubscriptionState((current) => ({
      ...current,
      message: 'Checking subscription.',
      status: 'loading',
    }))

    loadSavedSources(controller.signal)
      .then(setSavedSourceState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
    loadSubscription(controller.signal)
      .then(setSubscriptionState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })

    return () => controller.abort()
  }, [memberState.data.session.isAuthenticated])

  const sourceKinds = retailerState.data.summary.sourceKinds
  const filteredRetailers = retailerState.data.retailers
  const officialSourceCount = retailerState.data.summary.sourceCount
  const verifiedOfferCount = offerState.data.summary.verifiedOfferCount
  const retailerCount = retailerState.data.summary.retailerCount
  const apiMode = retailerState.meta.source === 'cloudflare-pages' ? 'API live' : 'Local list'
  const memberSession = memberState.data.session
  const discoveryVisible =
    activeView === 'discovery' || (memberSession.isAuthenticated && memberView === 'discovery')
  const savedSourceUrls = new Set(savedSourceState.data.savedSources.map((source) => source.sourceUrl))
  const savedSourceCount = savedSourceState.data.savedSources.length

  useEffect(() => {
    const controller = new AbortController()

    if (!discoveryVisible) {
      return () => controller.abort()
    }

    setIsDiscovering(true)
    setDiscoveryState((current) => ({
      ...current,
      message: 'Checking deal sources.',
      status: 'loading',
    }))

    loadDiscovery(controller.signal)
      .then(setDiscoveryState)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      })
      .finally(() => setIsDiscovering(false))

    return () => controller.abort()
  }, [discoveryKey, discoveryVisible])

  function refreshSources() {
    setIsRefreshing(true)
    setRefreshKey((current) => current + 1)
  }

  function runDiscovery() {
    setDiscoveryKey((current) => current + 1)
  }

  function updateMemberDraft(field: keyof MemberSessionDraft, value: string) {
    setMemberNotice(undefined)
    setMemberDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function startMemberModeSession() {
    setIsStartingMemberSession(true)
    setMemberNotice(undefined)

    try {
      const result = await startMemberSession(memberDraft)
      setMemberState(result)
      setMemberNotice(result.message)

      if (result.data.session.isAuthenticated) {
        setMemberMode(true)
        setMemberView('dashboard')
      }
    } finally {
      setIsStartingMemberSession(false)
    }
  }

  async function signOutMemberMode() {
    const result = await endMemberSession()
    setMemberState(result)
    setSavedSourceState(getInitialSavedSourceState())
    setSubscriptionState(getInitialSubscriptionState())
    setMemberMode(false)
    setMemberView('dashboard')
    setMemberNotice(undefined)
  }

  async function saveSource(retailerId: Retailer['id'], sourceUrl: string) {
    if (!memberSession.isAuthenticated) {
      setMemberMode(true)
      setMemberNotice('Start a member session before saving sources.')
      return
    }

    setSavingSourceUrl(sourceUrl)
    setMemberNotice(undefined)

    try {
      const result = await saveSourceForMember({ retailerId, sourceUrl })

      if ('savedSources' in result.data) {
        setSavedSourceState({
          data: {
            savedSources: result.data.savedSources,
          },
          message: result.message,
          meta: result.meta,
          status: result.status,
        })
        setMemberNotice(result.message)
      }
    } finally {
      setSavingSourceUrl(undefined)
    }
  }

  async function removeSavedSource(id: string) {
    setDeletingSourceId(id)
    setMemberNotice(undefined)

    try {
      const result = await deleteSavedSource(id)
      setSavedSourceState({
        data: {
          savedSources: result.data.savedSources,
        },
        message: result.message,
        meta: result.meta,
        status: result.status,
      })
      setMemberNotice(result.message)
    } finally {
      setDeletingSourceId(undefined)
    }
  }

  async function requestCheckout(planId: MemberPlanId) {
    setCheckoutPlanId(planId)
    setMemberNotice(undefined)

    try {
      const result = await startSubscriptionCheckout({ planId })
      setMemberNotice(result.message)

      if (result.data.checkout.checkoutUrl) {
        window.location.href = result.data.checkout.checkoutUrl
      }

      const subscription = await loadSubscription()
      setSubscriptionState(subscription)
    } finally {
      setCheckoutPlanId(undefined)
    }
  }

  function updateScannerDraft(field: keyof OfferDraft, value: string) {
    setWriteNotice(undefined)
    setScannerDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function resetScannerDraft() {
    setScannerDraft(createBlankDraft())
    setScannerResult(undefined)
    setWriteNotice(undefined)
  }

  function reviewDiscoveredDeal(deal: DiscoveredDeal) {
    setScannerDraft({
      capturedAt: deal.capturedAt.slice(0, 10),
      priceText: deal.priceText ?? '',
      retailerId: deal.retailerId,
      savingText: deal.savingText ?? '',
      sourceUrl: deal.productUrl || deal.sourceUrl,
      termsText: deal.evidenceText,
      title: deal.title,
      validFrom: '',
      validTo: '',
    })
    setScannerResult(undefined)
    setWriteNotice('Discovery row copied to scanner. Add valid dates and source terms before saving.')

    if (memberSession.isAuthenticated) {
      setMemberView('scanner')
      return
    }

    setActiveView('scanner')
  }

  async function scanOfferDraft() {
    setIsScanning(true)
    setWriteNotice(undefined)

    try {
      const result = await validateOfferDraft(scannerDraft)
      setScannerResult(result)
    } finally {
      setIsScanning(false)
    }
  }

  async function saveScannerDraft() {
    setIsSavingOffer(true)
    setWriteNotice(undefined)

    try {
      const result = await createVerifiedOffer(scannerDraft)

      if ('offer' in result.data) {
        const savedData = result.data

        setWriteNotice('Verified offer saved.')
        setOfferState((current) => ({
          data: {
            offers: [
              savedData.offer,
              ...current.data.offers.filter((offer) => offer.id !== savedData.offer.id),
            ],
            summary: savedData.summary,
          },
          message: result.message,
          meta: result.meta,
          status: 'ready',
        }))
        setActiveView('offers')
      } else {
        setScannerResult({
          data: result.data,
          message: result.message,
          meta: result.meta,
          status: result.status,
        })
      }
    } finally {
      setIsSavingOffer(false)
    }
  }

  async function removeOffer(id: string) {
    setDeletingOfferId(id)
    setWriteNotice(undefined)

    try {
      const result = await deleteVerifiedOffer(id)
      setWriteNotice(result.message)

      if (result.data.deleted) {
        setOfferState((current) => ({
          data: {
            offers: current.data.offers.filter((offer) => offer.id !== id),
            summary: result.data.summary,
          },
          message: result.message,
          meta: result.meta,
          status: 'ready',
        }))
      }
    } finally {
      setDeletingOfferId(undefined)
    }
  }

  if (memberMode && !memberSession.isAuthenticated) {
    return (
      <MemberAuthScreen
        draft={memberDraft}
        isStarting={isStartingMemberSession}
        memberState={memberState}
        notice={memberNotice}
        onBack={() => {
          setMemberMode(false)
          setMemberNotice(undefined)
        }}
        onSubmit={startMemberModeSession}
        onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onUpdate={updateMemberDraft}
        theme={theme}
      />
    )
  }

  if (memberSession.isAuthenticated && memberSession.account) {
    return (
      <MemberShell
        activeView={memberView}
        apiMode={apiMode}
        checkoutPlanId={checkoutPlanId}
        deletingOfferId={deletingOfferId}
        deletingSourceId={deletingSourceId}
        discoveryState={discoveryState}
        isDiscovering={isDiscovering}
        isRefreshing={isRefreshing}
        isSavingOffer={isSavingOffer}
        isScanning={isScanning}
        memberNotice={memberNotice}
        memberState={memberState}
        offerState={offerState}
        onCheckout={requestCheckout}
        onCloseSidebar={() => setIsMemberSidebarOpen(false)}
        onDeleteOffer={removeOffer}
        onDeleteSource={removeSavedSource}
        onRefresh={refreshSources}
        onReviewDeal={reviewDiscoveredDeal}
        onRunDiscovery={runDiscovery}
        onResetScanner={resetScannerDraft}
        onSaveOffer={saveScannerDraft}
        onSaveSource={saveSource}
        onScan={scanOfferDraft}
        onSetView={setMemberView}
        onSignOut={signOutMemberMode}
        onThemeToggle={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        onToggleSidebar={() => setIsMemberSidebarOpen((current) => !current)}
        onUpdateScanner={updateScannerDraft}
        onQueryChange={setQuery}
        onSourceKindChange={setSourceKind}
        query={query}
        retailerState={retailerState}
        savedSourceCount={savedSourceCount}
        savedSourceState={savedSourceState}
        savedSourceUrls={savedSourceUrls}
        savingSourceUrl={savingSourceUrl}
        scannerDraft={scannerDraft}
        scannerResult={scannerResult}
        sidebarOpen={isMemberSidebarOpen}
        sourceKind={sourceKind}
        subscriptionState={subscriptionState}
        theme={theme}
        writeNotice={writeNotice}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand-mark" href="#top" aria-label="Trolley Scout home">
          <img src="/assets/brand-mark.png" alt="" />
          <span>Trolley Scout</span>
        </a>

        <nav className="view-switcher" aria-label="App views">
          {viewOptions.map((view) => (
            <button
              className={clsx('switcher-button', activeView === view.value && 'is-active')}
              key={view.value}
              onClick={() => setActiveView(view.value)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </nav>

        <div className="topbar-actions">
          <button className="member-button" onClick={() => setMemberMode(true)} type="button">
            <UserCircle size={18} />
            Sign in
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            type="button"
            aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
          >
            {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <p className="eyebrow">South African grocery source tracker</p>
            <h1>Trolley Scout</h1>
            <p className="hero-text">
              Track official specials, loyalty, app, and store pages across major South African
              grocers. Offers stay hidden until the source, date, and terms are checked.
            </p>

            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={refreshSources}>
                <ArrowClockwise size={18} className={clsx(isRefreshing && 'is-spinning')} />
                Check sources
              </button>
              <button className="ghost-button" type="button" onClick={() => setActiveView('offers')}>
                <ReceiptX size={18} />
                View offers
              </button>
            </div>
          </div>

          <div className="hero-visual" aria-label="Trolley Scout grocery source image">
            <img src="/assets/hero-grocery-source.png" alt="" />
            <div className="source-status-card">
              <span className="status-dot" />
              <div>
                <p className="receipt-label">Data mode</p>
                <strong>Verified sources only</strong>
              </div>
              <p>Offer rows require an official URL and capture date.</p>
            </div>
          </div>
        </section>

        <section className="metric-strip" aria-label="Source overview">
          <Metric icon={<Storefront size={22} />} label="Retailers" value={`${retailerCount}`} />
          <Metric icon={<LinkSimple size={22} />} label="Official links" value={`${officialSourceCount}`} />
          <Metric icon={<ReceiptX size={22} />} label="Verified offers" value={`${verifiedOfferCount}`} />
          <Metric icon={<ShieldCheck size={22} />} label="Backend" value={apiMode} />
        </section>

        <RuntimeBanner retailerState={retailerState} offerState={offerState} />

        {activeView === 'sources' && (
          <>
            <section className="filter-panel" aria-label="Source filters">
              <div className="search-field">
                <MagnifyingGlass size={20} />
                <input
                  aria-label="Search sources"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search store, program, or source type"
                  value={query}
                />
                {query && (
                  <button aria-label="Clear search" onClick={() => setQuery('')} type="button">
                    Clear
                  </button>
                )}
              </div>

              <div className="filter-row">
                <span className="filter-label">
                  <SlidersHorizontal size={18} />
                  Type
                </span>
                <button
                  className={clsx('chip', sourceKind === 'all' && 'is-active')}
                  onClick={() => setSourceKind('all')}
                  type="button"
                >
                  {sourceLabels.all}
                </button>
                {sourceKinds.map((kind) => (
                  <button
                    className={clsx('chip', sourceKind === kind && 'is-active')}
                    key={kind}
                    onClick={() => setSourceKind(kind)}
                    type="button"
                  >
                    {sourceLabels[kind]}
                  </button>
                ))}
              </div>
            </section>

            <SourcePanel retailers={filteredRetailers} isLoading={retailerState.status === 'loading'} />
          </>
        )}

        {activeView === 'discovery' && (
          <DiscoveryPanel
            isDiscovering={isDiscovering}
            onReviewDeal={reviewDiscoveredDeal}
            onRunDiscovery={runDiscovery}
            state={discoveryState}
          />
        )}

        {activeView === 'offers' && (
          <OffersPanel
            deletingOfferId={deletingOfferId}
            onDelete={removeOffer}
            state={offerState}
            writeNotice={writeNotice}
          />
        )}
        {activeView === 'scanner' && (
          <ScannerPanel
            draft={scannerDraft}
            isSaving={isSavingOffer}
            isScanning={isScanning}
            onReset={resetScannerDraft}
            onSave={saveScannerDraft}
            onScan={scanOfferDraft}
            onUpdate={updateScannerDraft}
            result={scannerResult}
            writeNotice={writeNotice}
          />
        )}
        {activeView === 'rules' && <RulesPanel />}
      </main>
    </div>
  )
}

function MemberAuthScreen({
  draft,
  isStarting,
  memberState,
  notice,
  onBack,
  onSubmit,
  onThemeToggle,
  onUpdate,
  theme,
}: {
  draft: MemberSessionDraft
  isStarting: boolean
  memberState: ResourceState<MemberResource>
  notice?: string
  onBack: () => void
  onSubmit: () => void
  onThemeToggle: () => void
  onUpdate: (field: keyof MemberSessionDraft, value: string) => void
  theme: ThemeMode
}) {
  return (
    <div className="app-shell auth-shell">
      <header className="topbar">
        <button className="brand-mark brand-button" onClick={onBack} type="button">
          <img src="/assets/brand-mark.png" alt="" />
          <span>Trolley Scout</span>
        </button>
        <div />
        <button
          className="icon-button"
          onClick={onThemeToggle}
          type="button"
          aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        >
          {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
        </button>
      </header>

      <main>
        <section className="auth-panel" aria-label="Member sign in">
          <div className="auth-copy">
            <p className="eyebrow">Member workspace</p>
            <h1>Trolley Scout account</h1>
            <p>
              Start a member session to save official source pages, manage plan state, and use the
              dashboard view.
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault()
              void onSubmit()
            }}
          >
            <label className="field">
              Display name
              <input
                autoComplete="name"
                onChange={(event) => onUpdate('displayName', event.target.value)}
                placeholder="Your name"
                value={draft.displayName}
              />
            </label>
            <label className="field">
              Email
              <input
                autoComplete="email"
                onChange={(event) => onUpdate('email', event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={draft.email}
              />
            </label>
            {(notice || memberState.status === 'error') && (
              <div className="write-notice">{notice ?? memberState.message}</div>
            )}
            <div className="scanner-actions">
              <button className="primary-button" disabled={isStarting} type="submit">
                <UserCircle size={18} />
                {isStarting ? 'Starting' : 'Start session'}
              </button>
              <button className="ghost-button" onClick={onBack} type="button">
                Back
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

function MemberShell({
  activeView,
  apiMode,
  checkoutPlanId,
  deletingOfferId,
  deletingSourceId,
  discoveryState,
  isDiscovering,
  isRefreshing,
  isSavingOffer,
  isScanning,
  memberNotice,
  memberState,
  offerState,
  onCheckout,
  onCloseSidebar,
  onDeleteOffer,
  onDeleteSource,
  onQueryChange,
  onRefresh,
  onReviewDeal,
  onRunDiscovery,
  onResetScanner,
  onSaveOffer,
  onSaveSource,
  onScan,
  onSetView,
  onSignOut,
  onSourceKindChange,
  onThemeToggle,
  onToggleSidebar,
  onUpdateScanner,
  query,
  retailerState,
  savedSourceCount,
  savedSourceState,
  savedSourceUrls,
  savingSourceUrl,
  scannerDraft,
  scannerResult,
  sidebarOpen,
  sourceKind,
  subscriptionState,
  theme,
  writeNotice,
}: {
  activeView: MemberView
  apiMode: string
  checkoutPlanId?: MemberPlanId
  deletingOfferId?: string
  deletingSourceId?: string
  discoveryState: ResourceState<DiscoveryResource>
  isDiscovering: boolean
  isRefreshing: boolean
  isSavingOffer: boolean
  isScanning: boolean
  memberNotice?: string
  memberState: ResourceState<MemberResource>
  offerState: ResourceState<OfferResource>
  onCheckout: (planId: MemberPlanId) => void
  onCloseSidebar: () => void
  onDeleteOffer: (id: string) => void
  onDeleteSource: (id: string) => void
  onQueryChange: (value: string) => void
  onRefresh: () => void
  onReviewDeal: (deal: DiscoveredDeal) => void
  onRunDiscovery: () => void
  onResetScanner: () => void
  onSaveOffer: () => void
  onSaveSource: (retailerId: Retailer['id'], sourceUrl: string) => void
  onScan: () => void
  onSetView: (view: MemberView) => void
  onSignOut: () => void
  onSourceKindChange: (value: SourceKind | 'all') => void
  onThemeToggle: () => void
  onToggleSidebar: () => void
  onUpdateScanner: (field: keyof OfferDraft, value: string) => void
  query: string
  retailerState: ResourceState<RetailerResource>
  savedSourceCount: number
  savedSourceState: ResourceState<SavedSourceResource>
  savedSourceUrls: Set<string>
  savingSourceUrl?: string
  scannerDraft: OfferDraft
  scannerResult?: ResourceState<OfferValidationResult>
  sidebarOpen: boolean
  sourceKind: SourceKind | 'all'
  subscriptionState: ResourceState<SubscriptionResource>
  theme: ThemeMode
  writeNotice?: string
}) {
  const account = memberState.data.session.account

  if (!account) {
    return null
  }

  const sourceKinds = retailerState.data.summary.sourceKinds

  return (
    <div className="member-shell">
      <header className="member-topbar">
        <button className="icon-button" id="member-menu" onClick={onToggleSidebar} type="button" aria-label="Menu">
          <List size={20} />
        </button>
        <a className="brand-mark" href="#member-main" aria-label="Trolley Scout dashboard">
          <img src="/assets/brand-mark.png" alt="" />
          <span>Trolley Scout</span>
        </a>
        <div className="member-topbar-actions">
          <span className="plan-pill">{account.planName}</span>
          <button
            className="icon-button"
            onClick={onThemeToggle}
            type="button"
            aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
          >
            {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
          </button>
          <button className="icon-button" onClick={onSignOut} type="button" aria-label="Sign out">
            <SignOut size={20} />
          </button>
        </div>
      </header>

      {sidebarOpen && <button className="member-backdrop" onClick={onCloseSidebar} type="button" aria-label="Close menu" />}

      <aside className={clsx('member-sidebar', sidebarOpen && 'is-open')} id="member-sidebar">
        <button className="member-profile-button" onClick={() => onSetView('profile')} type="button">
          <span>{account.initials}</span>
          <div>
            <strong>{account.displayName}</strong>
            <small>{account.planName}</small>
          </div>
        </button>
        <nav className="member-nav" aria-label="Member navigation">
          {memberViewOptions.map((item) => (
            <button
              className={clsx('member-nav-button', activeView === item.value && 'is-active')}
              key={item.value}
              onClick={() => {
                onSetView(item.value)
                onCloseSidebar()
              }}
              type="button"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="member-main" id="member-main">
        {activeView === 'dashboard' && (
          <MemberDashboard
            account={account}
            apiMode={apiMode}
            discoveryCount={discoveryState.data.discovery.summary.foundDealCount}
            onRefresh={onRefresh}
            onSetView={onSetView}
            retailerState={retailerState}
            savedSourceCount={savedSourceCount}
            verifiedOfferCount={offerState.data.summary.verifiedOfferCount}
          />
        )}

        {activeView === 'sources' && (
          <>
            <section className="member-section-head">
              <div>
                <p className="eyebrow">Official sources</p>
                <h1>Source directory</h1>
              </div>
              <button className="primary-button" type="button" onClick={onRefresh}>
                <ArrowClockwise size={18} className={clsx(isRefreshing && 'is-spinning')} />
                Check sources
              </button>
            </section>
            <SourceFilterPanel
              onQueryChange={onQueryChange}
              onSourceKindChange={onSourceKindChange}
              query={query}
              sourceKind={sourceKind}
              sourceKinds={sourceKinds}
            />
            <SourcePanel
              isLoading={retailerState.status === 'loading'}
              memberMode
              onSaveSource={onSaveSource}
              retailers={retailerState.data.retailers}
              savedSourceUrls={savedSourceUrls}
              savingSourceUrl={savingSourceUrl}
            />
          </>
        )}

        {activeView === 'discovery' && (
          <DiscoveryPanel
            isDiscovering={isDiscovering}
            onReviewDeal={onReviewDeal}
            onRunDiscovery={onRunDiscovery}
            state={discoveryState}
          />
        )}

        {activeView === 'saved' && (
          <SavedSourcesPanel
            deletingSourceId={deletingSourceId}
            memberNotice={memberNotice}
            onDelete={onDeleteSource}
            savedSourceState={savedSourceState}
          />
        )}

        {activeView === 'offers' && (
          <OffersPanel
            deletingOfferId={deletingOfferId}
            onDelete={onDeleteOffer}
            state={offerState}
            writeNotice={writeNotice}
          />
        )}

        {activeView === 'scanner' && (
          <ScannerPanel
            draft={scannerDraft}
            isSaving={isSavingOffer}
            isScanning={isScanning}
            onReset={onResetScanner}
            onSave={onSaveOffer}
            onScan={onScan}
            onUpdate={onUpdateScanner}
            result={scannerResult}
            writeNotice={writeNotice}
          />
        )}

        {activeView === 'subscription' && (
          <SubscriptionPanel
            account={account}
            checkoutPlanId={checkoutPlanId}
            memberNotice={memberNotice}
            onCheckout={onCheckout}
            subscriptionState={subscriptionState}
          />
        )}

        {activeView === 'profile' && (
          <MemberProfilePanel
            account={account}
            memberNotice={memberNotice}
            onSignOut={onSignOut}
            savedSourceCount={savedSourceCount}
          />
        )}

        {activeView === 'rules' && <RulesPanel />}
      </main>
    </div>
  )
}

function SourceFilterPanel({
  onQueryChange,
  onSourceKindChange,
  query,
  sourceKind,
  sourceKinds,
}: {
  onQueryChange: (value: string) => void
  onSourceKindChange: (value: SourceKind | 'all') => void
  query: string
  sourceKind: SourceKind | 'all'
  sourceKinds: SourceKind[]
}) {
  return (
    <section className="filter-panel" aria-label="Source filters">
      <div className="search-field">
        <MagnifyingGlass size={20} />
        <input
          aria-label="Search sources"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search store, program, or source type"
          value={query}
        />
        {query && (
          <button aria-label="Clear search" onClick={() => onQueryChange('')} type="button">
            Clear
          </button>
        )}
      </div>

      <div className="filter-row">
        <span className="filter-label">
          <SlidersHorizontal size={18} />
          Type
        </span>
        <button
          className={clsx('chip', sourceKind === 'all' && 'is-active')}
          onClick={() => onSourceKindChange('all')}
          type="button"
        >
          {sourceLabels.all}
        </button>
        {sourceKinds.map((kind) => (
          <button
            className={clsx('chip', sourceKind === kind && 'is-active')}
            key={kind}
            onClick={() => onSourceKindChange(kind)}
            type="button"
          >
            {sourceLabels[kind]}
          </button>
        ))}
      </div>
    </section>
  )
}

function MemberDashboard({
  account,
  apiMode,
  discoveryCount,
  onRefresh,
  onSetView,
  retailerState,
  savedSourceCount,
  verifiedOfferCount,
}: {
  account: NonNullable<MemberSession['account']>
  apiMode: string
  discoveryCount: number
  onRefresh: () => void
  onSetView: (view: MemberView) => void
  retailerState: ResourceState<RetailerResource>
  savedSourceCount: number
  verifiedOfferCount: number
}) {
  return (
    <section className="member-dashboard" aria-label="Member dashboard">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Welcome, {account.displayName}</h1>
        </div>
        <button className="primary-button" onClick={onRefresh} type="button">
          <ArrowClockwise size={18} />
          Refresh
        </button>
      </div>

      <div className="member-metrics">
        <Metric icon={<Storefront size={22} />} label="Retailers" value={`${retailerState.data.summary.retailerCount}`} />
        <Metric icon={<LinkSimple size={22} />} label="Official links" value={`${retailerState.data.summary.sourceCount}`} />
        <Metric icon={<Tag size={22} />} label="Found deals" value={`${discoveryCount}`} />
        <Metric icon={<BookmarkSimple size={22} />} label="Saved sources" value={`${savedSourceCount}`} />
        <Metric icon={<ReceiptX size={22} />} label="Verified offers" value={`${verifiedOfferCount}`} />
      </div>

      <div className="dashboard-grid">
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Plan</p>
            <h2>{account.planName}</h2>
          </div>
          <p>{planStatusText(account.planStatus)}</p>
          <button className="ghost-button" onClick={() => onSetView('subscription')} type="button">
            <CreditCard size={18} />
            Manage plan
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Backend</p>
            <h2>{apiMode}</h2>
          </div>
          <p>Member data uses Cloudflare Pages Functions and D1 when the preview is running.</p>
          <button className="ghost-button" onClick={() => onSetView('sources')} type="button">
            <Storefront size={18} />
            Open sources
          </button>
        </article>
        <article className="dashboard-panel">
          <div>
            <p className="eyebrow">Deal finder</p>
            <h2>Source-backed rows</h2>
          </div>
          <p>Check official deal pages and send useful rows to the scanner for review.</p>
          <button className="ghost-button" onClick={() => onSetView('discovery')} type="button">
            <Tag size={18} />
            Find deals
          </button>
        </article>
      </div>
    </section>
  )
}

function SavedSourcesPanel({
  deletingSourceId,
  memberNotice,
  onDelete,
  savedSourceState,
}: {
  deletingSourceId?: string
  memberNotice?: string
  onDelete: (id: string) => void
  savedSourceState: ResourceState<SavedSourceResource>
}) {
  const savedSources = savedSourceState.data.savedSources

  return (
    <section className="empty-panel" aria-label="Saved sources">
      {savedSourceState.status === 'loading' && <LoadingStrip label="Checking saved sources" />}
      {memberNotice && <div className="write-notice">{memberNotice}</div>}
      {savedSources.length > 0 ? (
        <div className="saved-source-list">
          {savedSources.map((source) => (
            <article className="saved-source-row" key={source.id}>
              <div>
                <p className="eyebrow">{source.retailerName}</p>
                <h3>{source.sourceLabel}</h3>
                <p>{source.sourceKind}</p>
              </div>
              <div className="offer-actions">
                <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                  Source
                  <LinkSimple size={14} />
                </a>
                <button
                  className="ghost-button"
                  disabled={deletingSourceId === source.id}
                  onClick={() => onDelete(source.id)}
                  type="button"
                >
                  {deletingSourceId === source.id ? 'Removing' : 'Remove'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <>
          <BookmarkSimple size={48} />
          <p className="eyebrow">Saved sources</p>
          <h2>No saved sources yet</h2>
          <p>Save official retailer links from the source directory to build your member list.</p>
        </>
      )}
    </section>
  )
}

function SubscriptionPanel({
  account,
  checkoutPlanId,
  memberNotice,
  onCheckout,
  subscriptionState,
}: {
  account: NonNullable<MemberSession['account']>
  checkoutPlanId?: MemberPlanId
  memberNotice?: string
  onCheckout: (planId: MemberPlanId) => void
  subscriptionState: ResourceState<SubscriptionResource>
}) {
  return (
    <section className="subscription-panel" aria-label="Subscription">
      <div className="member-section-head">
        <div>
          <p className="eyebrow">Subscription</p>
          <h1>Plan and billing</h1>
        </div>
        <span className="plan-pill">{subscriptionState.data.billingReady ? 'Billing ready' : 'Billing setup needed'}</span>
      </div>
      {memberNotice && <div className="write-notice">{memberNotice}</div>}
      <div className="plan-grid">
        {subscriptionState.data.plans.map((plan) => {
          const isCurrent = plan.id === account.planId
          const buttonText = isCurrent
            ? 'Current plan'
            : plan.isPaid && !subscriptionState.data.billingReady
              ? 'Billing needed'
              : plan.isPaid
                ? 'Start checkout'
                : 'Use free'

          return (
            <article className={clsx('plan-card', isCurrent && 'is-current')} key={plan.id}>
              <span>{plan.badge}</span>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={isCurrent ? 'ghost-button' : 'primary-button'}
                disabled={isCurrent || checkoutPlanId === plan.id || (plan.isPaid && !subscriptionState.data.billingReady)}
                onClick={() => onCheckout(plan.id)}
                type="button"
              >
                <Wallet size={18} />
                {checkoutPlanId === plan.id ? 'Checking' : buttonText}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MemberProfilePanel({
  account,
  memberNotice,
  onSignOut,
  savedSourceCount,
}: {
  account: NonNullable<MemberSession['account']>
  memberNotice?: string
  onSignOut: () => void
  savedSourceCount: number
}) {
  return (
    <section className="profile-panel" aria-label="Member profile">
      <div className="profile-head">
        <span>{account.initials}</span>
        <div>
          <p className="eyebrow">Profile</p>
          <h1>{account.displayName}</h1>
          <p>{account.email}</p>
        </div>
      </div>
      {memberNotice && <div className="write-notice">{memberNotice}</div>}
      <div className="profile-grid">
        <ProfileRow label="Plan" value={account.planName} />
        <ProfileRow label="Plan status" value={planStatusText(account.planStatus)} />
        <ProfileRow label="Saved sources" value={`${savedSourceCount}`} />
        <ProfileRow label="Member since" value={account.createdAt.slice(0, 10)} />
      </div>
      <button className="ghost-button" onClick={onSignOut} type="button">
        <SignOut size={18} />
        Sign out
      </button>
    </section>
  )
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function planStatusText(status: NonNullable<MemberSession['account']>['planStatus']) {
  if (status === 'billing_not_configured') {
    return 'Billing setup needed'
  }

  if (status === 'checkout_required') {
    return 'Checkout required'
  }

  return 'Active'
}

function RuntimeBanner({
  retailerState,
  offerState,
}: {
  retailerState: ResourceState<RetailerResource>
  offerState: ResourceState<OfferResource>
}) {
  const isApiLive = retailerState.meta.source === 'cloudflare-pages'
  const isLoading = retailerState.status === 'loading' || offerState.status === 'loading'

  return (
    <section className={clsx('runtime-banner', isApiLive && 'is-live')} aria-label="Backend status">
      <span className={clsx('status-dot', isLoading && 'is-pulsing')} />
      <div>
        <strong>{isLoading ? 'Checking backend' : isApiLive ? 'Backend online' : 'Local source list'}</strong>
        <p>
          {isApiLive
            ? 'Frontend is reading Cloudflare Pages API routes.'
            : 'Frontend is using bundled data because the local Vite server is not serving Pages Functions.'}
        </p>
      </div>
    </section>
  )
}

function SourcePanel({
  retailers: sourceRetailers,
  isLoading,
  memberMode = false,
  onSaveSource,
  savedSourceUrls = new Set<string>(),
  savingSourceUrl,
}: {
  retailers: Retailer[]
  isLoading: boolean
  memberMode?: boolean
  onSaveSource?: (retailerId: Retailer['id'], sourceUrl: string) => void
  savedSourceUrls?: Set<string>
  savingSourceUrl?: string
}) {
  return (
    <section className="source-panel" aria-label="Official source watchlist">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Official sources</p>
          <h2>{sourceRetailers.length} retailers</h2>
        </div>
        <CheckCircle size={28} weight="duotone" />
      </div>
      {isLoading && <LoadingStrip label="Refreshing source directory" />}
      <div className="source-grid">
        {sourceRetailers.map((retailer, index) => (
          <motion.article
            animate={{ opacity: 1, y: 0 }}
            className="source-card"
            initial={{ opacity: 0, y: 10 }}
            key={retailer.id}
            transition={{ delay: Math.min(index * 0.02, 0.18) }}
          >
            <img src="/assets/source-supermarket.png" alt="" loading="lazy" />
            <div className="source-card-body">
              <div className="source-card-head">
                <span className="retailer-pill" style={{ backgroundColor: `${retailer.accentColor}22` }}>
                  {retailer.group}
                </span>
                <h3>{retailer.name}</h3>
                <p>{retailer.sourceNote}</p>
              </div>
              <div className="source-meta">
                <span>{retailer.program}</span>
                <span>Checked {retailer.verifiedOn}</span>
              </div>
              <div className="source-links">
                {retailer.sources.map((source) => (
                  <div className="source-link-group" key={`${retailer.id}-${source.label}`}>
                    <a href={source.url} rel="noreferrer" target="_blank">
                      {source.label}
                      <LinkSimple size={14} />
                    </a>
                    {memberMode && (
                      <button
                        disabled={savedSourceUrls.has(source.url) || savingSourceUrl === source.url}
                        onClick={() => onSaveSource?.(retailer.id, source.url)}
                        type="button"
                      >
                        {savedSourceUrls.has(source.url)
                          ? 'Saved'
                          : savingSourceUrl === source.url
                            ? 'Saving'
                            : 'Save'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

function DiscoveryPanel({
  isDiscovering,
  onReviewDeal,
  onRunDiscovery,
  state,
}: {
  isDiscovering: boolean
  onReviewDeal: (deal: DiscoveredDeal) => void
  onRunDiscovery: () => void
  state: ResourceState<DiscoveryResource>
}) {
  const discovery = state.data.discovery
  const deals = discovery.deals

  return (
    <section className="discovery-panel" aria-label="Deal finder">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deal finder</p>
          <h2>Source-backed specials</h2>
        </div>
        <button className="primary-button" disabled={isDiscovering} onClick={onRunDiscovery} type="button">
          <ArrowClockwise size={18} className={clsx(isDiscovering && 'is-spinning')} />
          {isDiscovering ? 'Checking' : 'Check now'}
        </button>
      </div>

      {state.status === 'loading' && <LoadingStrip label="Checking official deal pages" />}
      {state.status === 'error' && <div className="write-notice">{state.message}</div>}

      <div className="discovery-summary">
        <Metric icon={<LinkSimple size={22} />} label="Sources checked" value={`${discovery.summary.checkedSourceCount}`} />
        <Metric icon={<Tag size={22} />} label="Found deals" value={`${discovery.summary.foundDealCount}`} />
        <Metric icon={<ReceiptX size={22} />} label="Unread sources" value={`${discovery.summary.unavailableSourceCount}`} />
      </div>

      {discovery.sources.length > 0 && (
        <div className="discovery-source-grid" aria-label="Checked sources">
          {discovery.sources.map((source) => (
            <article className={clsx('discovery-source-card', `is-${source.status}`)} key={`${source.retailerId}-${source.sourceLabel}`}>
              <div>
                <p className="eyebrow">{source.retailerName}</p>
                <h3>{source.sourceLabel}</h3>
                <p>{source.statusText}</p>
              </div>
              <div className="source-meta">
                <span>{source.httpStatus ? `HTTP ${source.httpStatus}` : 'No status'}</span>
                <span>{source.itemCount} rows</span>
              </div>
              <a href={source.sourceUrl} rel="noreferrer" target="_blank">
                Source
                <LinkSimple size={14} />
              </a>
            </article>
          ))}
        </div>
      )}

      {deals.length > 0 ? (
        <div className="discovery-deal-list">
          {deals.map((deal) => (
            <article className="discovery-deal-row" key={deal.id}>
              <div>
                <p className="eyebrow">{deal.retailerName}</p>
                <h3>{deal.title}</h3>
                <div className="deal-price-line">
                  {deal.priceText && <strong>{deal.priceText}</strong>}
                  {deal.previousPriceText && <span>{deal.previousPriceText}</span>}
                  {deal.savingText && <span>{deal.savingText}</span>}
                </div>
                <p>{deal.evidenceText}</p>
              </div>
              <div className="offer-actions">
                <a href={deal.productUrl} rel="noreferrer" target="_blank">
                  Product
                  <LinkSimple size={14} />
                </a>
                <button className="ghost-button" onClick={() => onReviewDeal(deal)} type="button">
                  Review in scanner
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="discovery-empty">
          <Tag size={46} />
          <p className="eyebrow">No deal rows yet</p>
          <h3>Run a source check</h3>
          <p>
            The finder only shows rows extracted from official pages. Script-rendered pages are reported as checked,
            with no product rows copied.
          </p>
        </div>
      )}
    </section>
  )
}

function OffersPanel({
  deletingOfferId,
  onDelete,
  state,
  writeNotice,
}: {
  deletingOfferId?: string
  onDelete: (id: string) => void
  state: ResourceState<OfferResource>
  writeNotice?: string
}) {
  const offers = state.data.offers

  return (
    <section className="empty-panel" aria-label="Verified offers">
      {state.status === 'loading' && <LoadingStrip label="Checking offer board" />}
      {writeNotice && <div className="write-notice">{writeNotice}</div>}
      {offers.length > 0 ? (
        <OfferList deletingOfferId={deletingOfferId} offers={offers} onDelete={onDelete} />
      ) : (
        <>
          <ReceiptX size={48} />
          <p className="eyebrow">Verified offers</p>
          <h2>No checked offers loaded</h2>
          <p>
            This board stays empty until an offer has an official source URL, capture date, valid dates,
            retailer, price text, and terms from the source page.
          </p>
          <div className="requirement-grid">
            {[
              'Official source URL',
              'Capture date',
              'Retailer and source type',
              'Price text from source',
              'Valid dates',
              'Terms and loyalty rules',
            ].map((item) => (
              <span key={item}>
                <CheckCircle size={16} />
                {item}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function OfferList({
  deletingOfferId,
  offers,
  onDelete,
}: {
  deletingOfferId?: string
  offers: VerifiedOffer[]
  onDelete: (id: string) => void
}) {
  return (
    <div className="offer-list">
      {offers.map((offer) => (
        <article className="offer-row" key={offer.id}>
          <div>
            <p className="eyebrow">Verified offer</p>
            <h3>{offer.title}</h3>
            <p>{offer.priceText}</p>
            <p>{offer.termsText}</p>
          </div>
          <div className="offer-actions">
            <a href={offer.sourceUrl} rel="noreferrer" target="_blank">
              Source
              <LinkSimple size={14} />
            </a>
            <button
              className="ghost-button"
              disabled={deletingOfferId === offer.id}
              onClick={() => onDelete(offer.id)}
              type="button"
            >
              {deletingOfferId === offer.id ? 'Removing' : 'Remove'}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ScannerPanel({
  draft,
  isSaving,
  isScanning,
  onReset,
  onSave,
  onScan,
  onUpdate,
  result,
  writeNotice,
}: {
  draft: OfferDraft
  isSaving: boolean
  isScanning: boolean
  onReset: () => void
  onSave: () => void
  onScan: () => void
  onUpdate: (field: keyof OfferDraft, value: string) => void
  result?: ResourceState<OfferValidationResult>
  writeNotice?: string
}) {
  return (
    <section className="scanner-panel" aria-label="Offer scanner">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Offer scanner</p>
          <h2>Validate source text</h2>
        </div>
        <ShieldCheck size={28} weight="duotone" />
      </div>

      <div className="scanner-layout">
        <form
          className="scanner-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onScan()
          }}
        >
          <div className="form-grid">
            <label className="field">
              Retailer
              <select value={draft.retailerId} onChange={(event) => onUpdate('retailerId', event.target.value)}>
                {initialRetailers.map((retailer) => (
                  <option key={retailer.id} value={retailer.id}>
                    {retailer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Capture date
              <input
                onChange={(event) => onUpdate('capturedAt', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.capturedAt}
              />
            </label>

            <label className="field">
              Valid from
              <input
                onChange={(event) => onUpdate('validFrom', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.validFrom ?? ''}
              />
            </label>

            <label className="field">
              Valid to
              <input
                onChange={(event) => onUpdate('validTo', event.target.value)}
                placeholder="YYYY-MM-DD"
                value={draft.validTo ?? ''}
              />
            </label>
          </div>

          <label className="field">
            Source URL
            <input
              onChange={(event) => onUpdate('sourceUrl', event.target.value)}
              placeholder="Paste official retailer URL"
              type="url"
              value={draft.sourceUrl}
            />
          </label>

          <label className="field">
            Offer title
            <input
              onChange={(event) => onUpdate('title', event.target.value)}
              placeholder="Paste title from source"
              value={draft.title}
            />
          </label>

          <div className="form-grid">
            <label className="field">
              Price text
              <input
                onChange={(event) => onUpdate('priceText', event.target.value)}
                placeholder="Paste price text from source"
                value={draft.priceText}
              />
            </label>

            <label className="field">
              Saving text
              <input
                onChange={(event) => onUpdate('savingText', event.target.value)}
                placeholder="Optional source saving text"
                value={draft.savingText ?? ''}
              />
            </label>
          </div>

          <label className="field">
            Terms text
            <textarea
              onChange={(event) => onUpdate('termsText', event.target.value)}
              placeholder="Paste terms, loyalty rules, or source notes"
              rows={5}
              value={draft.termsText}
            />
          </label>

          <div className="scanner-actions">
            <button className="primary-button" disabled={isScanning} type="submit">
              <ShieldCheck size={18} />
              {isScanning ? 'Scanning' : 'Scan draft'}
            </button>
            <button className="ghost-button" onClick={onReset} type="button">
              Reset
            </button>
          </div>
        </form>

        <ScannerResult isSaving={isSaving} onSave={onSave} result={result} writeNotice={writeNotice} />
      </div>
    </section>
  )
}

function ScannerResult({
  isSaving,
  onSave,
  result,
  writeNotice,
}: {
  isSaving: boolean
  onSave: () => void
  result?: ResourceState<OfferValidationResult>
  writeNotice?: string
}) {
  if (!result) {
    return (
      <aside className="scanner-result">
        <p className="eyebrow">Result</p>
        <h3>Waiting for a draft</h3>
        <p>Paste source-backed offer text, then scan it before any row can appear in offers.</p>
      </aside>
    )
  }

  return (
    <aside className={clsx('scanner-result', result.data.accepted ? 'is-accepted' : 'is-rejected')}>
      <p className="eyebrow">Result</p>
      <h3>{result.data.accepted ? 'Accepted by scanner' : 'Needs edits'}</h3>
      <p>{result.message}</p>

      {result.data.issues.length > 0 && (
        <div className="issue-list">
          {result.data.issues.map((issue) => (
            <div className={clsx('issue-item', `is-${issue.severity}`)} key={`${issue.field}-${issue.message}`}>
              <strong>{issue.field}</strong>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {result.data.normalizedOffer && (
        <div className="normalized-card">
          <span>Normalized row ID</span>
          <strong>{result.data.normalizedOffer.id}</strong>
          <p>Ready for storage.</p>
          <button className="primary-button" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? 'Saving' : 'Save verified offer'}
          </button>
        </div>
      )}
      {writeNotice && <div className="write-notice">{writeNotice}</div>}
    </aside>
  )
}

function LoadingStrip({ label }: { label: string }) {
  return (
    <div className="loading-strip" role="status">
      <span />
      {label}
    </div>
  )
}

function RulesPanel() {
  return (
    <section className="rules-panel" aria-label="Data rules">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Data rules</p>
          <h2>How offers earn a row</h2>
        </div>
        <ClipboardText size={28} weight="duotone" />
      </div>
      <div className="rules-grid">
        <RuleCard
          icon={<LinkSimple size={22} />}
          title="Source first"
          text="Every offer row must point to an official retailer source or a captured page from that source."
        />
        <RuleCard
          icon={<Tag size={22} />}
          title="Text from source"
          text="Price, saving, and voucher terms must match the retailer copy. No guessed amounts."
        />
        <RuleCard
          icon={<ShieldCheck size={22} />}
          title="Date stamped"
          text="Each row needs capture date and valid dates before it can appear in the offer board."
        />
      </div>
    </section>
  )
}

function RuleCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rule-card">
      {icon}
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getPreferredTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem('trolley-scout-theme')

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function createBlankDraft(): OfferDraft {
  return {
    capturedAt: new Date().toISOString().slice(0, 10),
    priceText: '',
    retailerId: defaultRetailerId,
    savingText: '',
    sourceUrl: '',
    termsText: '',
    title: '',
    validFrom: '',
    validTo: '',
  }
}

export default App
