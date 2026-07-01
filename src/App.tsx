import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowClockwise,
  CheckCircle,
  ClipboardText,
  LinkSimple,
  MagnifyingGlass,
  MoonStars,
  ReceiptX,
  ShieldCheck,
  SlidersHorizontal,
  Storefront,
  Sun,
  Tag,
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
  validateOfferDraft,
} from './services/apiClient'
import type { OfferDraft, OfferValidationResult, Retailer, SourceKind, VerifiedOffer } from './types'

type ThemeMode = 'light' | 'dark'
type ActiveView = 'sources' | 'offers' | 'scanner' | 'rules'

const viewOptions: Array<{ label: string; value: ActiveView }> = [
  { label: 'Sources', value: 'sources' },
  { label: 'Offers', value: 'offers' },
  { label: 'Scanner', value: 'scanner' },
  { label: 'Rules', value: 'rules' },
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
  const [scannerDraft, setScannerDraft] = useState<OfferDraft>(() => createBlankDraft())
  const [scannerResult, setScannerResult] = useState<ResourceState<OfferValidationResult> | undefined>()
  const [isScanning, setIsScanning] = useState(false)
  const [isSavingOffer, setIsSavingOffer] = useState(false)
  const [deletingOfferId, setDeletingOfferId] = useState<string | undefined>()
  const [writeNotice, setWriteNotice] = useState<string | undefined>()

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

  const sourceKinds = retailerState.data.summary.sourceKinds
  const filteredRetailers = retailerState.data.retailers
  const officialSourceCount = retailerState.data.summary.sourceCount
  const verifiedOfferCount = offerState.data.summary.verifiedOfferCount
  const retailerCount = retailerState.data.summary.retailerCount
  const apiMode = retailerState.meta.source === 'cloudflare-pages' ? 'API live' : 'Local list'

  function refreshSources() {
    setIsRefreshing(true)
    setRefreshKey((current) => current + 1)
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

        <button
          className="icon-button"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          type="button"
          aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        >
          {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
        </button>
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
}: {
  retailers: Retailer[]
  isLoading: boolean
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
                  <a
                    href={source.url}
                    key={`${retailer.id}-${source.label}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {source.label}
                    <LinkSimple size={14} />
                  </a>
                ))}
              </div>
            </div>
          </motion.article>
        ))}
      </div>
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
