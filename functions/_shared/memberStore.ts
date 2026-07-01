import type {
  MemberAccount,
  MemberPlanId,
  MemberPlanStatus,
  RetailerId,
  SavedDeal,
  SavedDealDraft,
  SavedSource,
  SourceKind,
} from '../../src/types'
import { memberPlans, getMemberPlan } from '../../src/data/memberPlans'
import { retailers } from '../../src/data/retailers'
import type { TrolleyScoutEnv } from './env'

const sessionCookieName = 'ts_member_session'
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30

interface MemberAccountRow {
  created_at: string
  display_name: string
  email: string
  id: string
  plan_id: string
  plan_status: string
  updated_at: string
}

interface SavedSourceRow {
  created_at: string
  id: string
  retailer_id: string
  source_kind: string
  source_label: string
  source_url: string
}

interface SavedDealRow {
  captured_at: string
  created_at: string
  deal_id: string
  evidence_text: string
  id: string
  previous_price_text: string | null
  price_text: string | null
  product_url: string
  retailer_id: string
  saving_text: string | null
  source_label: string
  source_url: string
  title: string
}

export interface MemberSessionInput {
  displayName: string
  email: string
}

export function hasMemberStore(env: TrolleyScoutEnv): env is TrolleyScoutEnv & { DB: D1Database } {
  return Boolean(env.DB)
}

export function clearMemberCookie() {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function setMemberCookie(token: string) {
  return `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`
}

export function getSubscriptionPlans() {
  return memberPlans
}

export function isBillingReady(env: TrolleyScoutEnv, planId?: MemberPlanId) {
  if (!env.STRIPE_SECRET_KEY) {
    return false
  }

  if (planId === 'scout') {
    return Boolean(env.STRIPE_SCOUT_PRICE_ID)
  }

  if (planId === 'household') {
    return Boolean(env.STRIPE_HOUSEHOLD_PRICE_ID)
  }

  return Boolean(env.STRIPE_SCOUT_PRICE_ID && env.STRIPE_HOUSEHOLD_PRICE_ID)
}

export async function getMemberSession(env: TrolleyScoutEnv, request: Request) {
  if (!hasMemberStore(env)) {
    return {
      isAuthenticated: false,
    }
  }

  const token = getCookie(request, sessionCookieName)

  if (!token) {
    return {
      isAuthenticated: false,
    }
  }

  const now = new Date().toISOString()
  await env.DB.prepare('DELETE FROM member_sessions WHERE expires_at < ?').bind(now).run()

  const row = await env.DB.prepare(
    `SELECT member_accounts.id, member_accounts.email, member_accounts.display_name,
      member_accounts.plan_id, member_accounts.plan_status,
      member_accounts.created_at, member_accounts.updated_at
      FROM member_sessions
      INNER JOIN member_accounts ON member_accounts.id = member_sessions.account_id
      WHERE member_sessions.token = ? AND member_sessions.expires_at >= ?`,
  )
    .bind(token, now)
    .first<MemberAccountRow>()

  return {
    account: row ? accountRowToMember(row) : undefined,
    isAuthenticated: Boolean(row),
  }
}

export async function createMemberSession(env: TrolleyScoutEnv, input: MemberSessionInput) {
  if (!hasMemberStore(env)) {
    return {
      issues: ['Member storage is not configured.'],
    }
  }

  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const issues = validateMemberInput(email, displayName)

  if (issues.length > 0) {
    return {
      issues,
    }
  }

  const timestamp = new Date().toISOString()
  const existing = await env.DB.prepare(
    `SELECT id, email, display_name, plan_id, plan_status, created_at, updated_at
      FROM member_accounts
      WHERE email = ?`,
  )
    .bind(email)
    .first<MemberAccountRow>()

  if (existing) {
    await env.DB.prepare(
      `UPDATE member_accounts
        SET display_name = ?, updated_at = ?
        WHERE id = ?`,
    )
      .bind(displayName, timestamp, existing.id)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO member_accounts (
        id, email, display_name, plan_id, plan_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(`member-${crypto.randomUUID()}`, email, displayName, 'free', 'active', timestamp, timestamp)
      .run()
  }

  const account = await getAccountByEmail(env, email)

  if (!account) {
    return {
      issues: ['Member account could not be loaded.'],
    }
  }

  const token = createToken()
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString()

  await env.DB.prepare(
    `INSERT INTO member_sessions (token, account_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)`,
  )
    .bind(token, account.id, timestamp, expiresAt)
    .run()

  return {
    account,
    token,
  }
}

export async function deleteMemberSession(env: TrolleyScoutEnv, request: Request) {
  if (!hasMemberStore(env)) {
    return false
  }

  const token = getCookie(request, sessionCookieName)

  if (!token) {
    return false
  }

  const result = await env.DB.prepare('DELETE FROM member_sessions WHERE token = ?').bind(token).run()

  return result.meta.changes > 0
}

export async function listSavedSources(env: TrolleyScoutEnv, accountId?: string) {
  if (!hasMemberStore(env) || !accountId) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT id, retailer_id, source_label, source_kind, source_url, created_at
      FROM member_saved_sources
      WHERE account_id = ?
      ORDER BY created_at DESC`,
  )
    .bind(accountId)
    .all<SavedSourceRow>()

  return result.results.map(savedSourceRowToSource)
}

export async function saveMemberSource(env: TrolleyScoutEnv, accountId: string | undefined, input: {
  retailerId: string
  sourceUrl: string
}) {
  if (!hasMemberStore(env)) {
    return {
      issues: ['Member storage is not configured.'],
    }
  }

  if (!accountId) {
    return {
      issues: ['Sign in before saving a source.'],
    }
  }

  const retailer = retailers.find((candidate) => candidate.id === input.retailerId)
  const source = retailer?.sources.find((candidate) => candidate.url === input.sourceUrl)

  if (!retailer || !source) {
    return {
      issues: ['Select an official retailer source.'],
    }
  }

  const id = `${accountId}-${hashString(source.url)}`
  const timestamp = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO member_saved_sources (
      id, account_id, retailer_id, source_label, source_kind, source_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, source_url) DO NOTHING`,
  )
    .bind(id, accountId, retailer.id, source.label, source.kind, source.url, timestamp)
    .run()

  const savedSource = await env.DB.prepare(
    `SELECT id, retailer_id, source_label, source_kind, source_url, created_at
      FROM member_saved_sources
      WHERE account_id = ? AND source_url = ?`,
  )
    .bind(accountId, source.url)
    .first<SavedSourceRow>()

  return {
    savedSource: savedSource ? savedSourceRowToSource(savedSource) : undefined,
  }
}

export async function deleteMemberSource(env: TrolleyScoutEnv, accountId: string | undefined, id: string) {
  if (!hasMemberStore(env) || !accountId) {
    return false
  }

  const result = await env.DB.prepare(
    `DELETE FROM member_saved_sources
      WHERE account_id = ? AND id = ?`,
  )
    .bind(accountId, id)
    .run()

  return result.meta.changes > 0
}

export async function listSavedDeals(env: TrolleyScoutEnv, accountId?: string) {
  if (!hasMemberStore(env) || !accountId) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT id, deal_id, retailer_id, source_label, source_url, product_url, title,
      captured_at, price_text, previous_price_text, saving_text, evidence_text, created_at
      FROM member_saved_deals
      WHERE account_id = ?
      ORDER BY created_at DESC`,
  )
    .bind(accountId)
    .all<SavedDealRow>()

  return result.results.map(savedDealRowToDeal)
}

export async function saveMemberDeal(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: SavedDealDraft,
) {
  if (!hasMemberStore(env)) {
    return {
      issues: ['Member storage is not configured.'],
    }
  }

  if (!accountId) {
    return {
      issues: ['Sign in before saving a deal.'],
    }
  }

  const issues = validateSavedDeal(input)

  if (issues.length > 0) {
    return {
      issues,
    }
  }

  const retailer = retailers.find((candidate) => candidate.id === input.retailerId)
  const source = retailer?.sources.find((candidate) => candidate.url === input.sourceUrl)

  if (!retailer || !source || !matchesRetailerSourceUrl(input.productUrl, retailer)) {
    return {
      issues: ['Save deals only from official retailer sources.'],
    }
  }

  const id = `${accountId}-${hashString(`${input.retailerId}:${input.productUrl}`)}`
  const timestamp = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO member_saved_deals (
      id, account_id, deal_id, retailer_id, source_label, source_url, product_url,
      title, captured_at, price_text, previous_price_text, saving_text, evidence_text, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, product_url) DO UPDATE SET
      deal_id = excluded.deal_id,
      source_label = excluded.source_label,
      source_url = excluded.source_url,
      title = excluded.title,
      captured_at = excluded.captured_at,
      price_text = excluded.price_text,
      previous_price_text = excluded.previous_price_text,
      saving_text = excluded.saving_text,
      evidence_text = excluded.evidence_text`,
  )
    .bind(
      id,
      accountId,
      input.id,
      retailer.id,
      source.label,
      source.url,
      input.productUrl,
      input.title.trim(),
      input.capturedAt,
      input.priceText ?? null,
      input.previousPriceText ?? null,
      input.savingText ?? null,
      input.evidenceText.trim(),
      timestamp,
    )
    .run()

  const savedDeal = await env.DB.prepare(
    `SELECT id, deal_id, retailer_id, source_label, source_url, product_url, title,
      captured_at, price_text, previous_price_text, saving_text, evidence_text, created_at
      FROM member_saved_deals
      WHERE account_id = ? AND product_url = ?`,
  )
    .bind(accountId, input.productUrl)
    .first<SavedDealRow>()

  return {
    savedDeal: savedDeal ? savedDealRowToDeal(savedDeal) : undefined,
  }
}

export async function deleteMemberDeal(env: TrolleyScoutEnv, accountId: string | undefined, id: string) {
  if (!hasMemberStore(env) || !accountId) {
    return false
  }

  const result = await env.DB.prepare(
    `DELETE FROM member_saved_deals
      WHERE account_id = ? AND id = ?`,
  )
    .bind(accountId, id)
    .run()

  return result.meta.changes > 0
}

export async function startSubscriptionCheckout(
  env: TrolleyScoutEnv,
  request: Request,
  account: MemberAccount | undefined,
  planId: MemberPlanId,
) {
  if (!hasMemberStore(env) || !account) {
    return {
      billingReady: false,
      message: 'Sign in before changing plan.',
      planId,
      status: 'checkout_required' as MemberPlanStatus,
    }
  }

  if (planId === 'free') {
    await env.DB.prepare(
      `UPDATE member_accounts
        SET plan_id = ?, plan_status = ?, updated_at = ?
        WHERE id = ?`,
    )
      .bind('free', 'active', new Date().toISOString(), account.id)
      .run()

    return {
      billingReady: true,
      message: 'Free plan is active.',
      planId,
      status: 'active' as MemberPlanStatus,
    }
  }

  const priceId = getStripePriceId(env, planId)

  if (!env.STRIPE_SECRET_KEY || !priceId) {
    return {
      billingReady: false,
      message: 'Billing keys are not configured for this plan.',
      planId,
      status: 'billing_not_configured' as MemberPlanStatus,
    }
  }

  const origin = env.APP_URL ?? new URL(request.url).origin
  const params = new URLSearchParams({
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: account.id,
    customer_email: account.email,
    mode: 'subscription',
    success_url: `${origin}/?billing=success`,
  })
  params.set('line_items[0][price]', priceId)
  params.set('line_items[0][quantity]', '1')
  params.set('metadata[member_account_id]', account.id)
  params.set('metadata[plan_id]', planId)

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    body: params,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })
  const stripeData = (await stripeResponse.json()) as {
    error?: {
      message?: string
    }
    url?: string
  }

  if (!stripeResponse.ok || !stripeData.url) {
    return {
      billingReady: true,
      message: stripeData.error?.message ?? 'Checkout could not be created.',
      planId,
      status: 'checkout_required' as MemberPlanStatus,
    }
  }

  return {
    billingReady: true,
    checkoutUrl: stripeData.url,
    message: 'Checkout is ready.',
    planId,
    status: 'checkout_required' as MemberPlanStatus,
  }
}

async function getAccountByEmail(env: TrolleyScoutEnv & { DB: D1Database }, email: string) {
  const row = await env.DB.prepare(
    `SELECT id, email, display_name, plan_id, plan_status, created_at, updated_at
      FROM member_accounts
      WHERE email = ?`,
  )
    .bind(email)
    .first<MemberAccountRow>()

  return row ? accountRowToMember(row) : undefined
}

function accountRowToMember(row: MemberAccountRow): MemberAccount {
  const planId = normalizePlanId(row.plan_id)
  const plan = getMemberPlan(planId)

  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email: row.email,
    id: row.id,
    initials: getInitials(row.display_name),
    planId,
    planName: plan.name,
    planStatus: normalizePlanStatus(row.plan_status),
    updatedAt: row.updated_at,
  }
}

function savedSourceRowToSource(row: SavedSourceRow): SavedSource {
  const retailer = retailers.find((candidate) => candidate.id === row.retailer_id)

  return {
    createdAt: row.created_at,
    id: row.id,
    retailerId: normalizeRetailerId(row.retailer_id),
    retailerName: retailer?.name ?? row.retailer_id,
    sourceKind: normalizeSourceKind(row.source_kind),
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
  }
}

function savedDealRowToDeal(row: SavedDealRow): SavedDeal {
  const retailer = retailers.find((candidate) => candidate.id === row.retailer_id)

  return {
    capturedAt: row.captured_at,
    evidenceText: row.evidence_text,
    id: row.id,
    previousPriceText: row.previous_price_text ?? undefined,
    priceText: row.price_text ?? undefined,
    productUrl: row.product_url,
    retailerId: normalizeRetailerId(row.retailer_id),
    retailerName: retailer?.name ?? row.retailer_id,
    savedAt: row.created_at,
    savingText: row.saving_text ?? undefined,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    title: row.title,
  }
}

function validateSavedDeal(input: SavedDealDraft) {
  const issues: string[] = []

  if (!input.retailerId || !retailers.some((retailer) => retailer.id === input.retailerId)) {
    issues.push('Choose a supported retailer.')
  }

  if (!input.sourceUrl || !input.productUrl) {
    issues.push('Deal source URLs are required.')
  }

  if (!input.title?.trim()) {
    issues.push('Deal title is required.')
  }

  if (!input.capturedAt) {
    issues.push('Capture time is required.')
  }

  if (!input.evidenceText?.trim()) {
    issues.push('Source evidence is required.')
  }

  return issues
}

function validateMemberInput(email: string, displayName: string) {
  const issues: string[] = []

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push('Enter a valid email address.')
  }

  if (displayName.length < 2) {
    issues.push('Enter a display name.')
  }

  return issues
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? ''
  const match = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))

  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined
}

function createToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function getInitials(displayName: string) {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getStripePriceId(env: TrolleyScoutEnv, planId: MemberPlanId) {
  if (planId === 'scout') {
    return env.STRIPE_SCOUT_PRICE_ID
  }

  if (planId === 'household') {
    return env.STRIPE_HOUSEHOLD_PRICE_ID
  }

  return undefined
}

function normalizePlanId(value: string): MemberPlanId {
  return value === 'scout' || value === 'household' ? value : 'free'
}

function normalizePlanStatus(value: string): MemberPlanStatus {
  if (value === 'billing_not_configured' || value === 'checkout_required') {
    return value
  }

  return 'active'
}

function normalizeRetailerId(value: string): RetailerId {
  return retailers.some((retailer) => retailer.id === value) ? (value as RetailerId) : 'pick-n-pay'
}

function normalizeSourceKind(value: string): SourceKind {
  if (value === 'app' || value === 'loyalty' || value === 'store-finder') {
    return value
  }

  return 'specials'
}

function matchesRetailerSourceUrl(value: string, retailer: { sources: Array<{ url: string }> }) {
  try {
    const candidate = new URL(value)

    return retailer.sources.some((source) => {
      const sourceUrl = new URL(source.url)
      return candidate.hostname === sourceUrl.hostname || candidate.hostname.endsWith(`.${sourceUrl.hostname}`)
    })
  } catch {
    return false
  }
}

function hashString(value: string) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}
