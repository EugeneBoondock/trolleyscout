import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle,
  MoonStars,
  ShieldCheck,
  Storefront,
  Sun,
  WarningCircle,
} from '@phosphor-icons/react'
import { ScoutMark } from '../components/ScoutMark'
import {
  BusinessApiError,
  loadBusinessBootstrap,
  signInBusiness,
  submitOrganizationApplication,
} from './api'
import { BusinessShell } from './BusinessShell'
import { IssueList } from './BusinessFeedback'
import type {
  BusinessBootstrap,
  OrganizationApplicationDraft,
} from './types'
import './business.css'

type ThemeMode = 'light' | 'dark'

export function BusinessApp() {
  const [bootstrap, setBootstrap] = useState<BusinessBootstrap>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeMode>(preferredTheme)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(undefined)
    try {
      setBootstrap(await loadBusinessBootstrap(signal))
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(
        caught instanceof Error
          ? caught.message
          : 'The business workspace could not be loaded.',
      )
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('trolley-scout-business-theme', theme)
  }, [theme])

  if (loading && !bootstrap) {
    return <BusinessLoading />
  }

  if (error && !bootstrap) {
    return <BusinessFailure message={error} onRetry={() => void refresh()} theme={theme} onTheme={setTheme} />
  }

  const current = bootstrap
  if (!current?.session.isAuthenticated || !current.session.account) {
    return (
      <BusinessAuth
        onAuthenticated={() => void refresh()}
        onTheme={setTheme}
        theme={theme}
      />
    )
  }

  if (!current.gate.hasOrganization || !current.gate.organization) {
    return (
      <OrganizationAccess
        bootstrap={current}
        onApplicationSent={() => void refresh()}
        onTheme={setTheme}
        theme={theme}
      />
    )
  }

  return (
    <BusinessShell
      bootstrap={current}
      onBootstrap={setBootstrap}
      onReload={() => void refresh()}
      onTheme={setTheme}
      theme={theme}
    />
  )
}

function BusinessLoading() {
  return (
    <main className="biz-gate biz-gate-loading" aria-busy="true">
      <div className="biz-brand-lockup">
        <ScoutMark motion="scout" size={52} />
        <div>
          <strong>TROLLEY SCOUT</strong>
          <span>FOR BUSINESS</span>
        </div>
      </div>
      <div className="biz-loading-line" />
      <p>Opening your business workspace.</p>
    </main>
  )
}

function BusinessFailure({
  message,
  onRetry,
  onTheme,
  theme,
}: {
  message: string
  onRetry: () => void
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  return (
    <main className="biz-gate">
      <GateHeader onTheme={onTheme} theme={theme} />
      <section className="biz-gate-card" role="alert">
        <WarningCircle size={32} weight="fill" />
        <p className="biz-kicker">Connection problem</p>
        <h1>Your workspace is still here</h1>
        <p>{message}</p>
        <button className="biz-primary-button" onClick={onRetry} type="button">
          Try again
          <ArrowRight size={18} />
        </button>
      </section>
    </main>
  )
}

function BusinessAuth({
  onAuthenticated,
  onTheme,
  theme,
}: {
  onAuthenticated: () => void
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [intent, setIntent] = useState<'login' | 'signup'>('login')
  const [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setIssues([])
    try {
      const session = await signInBusiness({ displayName, email, intent, password })
      if (!session.isAuthenticated) {
        setIssues(['Those account details could not be confirmed.'])
        return
      }
      onAuthenticated()
    } catch (caught) {
      setIssues(
        caught instanceof BusinessApiError
          ? caught.issues
          : ['Sign-in is unavailable right now. Try again.'],
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="biz-auth-page">
      <GateHeader onTheme={onTheme} theme={theme} />
      <div className="biz-auth-layout">
        <section className="biz-auth-story">
          <p className="biz-kicker">Trolley Scout for Business</p>
          <h1>Run your storefront</h1>
          <p>
            Publish deals, plan Window Shopping posts, manage every location, and see what shoppers open and save.
          </p>
          <div className="biz-auth-points">
            <span><CheckCircle size={20} weight="fill" /> Publish with a consumer preview</span>
            <span><CheckCircle size={20} weight="fill" /> Schedule every start and finish</span>
            <span><CheckCircle size={20} weight="fill" /> Measure real shopper actions</span>
          </div>
          <div className="biz-auth-art" aria-hidden="true">
            <Storefront size={150} weight="duotone" />
            <span>DEALS OPEN</span>
          </div>
        </section>

        <section className="biz-auth-card">
          <div className="biz-auth-switch" aria-label="Account action">
            <button
              className={intent === 'login' ? 'is-active' : ''}
              onClick={() => setIntent('login')}
              type="button"
            >
              Sign in
            </button>
            <button
              className={intent === 'signup' ? 'is-active' : ''}
              onClick={() => setIntent('signup')}
              type="button"
            >
              Create account
            </button>
          </div>
          <div>
            <p className="biz-kicker">{intent === 'login' ? 'Welcome back' : 'Start here'}</p>
            <h2>{intent === 'login' ? 'Open your workspace' : 'Create your owner account'}</h2>
          </div>
          <form className="biz-form-stack" onSubmit={submit}>
            {intent === 'signup' && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
                />
              </label>
            )}
            <label>
              Email
              <input
                autoComplete="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete={intent === 'login' ? 'current-password' : 'new-password'}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {issues.length > 0 && <IssueList issues={issues} />}
            <button className="biz-primary-button biz-wide-button" disabled={busy} type="submit">
              {busy ? 'Checking account' : intent === 'login' ? 'Sign in' : 'Create account'}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>
          <p className="biz-auth-note">
            Business access is opened after Trolley Scout approves your organization.
          </p>
        </section>
      </div>
    </main>
  )
}

function OrganizationAccess({
  bootstrap,
  onApplicationSent,
  onTheme,
  theme,
}: {
  bootstrap: BusinessBootstrap
  onApplicationSent: () => void
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  const status = bootstrap.gate.applicationStatus

  if (status === 'pending') {
    return (
      <main className="biz-gate">
        <GateHeader onTheme={onTheme} theme={theme} />
        <section className="biz-gate-card">
          <span className="biz-status-illustration is-pending"><ShieldCheck size={42} weight="duotone" /></span>
          <p className="biz-kicker">Application received</p>
          <h1>Application under review</h1>
          <p>{bootstrap.gate.message ?? 'Your business details are with the review team.'}</p>
          <div className="biz-status-steps" aria-label="Application progress">
            <span className="is-complete">Account</span>
            <span className="is-current">Review</span>
            <span>Workspace</span>
          </div>
          <a className="biz-secondary-button" href="https://trolleyscout.co.za/support">
            Contact support
          </a>
        </section>
      </main>
    )
  }

  if (status === 'rejected') {
    return (
      <main className="biz-gate">
        <GateHeader onTheme={onTheme} theme={theme} />
        <section className="biz-gate-card">
          <span className="biz-status-illustration is-warning"><WarningCircle size={42} weight="duotone" /></span>
          <p className="biz-kicker">Details need attention</p>
          <h1>Update your application</h1>
          <p>{bootstrap.gate.message ?? 'Your application was not approved. Send corrected details for a new review.'}</p>
          <ApplicationForm
            accountEmail={bootstrap.session.account?.email ?? ''}
            accountName={bootstrap.session.account?.displayName ?? ''}
            onSent={onApplicationSent}
          />
        </section>
      </main>
    )
  }

  if (status === 'approved') {
    return (
      <main className="biz-gate">
        <GateHeader onTheme={onTheme} theme={theme} />
        <section className="biz-gate-card">
          <WarningCircle size={34} />
          <p className="biz-kicker">Access unavailable</p>
          <h1>Your organization needs support</h1>
          <p>{bootstrap.gate.message ?? 'The approved organization is not active.'}</p>
          <a className="biz-primary-button" href="https://trolleyscout.co.za/support">Contact support</a>
        </section>
      </main>
    )
  }

  return (
    <main className="biz-gate">
      <GateHeader onTheme={onTheme} theme={theme} />
      <section className="biz-application-card">
        <div className="biz-application-intro">
          <p className="biz-kicker">Business verification</p>
          <h1>Tell us about your store</h1>
          <p>
            Approval protects shoppers and gives your business a named source across Marketplace and Window Shopping.
          </p>
        </div>
        <ApplicationForm
          accountEmail={bootstrap.session.account?.email ?? ''}
          accountName={bootstrap.session.account?.displayName ?? ''}
          onSent={onApplicationSent}
        />
      </section>
    </main>
  )
}

function ApplicationForm({
  accountEmail,
  accountName,
  onSent,
}: {
  accountEmail: string
  accountName: string
  onSent: () => void
}) {
  const [draft, setDraft] = useState<OrganizationApplicationDraft>({
    contactEmail: accountEmail,
    contactName: accountName,
    description: '',
    organisationName: '',
  })
  const [issues, setIssues] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function field(name: keyof OrganizationApplicationDraft) {
    return {
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft((current) => ({ ...current, [name]: event.target.value })),
      value: draft[name] ?? '',
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setIssues([])
    try {
      await submitOrganizationApplication(draft)
      onSent()
    } catch (caught) {
      setIssues(
        caught instanceof BusinessApiError
          ? caught.issues
          : ['The application could not be sent. Try again.'],
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="biz-application-form" onSubmit={submit}>
      <div className="biz-form-grid">
        <label>
          Registered organization name
          <input required {...field('organisationName')} />
        </label>
        <label>
          Trading name
          <input {...field('tradingName')} />
        </label>
        <label>
          Contact person
          <input autoComplete="name" required {...field('contactName')} />
        </label>
        <label>
          Contact email
          <input autoComplete="email" required type="email" {...field('contactEmail')} />
        </label>
        <label>
          Business category
          <input placeholder="Grocer, fashion, restaurant" {...field('category')} />
        </label>
        <label>
          Website
          <input inputMode="url" placeholder="https://" {...field('websiteUrl')} />
        </label>
        <label>
          City or town
          <input {...field('city')} />
        </label>
        <label>
          Province or region
          <input {...field('province')} />
        </label>
      </div>
      <label>
        What does your business sell?
        <textarea minLength={20} required rows={4} {...field('description')} />
      </label>
      {issues.length > 0 && <IssueList issues={issues} />}
      <button className="biz-primary-button" disabled={busy} type="submit">
        {busy ? 'Sending application' : 'Send for review'}
        {!busy && <ArrowRight size={18} />}
      </button>
    </form>
  )
}

function GateHeader({
  onTheme,
  theme,
}: {
  onTheme: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  return (
    <header className="biz-gate-header">
      <a className="biz-brand-lockup" href="/">
        <ScoutMark size={42} />
        <div>
          <strong>TROLLEY SCOUT</strong>
          <span>FOR BUSINESS</span>
        </div>
      </a>
      <button
        aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
        className="biz-icon-button"
        onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')}
        type="button"
      >
        {theme === 'light' ? <MoonStars size={20} /> : <Sun size={20} />}
      </button>
    </header>
  )
}

function preferredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('trolley-scout-business-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
