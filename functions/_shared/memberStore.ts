import type {
  Basket,
  BasketItem,
  BasketItemDraft,
  BasketQuantityDraft,
  BasketSummary,
  BillingCycle,
  MemberAccount,
  MemberPlanId,
  MemberPlanStatus,
  Retailer,
  RetailerId,
  SavedDeal,
  SavedDealDraft,
  SavedSource,
  SourceKind,
  SubscriptionCheckoutResult,
  CountryOption,
} from '../../src/types'
import {
  memberPlans,
  getLocalisedMemberPlans,
  getMemberPlan,
  getPlanBillingOption,
} from '../../src/data/memberPlans'
import { computeLineEconomics, parseMultibuy } from '../../src/services/multibuy'
import { retailers } from '../../src/data/retailers'
import type { TrolleyScoutEnv } from './env'
import type { DealSiteItem } from '../../src/services/dealSites'
import { hashPassword, validatePassword, verifyPassword } from './password'
import { getPayFastEndpoints, resolvePayFastConfig } from './payfast'
import { resolvePayFastNotifyUrl } from './payfastNotifyUrl'
import { classifyPlanChange, resolveEffectiveAt } from './planChanges'
import {
  createPayFastCheckoutFields,
  requestPayFastOnsitePayment,
} from './payfastBilling'
import { countryFromCode, getRateFromZar, listCountryOptions } from './countryContext'
import { resolveBillingCurrency, SETTLEMENT_CURRENCY } from '../../src/data/planPricing'
import {
  emailLookup,
  hasEmailProtection,
  isProtectedEmail,
  protectEmail,
  revealEmail,
} from './emailProtection'

const sessionCookieName = 'ts_member_session'
const adminCountryCookieName = 'ts_admin_country'
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30

interface MemberAccountRow {
  ban_reason?: string | null
  banned_at?: string | null
  created_at: string
  deal_view_count?: number | null
  display_name: string
  email: string
  email_lookup?: string | null
  id: string
  last_seen_at?: string | null
  password_hash?: string | null
  plan_id: string
  plan_status: string
  properties_access?: number | null
  role?: string | null
  status?: string | null
  updated_at: string
  billing_cycle?: string | null
  current_period_end?: string | null
  pending_billing_cycle?: string | null
  pending_effective_at?: string | null
  pending_plan_id?: string | null
  country_code?: string | null
  country_name?: string | null
  currency_code?: string | null
}

// The account owner. Signing up (or logging in) with this address always
// holds the admin role, so ownership survives a database reset.
const ADMIN_EMAILS = new Set(['philosncube@gmail.com'])

const ACCOUNT_COLUMNS =
  `id, email, email_lookup, display_name, plan_id, plan_status, role, properties_access,
    password_hash, country_code, country_name, currency_code, created_at, updated_at,
    status, banned_at, ban_reason, last_seen_at`

// The billing cycle lives on the subscription rather than the account, so any
// read that feeds the member UI joins the active subscription to learn whether
// a paid member is on monthly or annual. A plan granted by an admin has no
// subscription row and correctly reports no cycle.
const ACCOUNT_BILLING_COLUMNS = `member_accounts.id, member_accounts.email, member_accounts.email_lookup,
  member_accounts.display_name,
  member_accounts.plan_id, member_accounts.plan_status, member_accounts.role,
  member_accounts.properties_access,
  member_accounts.country_code, member_accounts.country_name, member_accounts.currency_code,
  member_accounts.created_at, member_accounts.updated_at,
  member_accounts.status, member_accounts.banned_at, member_accounts.ban_reason,
  member_accounts.last_seen_at,
  billing_subscriptions.billing_cycle,
  billing_subscriptions.current_period_end,
  billing_subscriptions.pending_plan_id,
  billing_subscriptions.pending_billing_cycle,
  billing_subscriptions.pending_effective_at`

const ACCOUNT_BILLING_JOIN = `LEFT JOIN billing_subscriptions
  ON billing_subscriptions.account_id = member_accounts.id
  AND billing_subscriptions.status = 'active'`

const ACCOUNT_WITH_BILLING_SELECT = `SELECT ${ACCOUNT_BILLING_COLUMNS}
  FROM member_accounts
  ${ACCOUNT_BILLING_JOIN}`

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.has(email.trim().toLowerCase())
}

// Effective Properties Scout access: the Household and Organisation plans grant
// it, admins always have it, and an admin can grant it to any single member
// (properties_access).
export function computePropertiesAccess(
  planId: MemberPlanId,
  role: 'member' | 'admin',
  grant: number | null | undefined,
): boolean {
  return planId === 'household' || planId === 'organization' || role === 'admin' || grant === 1
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
  image_url: string | null
  previous_price_text: string | null
  price_text: string | null
  product_url: string
  retailer_id: string
  saving_text: string | null
  source_label: string
  source_url: string
  title: string
  valid_to: string | null
}

interface BasketItemRow {
  basket_created_at: string
  basket_id: string
  basket_quantity: number
  basket_updated_at: string
  captured_at: string
  deal_id: string
  evidence_text: string
  image_url: string | null
  previous_price_text: string | null
  price_text: string | null
  product_url: string
  retailer_id: string
  saved_deal_created_at: string
  saved_deal_id: string
  valid_to: string | null
  saving_text: string | null
  source_label: string
  source_url: string
  title: string
}

export interface MemberSessionInput {
  displayName: string
  email: string
}

export interface MemberSignUpInput {
  country: CountryOption
  displayName: string
  email: string
  password: string
}

export interface MemberLogInInput {
  country: CountryOption
  email: string
  password: string
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

export function setAdminCountryCookie(countryCode: string) {
  const country = countryFromCode(countryCode)
  return `${adminCountryCookieName}=${country.code}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`
}

/// Prices the plan table for one shopper's country. Without a country we serve
/// the rand table, which is what every existing client already expects.
export async function getSubscriptionPlans(env?: TrolleyScoutEnv, countryCode?: string) {
  if (!env || !countryCode) {
    return memberPlans
  }

  const pricing = await resolveMemberPricing(env, countryCode)
  return getLocalisedMemberPlans(pricing)
}

/// What one plan costs one member: the whole-number local price they see, and
/// the rand PayFast debits for it. The single place any subscription amount is
/// worked out, so a checkout and a later plan change can never disagree.
export async function getPlanCheckoutPrice(
  env: TrolleyScoutEnv,
  planId: MemberPlanId,
  billingCycle: BillingCycle,
  countryCode: string,
) {
  return getPlanBillingOption(planId, billingCycle, await resolveMemberPricing(env, countryCode))
}

/// A shopper's quoting currency and the rate that turns it into the rand
/// PayFast settles. Both the plan table and the checkout price go through here
/// so a shopper is never charged an amount they were not shown.
async function resolveMemberPricing(env: TrolleyScoutEnv, countryCode: string) {
  const country = countryFromCode(countryCode)
  const currencyCode = resolveBillingCurrency(country.currencyCode, country.code)

  if (currencyCode === SETTLEMENT_CURRENCY) {
    return { countryCode: country.code, currencyCode, rateFromZar: 1 }
  }

  // The rate has to be for the currency we quote in, which is not always the
  // currency of the shopper's own country: Zimbabwe is quoted in dollars.
  const rate = await getRateFromZar(env, currencyCode)

  return { countryCode: country.code, currencyCode, rateFromZar: rate?.rate }
}

export function isBillingReady(env: TrolleyScoutEnv, planId?: MemberPlanId) {
  return planId === 'free' ? true : Boolean(resolvePayFastConfig(env))
}

/// Physically removes expired session rows. Runs from the hourly scout cron
/// only — the request path relies on the expires_at filter instead.
export async function purgeExpiredSessions(
  env: TrolleyScoutEnv,
  nowIso = new Date().toISOString(),
): Promise<number> {
  if (!hasMemberStore(env)) {
    return 0
  }
  const result = await env.DB.prepare(
    'DELETE FROM member_sessions WHERE expires_at < ?',
  )
    .bind(nowIso)
    .run()
  return result.meta.changes ?? 0
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

  // Expired rows are excluded by the expires_at clause below and physically
  // removed by the hourly scout sweep (purgeExpiredSessions) — never here on
  // the hot path, where the extra DELETE ran on every authenticated request.
  const now = new Date().toISOString()
  const row = await env.DB.prepare(
    `SELECT ${ACCOUNT_BILLING_COLUMNS}
      FROM member_sessions
      INNER JOIN member_accounts ON member_accounts.id = member_sessions.account_id
      ${ACCOUNT_BILLING_JOIN}
      WHERE member_sessions.token = ? AND member_sessions.expires_at >= ?`,
  )
    .bind(token, now)
    .first<MemberAccountRow>()

  // A banned account still has rows and a live session cookie, but it resolves
  // to nobody: every endpoint that reads session.account treats them as signed
  // out, on every device, from the moment the ban lands.
  if (row?.status === 'banned') {
    return {
      isAuthenticated: false,
      isBanned: true,
      banReason: row.ban_reason ?? undefined,
    }
  }

  const storedAccount = row ? await accountRowToMember(env, row) : undefined
  const account = applyAdminCountryOverride(storedAccount, request)

  if (row) {
    touchLastSeen(env, row)
  }

  return {
    account,
    isAuthenticated: Boolean(row),
  }
}

// How stale a last_seen_at stamp may get before the next authenticated request
// writes a fresh one. Five minutes keeps "last online" useful without turning
// every read of the session into a write.
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000

// Fire-and-forget: presence is nice to have, and a failed stamp must never
// fail the request that carried it.
function touchLastSeen(env: TrolleyScoutEnv & { DB: D1Database }, row: MemberAccountRow): void {
  const seenAt = row.last_seen_at ? Date.parse(row.last_seen_at) : Number.NaN
  if (Number.isFinite(seenAt) && Date.now() - seenAt < LAST_SEEN_REFRESH_MS) {
    return
  }

  try {
    const update = env.DB.prepare('UPDATE member_accounts SET last_seen_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run()
    void Promise.resolve(update).catch(() => undefined)
  } catch {
    // Presence is a nice-to-have. Never let stamping it break a session read.
  }
}

/// Closes or reopens an account. Banning also drops every live session so the
/// member is signed out immediately rather than at their next token expiry.
export async function setMemberBanned(
  env: TrolleyScoutEnv,
  accountId: string,
  banned: boolean,
  reason?: string,
): Promise<{ account: MemberAccount } | { issues: string[] }> {
  if (!hasMemberStore(env)) {
    return { issues: ['Member storage is not configured.'] }
  }

  const existing = await env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM member_accounts WHERE id = ?`)
    .bind(accountId)
    .first<MemberAccountRow>()

  if (!existing) {
    return { issues: ['That member could not be found.'] }
  }

  // The owner account must always be able to get back in, so it can never be
  // banned — not by itself, and not by a second admin.
  const email = await revealEmail(env, existing.email)
  if (banned && (existing.role === 'admin' || isAdminEmail(email))) {
    return { issues: ['An admin account cannot be banned.'] }
  }

  const trimmedReason = reason?.trim().slice(0, 280) || undefined
  const timestamp = new Date().toISOString()

  const statements = [
    env.DB.prepare(
      `UPDATE member_accounts
        SET status = ?, banned_at = ?, ban_reason = ?, updated_at = ?
        WHERE id = ?`,
    ).bind(
      banned ? 'banned' : 'active',
      banned ? timestamp : null,
      banned ? (trimmedReason ?? null) : null,
      timestamp,
      accountId,
    ),
  ]

  if (banned) {
    statements.push(env.DB.prepare('DELETE FROM member_sessions WHERE account_id = ?').bind(accountId))
  }

  await env.DB.batch(statements)

  const row = await env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM member_accounts WHERE id = ?`)
    .bind(accountId)
    .first<MemberAccountRow>()

  return row
    ? { account: await accountRowToMember(env, row) }
    : { issues: ['Account could not be loaded.'] }
}

function applyAdminCountryOverride(
  account: MemberAccount | undefined,
  request: Request,
): MemberAccount | undefined {
  if (account?.role !== 'admin') {
    return account
  }

  const requestedCode = (
    request.headers.get('x-trolley-scout-test-country') ??
    getCookie(request, adminCountryCookieName) ??
    ''
  ).trim().toUpperCase()
  const country = countryFromCode(requestedCode)

  if (!requestedCode || country.code !== requestedCode) {
    return account
  }

  return {
    ...account,
    countryCode: country.code,
    countryName: country.name,
    currencyCode: country.currencyCode,
  }
}

async function issueSession(
  env: TrolleyScoutEnv & { DB: D1Database },
  account: MemberAccount,
) {
  const token = createToken()
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString()

  await env.DB.prepare(
    `INSERT INTO member_sessions (token, account_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)`,
  )
    .bind(token, account.id, timestamp, expiresAt)
    .run()

  return { account, token }
}

export async function signUpMember(env: TrolleyScoutEnv, input: MemberSignUpInput) {
  if (!hasMemberStore(env)) {
    return { issues: ['Member storage is not configured.'] }
  }

  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const issues = validateMemberInput(email, displayName)
  const passwordIssue = validatePassword(input.password ?? '')

  if (passwordIssue) {
    issues.push(passwordIssue)
  }

  if (issues.length > 0) {
    return { issues }
  }

  if (!hasEmailProtection(env)) {
    return { issues: ['Account security is not configured yet. Please try again later.'] }
  }

  const lookup = await emailLookup(env, email)
  const protectedEmail = await protectEmail(env, email)

  const existing = await env.DB.prepare(
    `SELECT id, password_hash FROM member_accounts
      WHERE email_lookup = ? OR (email_lookup IS NULL AND email = ?)`,
  )
    .bind(lookup, email)
    .first<{ id: string; password_hash: string | null }>()

  if (existing?.password_hash) {
    return { issues: ['An account with that email already exists. Log in instead.'] }
  }

  const timestamp = new Date().toISOString()

  // Accounts created before passwords existed have no credential at all — the
  // old flow let anyone start a session with any email. Let signup claim such
  // an account by setting its first password, which closes that hole and keeps
  // the member's existing plan and saved data.
  if (existing) {
    await env.DB.prepare(
      `UPDATE member_accounts
        SET display_name = ?, password_hash = ?, role = ?, email = ?, email_lookup = ?,
          country_code = ?, country_name = ?, currency_code = ?, updated_at = ?
        WHERE id = ?`,
    )
      .bind(
        displayName,
        await hashPassword(input.password),
        isAdminEmail(email) ? 'admin' : 'member',
        protectedEmail,
        lookup,
        input.country.code,
        input.country.name,
        input.country.currencyCode,
        timestamp,
        existing.id,
      )
      .run()

    const claimed = await getAccountByEmail(env, email)

    return claimed ? issueSession(env, claimed) : { issues: ['Account could not be loaded.'] }
  }

  await env.DB.prepare(
    // A new account's country comes from where the person actually signed up,
    // so it is confirmed on the spot and never re-detected afterwards.
    `INSERT INTO member_accounts (
      id, email, email_lookup, display_name, plan_id, plan_status, role, password_hash,
      country_code, country_name, currency_code, country_confirmed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `member-${crypto.randomUUID()}`,
      protectedEmail,
      lookup,
      displayName,
      'free',
      'active',
      isAdminEmail(email) ? 'admin' : 'member',
      await hashPassword(input.password),
      input.country.code,
      input.country.name,
      input.country.currencyCode,
      timestamp,
      timestamp,
      timestamp,
    )
    .run()

  const account = await getAccountByEmail(env, email)

  if (!account) {
    return { issues: ['Member account could not be created.'] }
  }

  return issueSession(env, account)
}

export async function logInMember(env: TrolleyScoutEnv, input: MemberLogInInput) {
  if (!hasMemberStore(env)) {
    return { issues: ['Member storage is not configured.'] }
  }

  const email = input.email.trim().toLowerCase()
  if (!hasEmailProtection(env)) {
    return { issues: ['Account security is not configured yet. Please try again later.'] }
  }

  const lookup = await emailLookup(env, email)
  const row = await env.DB.prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM member_accounts
      WHERE email_lookup = ? OR (email_lookup IS NULL AND email = ?)`,
  )
    .bind(lookup, email)
    .first<MemberAccountRow>()

  // Always run a verification so a missing account and a wrong password take
  // the same time and return the same message — no account enumeration.
  const isValid = await verifyPassword(input.password ?? '', row?.password_hash ?? null)

  if (!row || !isValid) {
    return { issues: ['That email and password do not match an account.'] }
  }

  // Said plainly rather than as a wrong-password error: someone who has been
  // closed out deserves to know that, and to know who to write to about it.
  if (row.status === 'banned') {
    return {
      issues: [
        row.ban_reason
          ? `This account has been closed: ${row.ban_reason} Write to support if you think that is wrong.`
          : 'This account has been closed. Write to support if you think that is wrong.',
      ],
    }
  }

  // Keep the owner's admin role correct even if the row predates roles.
  //
  // Country is settled once and then left alone. Overwriting it on every login
  // flipped travellers and VPN users to the wrong catalogue and currency each
  // time they signed in; never writing it at all left everyone whose row
  // predates the country column stamped with its 'ZA' default, reading South
  // African prices from another continent. So it is written while
  // country_confirmed_at is NULL — nobody has established it yet — and that
  // stamp closes the question for good.
  const timestamp = new Date().toISOString()
  await env.DB.prepare(
    `UPDATE member_accounts SET
      email = ?, email_lookup = ?, role = ?,
      country_code = CASE WHEN country_confirmed_at IS NULL THEN ? ELSE country_code END,
      country_name = CASE WHEN country_confirmed_at IS NULL THEN ? ELSE country_name END,
      currency_code = CASE WHEN country_confirmed_at IS NULL THEN ? ELSE currency_code END,
      country_confirmed_at = COALESCE(country_confirmed_at, ?),
      updated_at = ? WHERE id = ?`,
  )
    .bind(
      isProtectedEmail(row.email) ? row.email : await protectEmail(env, email),
      lookup,
      isAdminEmail(email) ? 'admin' : (row.role ?? 'member'),
      input.country.code,
      input.country.name,
      input.country.currencyCode,
      timestamp,
      timestamp,
      row.id,
    )
    .run()

  const account = await getAccountByEmail(env, email)

  if (!account) {
    return { issues: ['Member account could not be loaded.'] }
  }

  return issueSession(env, account)
}

export async function updateMemberProfile(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: { displayName: string },
) {
  if (!hasMemberStore(env) || !accountId) {
    return { issues: ['Sign in before updating your profile.'] }
  }

  const displayName = input.displayName.trim()

  if (displayName.length < 2 || displayName.length > 60) {
    return { issues: ['Use a display name between 2 and 60 characters.'] }
  }

  await env.DB.prepare('UPDATE member_accounts SET display_name = ?, updated_at = ? WHERE id = ?')
    .bind(displayName, new Date().toISOString(), accountId)
    .run()

  const row = await env.DB.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM member_accounts WHERE id = ?`)
    .bind(accountId)
    .first<MemberAccountRow>()

  return row ? { account: await accountRowToMember(env, row) } : { issues: ['Account could not be loaded.'] }
}

// Admin-only: grant or revoke a single member's Properties Scout access. Only
// the raw grant flag is written; Household and admin accounts keep effective
// access regardless. Returns the updated account (with effective access).
export async function setMemberPropertiesAccess(
  env: TrolleyScoutEnv,
  accountId: string,
  granted: boolean,
) {
  if (!hasMemberStore(env)) {
    return { issues: ['Member storage is not configured.'] }
  }

  const result = await env.DB.prepare(
    'UPDATE member_accounts SET properties_access = ?, updated_at = ? WHERE id = ?',
  )
    .bind(granted ? 1 : 0, new Date().toISOString(), accountId)
    .run()

  if (result.meta.changes === 0) {
    return { issues: ['Member account was not found.'] }
  }

  const row = await env.DB.prepare(
    `${ACCOUNT_WITH_BILLING_SELECT} WHERE member_accounts.id = ?`,
  )
    .bind(accountId)
    .first<MemberAccountRow>()

  return row ? { account: await accountRowToMember(env, row) } : { issues: ['Account could not be loaded.'] }
}

export async function setMemberPlan(
  env: TrolleyScoutEnv,
  accountId: string,
  planId: string,
) {
  if (!hasMemberStore(env)) {
    return { issues: ['Member storage is not configured.'] }
  }

  const timestamp = new Date().toISOString()
  const result = await env.DB.prepare(
    'UPDATE member_accounts SET plan_id = ?, plan_status = ?, updated_at = ? WHERE id = ?',
  )
    .bind(planId, 'active', timestamp, accountId)
    .run()

  if (result.meta.changes === 0) {
    return { issues: ['Member account was not found.'] }
  }

  const row = await env.DB.prepare(
    `${ACCOUNT_WITH_BILLING_SELECT} WHERE member_accounts.id = ?`,
  )
    .bind(accountId)
    .first<MemberAccountRow>()

  return row ? { account: await accountRowToMember(env, row) } : { issues: ['Account could not be loaded.'] }
}

export async function changeMemberPassword(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: { currentPassword: string; newPassword: string },
) {
  if (!hasMemberStore(env) || !accountId) {
    return { issues: ['Sign in before changing your password.'] }
  }

  const passwordIssue = validatePassword(input.newPassword ?? '')

  if (passwordIssue) {
    return { issues: [passwordIssue] }
  }

  const row = await env.DB.prepare('SELECT password_hash FROM member_accounts WHERE id = ?')
    .bind(accountId)
    .first<{ password_hash: string | null }>()

  if (!row || !(await verifyPassword(input.currentPassword ?? '', row.password_hash))) {
    return { issues: ['Your current password is not correct.'] }
  }

  await env.DB.prepare('UPDATE member_accounts SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(await hashPassword(input.newPassword), new Date().toISOString(), accountId)
    .run()

  return { changed: true }
}

// Every table that stores this member's personal data, keyed by account_id.
// Billing audit rows (billing_attempts/events) and support messages are
// intentionally retained: financial records fall outside the erasure request,
// and support threads may still need a reply.
const ACCOUNT_DATA_TABLES = [
  'member_sessions',
  'member_saved_deals',
  'member_saved_sources',
  'member_basket_items',
  'member_deal_activity',
  'member_interest_weights',
  'member_preferences',
  'member_state',
  'member_voucher_claims',
  'deal_watches',
  'window_saves',
  'deal_comments',
  'notification_preferences',
] as const

/**
 * Permanently deletes a member account and their personal data (POPIA right
 * to erasure). The current password is re-verified so an unattended unlocked
 * phone cannot erase the account.
 */
export async function deleteMemberAccount(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: { currentPassword: string },
): Promise<{ deleted: true } | { issues: string[] }> {
  if (!hasMemberStore(env) || !accountId) {
    return { issues: ['Sign in before deleting your account.'] }
  }

  const row = await env.DB.prepare('SELECT password_hash FROM member_accounts WHERE id = ?')
    .bind(accountId)
    .first<{ password_hash: string | null }>()

  if (!row || !(await verifyPassword(input.currentPassword ?? '', row.password_hash))) {
    return { issues: ['Your current password is not correct.'] }
  }

  const statements = ACCOUNT_DATA_TABLES.map((table) =>
    env.DB.prepare(`DELETE FROM ${table} WHERE account_id = ?`).bind(accountId),
  )
  statements.push(
    env.DB.prepare('DELETE FROM member_accounts WHERE id = ?').bind(accountId),
  )
  await env.DB.batch(statements)

  return { deleted: true }
}

// Admin console data. Only ever called after the caller's admin role is
// checked at the endpoint; never exposes password hashes.
export async function getAdminOverview(env: TrolleyScoutEnv, countryCode = 'ZA') {
  if (!hasMemberStore(env)) {
    return undefined
  }

  const selectedCountry = countryFromCode(countryCode)
  const [accounts, planRows, storeStats, pendingEmailRow] = await Promise.all([
    // The deal-view count rides along as a correlated subquery so the console
    // gets "how many deals have they opened" without a second round trip or an
    // N+1 per member.
    env.DB.prepare(
      `SELECT ${ACCOUNT_COLUMNS},
        (SELECT COUNT(*) FROM member_deal_activity
          WHERE member_deal_activity.account_id = member_accounts.id
          AND member_deal_activity.event_type = 'deal_opened') AS deal_view_count
        FROM member_accounts
        WHERE country_code = ?
        ORDER BY created_at DESC
        LIMIT 100`,
    ).bind(selectedCountry.code).all<MemberAccountRow>(),
    env.DB.prepare(
      `SELECT plan_id, COUNT(*) AS total FROM member_accounts
        WHERE country_code = ? GROUP BY plan_id`,
    ).bind(selectedCountry.code).all<{
      plan_id: string
      total: number
    }>(),
    env.DB.prepare(
      `SELECT
        COUNT(*) AS store_count,
        SUM(CASE WHEN website IS NOT NULL THEN 1 ELSE 0 END) AS source_count,
        MAX(last_scout_at) AS last_scout_at
        FROM discovered_stores WHERE country_code = ?`,
    ).bind(selectedCountry.code).first<{
      last_scout_at: string | null
      source_count: number | null
      store_count: number
    }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total FROM member_accounts
        WHERE email_lookup IS NULL OR email NOT LIKE 'enc:v1:%'`,
    ).first<{ total: number }>(),
  ])

  const promotionStats = await env.DB.prepare(
    `SELECT
      SUM(CASE WHEN kind = 'deal' THEN 1 ELSE 0 END) AS deal_count,
      SUM(CASE WHEN kind = 'catalogue' THEN 1 ELSE 0 END) AS leaflet_count,
      MAX(captured_at) AS last_scout_at
      FROM store_promotions WHERE country_code = ? AND expires_at >= ?`,
  ).bind(selectedCountry.code, new Date().toISOString()).first<{
    deal_count: number | null
    last_scout_at: string | null
    leaflet_count: number | null
  }>()

  const memberRows = await Promise.all(accounts.results.map((row) => accountRowToMember(env, row)))

  return {
    accounts: memberRows,
    countries: listCountryOptions(),
    emailProtection: {
      configured: hasEmailProtection(env),
      pendingAccounts: Number(pendingEmailRow?.total ?? 0),
      pendingSupport: 0,
    },
    selectedCountry,
    scout: {
      dealCount: Number(promotionStats?.deal_count ?? 0),
      leafletCount: Number(promotionStats?.leaflet_count ?? 0),
      lastScoutedAt: promotionStats?.last_scout_at ?? storeStats?.last_scout_at ?? undefined,
      sourceCount: Number(storeStats?.source_count ?? 0),
      storeCount: Number(storeStats?.store_count ?? 0),
    },
    summary: {
      accountCount: accounts.results.length,
      planCounts: Object.fromEntries(planRows.results.map((row) => [row.plan_id, row.total])),
    },
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

// Plan capacity is enforced server-side from the account's stored plan.
// Replacing an existing row (same unique key) is never blocked.
async function findPlanCapacityIssue(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
  options: {
    countSql: string
    existsSql: string
    existsKey: string
    limitKey: 'savedSources' | 'savedDeals' | 'basketItems'
    noun: string
  },
): Promise<string | undefined> {
  const existing = await env.DB.prepare(options.existsSql)
    .bind(accountId, options.existsKey)
    .first<{ id: string }>()

  if (existing) {
    return undefined
  }

  const account = await env.DB.prepare('SELECT plan_id FROM member_accounts WHERE id = ?')
    .bind(accountId)
    .first<{ plan_id: string }>()

  const plan = getMemberPlan((account?.plan_id ?? 'free') as MemberPlanId)
  const limit = plan.limits[options.limitKey]
  const countRow = await env.DB.prepare(options.countSql)
    .bind(accountId)
    .first<{ n: number }>()

  if ((countRow?.n ?? 0) < limit) {
    return undefined
  }

  const upgradeHint =
    plan.id === 'free'
      ? ' Remove one, or upgrade to Scout for 10x the space.'
      : plan.id === 'scout'
        ? ' Remove one, or upgrade to Household for more space.'
        : ' Remove one to make space.'

  return `Your ${plan.name} plan holds ${limit} ${options.noun}.${upgradeHint}`
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

  const staticRetailer = retailers.find((candidate) => candidate.id === input.retailerId)
  const dynamicRetailer = staticRetailer
    ? undefined
    : await findCachedCountryRetailer(env, accountId, input.retailerId, input.sourceUrl)
  const retailer = staticRetailer ?? dynamicRetailer?.retailer
  const source = staticRetailer?.sources.find((candidate) => candidate.url === input.sourceUrl)
    ?? dynamicRetailer?.source

  if (!retailer || !source) {
    return {
      issues: ['Select an official retailer source.'],
    }
  }

  const capacityIssue = await findPlanCapacityIssue(env, accountId, {
    countSql: 'SELECT COUNT(*) AS n FROM member_saved_sources WHERE account_id = ?',
    existsKey: source.url,
    existsSql: 'SELECT id FROM member_saved_sources WHERE account_id = ? AND source_url = ?',
    limitKey: 'savedSources',
    noun: 'saved sources',
  })

  if (capacityIssue) {
    return {
      issues: [capacityIssue],
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

async function findCachedCountryRetailer(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
  retailerId: string,
  sourceUrl: string,
) {
  const countryMatch = /^country:([a-z]{2}):[a-z0-9-]+$/i.exec(retailerId)
  if (!countryMatch) return undefined

  const account = await env.DB.prepare('SELECT country_code FROM member_accounts WHERE id = ?')
    .bind(accountId)
    .first<{ country_code: string }>()
  const countryCode = countryMatch[1].toUpperCase()
  if (account?.country_code !== countryCode) return undefined

  const cache = await env.DB.prepare(
    'SELECT retailers_json FROM country_retailer_cache WHERE country_code = ?',
  ).bind(countryCode).first<{ retailers_json: string }>()
  if (!cache) return undefined

  try {
    const entries = JSON.parse(cache.retailers_json) as unknown
    if (!Array.isArray(entries)) return undefined
    const retailer = (entries as Retailer[]).find((candidate) => candidate.id === retailerId)
    const source = retailer?.sources.find((candidate) => candidate.url === sourceUrl)
    return retailer && source ? { retailer, source } : undefined
  } catch {
    return undefined
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

export async function listSavedDeals(
  env: TrolleyScoutEnv,
  accountId?: string,
  nowMs = Date.now(),
) {
  if (!hasMemberStore(env) || !accountId) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT id, deal_id, retailer_id, source_label, source_url, product_url, title,
      captured_at, price_text, previous_price_text, saving_text, evidence_text, image_url,
      created_at, valid_to
      FROM member_saved_deals
      WHERE account_id = ?
        AND (valid_to IS NULL OR trim(valid_to) = '' OR date(valid_to) >= date(?))
      ORDER BY created_at DESC`,
  )
    .bind(accountId, savedDealToday(nowMs))
    .all<SavedDealRow>()

  return result.results.map(savedDealRowToDeal)
}

// A saved offer whose last day has passed is gone: the price no longer stands,
// so showing it would be telling a shopper something untrue. Rows are kept for
// a short grace period rather than deleted on sight, so a late-running sweep or
// a clock skew never destroys a save that is still valid.
const SAVED_DEAL_GRACE_DAYS = 7
// How far ahead a shopper is warned that a saved offer is about to close.
export const SAVED_DEAL_EXPIRY_WINDOW_DAYS = 3

function savedDealToday(nowMs = Date.now()): string {
  // Saved-deal end dates are calendar days in South African time.
  return new Date(nowMs + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function savedDealDateIn(days: number, nowMs = Date.now()): string {
  return savedDealToday(nowMs + days * 24 * 60 * 60 * 1000)
}

/** Saved offers closing within the warning window, newest end date last. */
export async function listExpiringSavedDeals(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  windowDays = SAVED_DEAL_EXPIRY_WINDOW_DAYS,
  nowMs = Date.now(),
) {
  if (!hasMemberStore(env) || !accountId) {
    return []
  }

  const result = await env.DB.prepare(
    `SELECT id, deal_id, retailer_id, source_label, source_url, product_url, title,
      captured_at, price_text, previous_price_text, saving_text, evidence_text, image_url,
      created_at, valid_to
      FROM member_saved_deals
      WHERE account_id = ?
        AND valid_to IS NOT NULL AND trim(valid_to) <> ''
        AND date(valid_to) >= date(?)
        AND date(valid_to) <= date(?)
      ORDER BY date(valid_to) ASC`,
  )
    .bind(accountId, savedDealToday(nowMs), savedDealDateIn(windowDays, nowMs))
    .all<SavedDealRow>()

  return result.results.map(savedDealRowToDeal)
}

/** Clears saved offers that closed longer ago than the grace period. */
export async function purgeExpiredSavedDeals(
  env: TrolleyScoutEnv,
  nowMs = Date.now(),
): Promise<number> {
  if (!hasMemberStore(env)) {
    return 0
  }

  try {
    const result = await env.DB.prepare(
      `DELETE FROM member_saved_deals
        WHERE valid_to IS NOT NULL AND trim(valid_to) <> ''
          AND date(valid_to) < date(?)`,
    )
      .bind(savedDealDateIn(-SAVED_DEAL_GRACE_DAYS, nowMs))
      .run()
    return result.meta.changes ?? 0
  } catch {
    // Retried on the next sweep; the read filter already hides these.
    return 0
  }
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

  const trusted = await resolveTrustedSavedDeal(env, input)

  if (!trusted) {
    return {
      issues: ['Save deals only from verified Trolley Scout sources.'],
    }
  }

  const deal = trusted.deal

  const capacityIssue = await findPlanCapacityIssue(env, accountId, {
    countSql: 'SELECT COUNT(*) AS n FROM member_saved_deals WHERE account_id = ?',
    existsKey: deal.productUrl,
    existsSql: 'SELECT id FROM member_saved_deals WHERE account_id = ? AND product_url = ?',
    limitKey: 'savedDeals',
    noun: 'saved deals',
  })

  if (capacityIssue) {
    return {
      issues: [capacityIssue],
    }
  }

  const id = `${accountId}-${hashString(`${deal.retailerId}:${deal.productUrl}`)}`
  const timestamp = new Date().toISOString()

  await env.DB.prepare(
    `INSERT INTO member_saved_deals (
      id, account_id, deal_id, retailer_id, source_label, source_url, product_url,
      title, captured_at, price_text, previous_price_text, saving_text, evidence_text, image_url,
      created_at, valid_to
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, product_url) DO UPDATE SET
      deal_id = excluded.deal_id,
      source_label = excluded.source_label,
      source_url = excluded.source_url,
      title = excluded.title,
      captured_at = excluded.captured_at,
      price_text = excluded.price_text,
      previous_price_text = excluded.previous_price_text,
      saving_text = excluded.saving_text,
      evidence_text = excluded.evidence_text,
      image_url = excluded.image_url,
      valid_to = excluded.valid_to`,
  )
    .bind(
      id,
      accountId,
      deal.id,
      deal.retailerId,
      trusted.sourceLabel,
      trusted.sourceUrl,
      deal.productUrl,
      deal.title.trim(),
      deal.capturedAt,
      deal.priceText ?? null,
      deal.previousPriceText ?? null,
      deal.savingText ?? null,
      deal.evidenceText.trim(),
      deal.imageUrl ?? null,
      timestamp,
      savedDealValidTo(deal),
    )
    .run()

  const savedDeal = await env.DB.prepare(
    `SELECT id, deal_id, retailer_id, source_label, source_url, product_url, title,
      captured_at, price_text, previous_price_text, saving_text, evidence_text, image_url,
      created_at, valid_to
      FROM member_saved_deals
      WHERE account_id = ? AND product_url = ?`,
  )
    .bind(accountId, deal.productUrl)
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

export async function getMemberBasket(env: TrolleyScoutEnv, accountId?: string): Promise<Basket> {
  if (!hasMemberStore(env) || !accountId) {
    return emptyBasket()
  }

  const result = await env.DB.prepare(
    `SELECT
      member_basket_items.id AS basket_id,
      member_basket_items.quantity AS basket_quantity,
      member_basket_items.created_at AS basket_created_at,
      member_basket_items.updated_at AS basket_updated_at,
      member_saved_deals.id AS saved_deal_id,
      member_saved_deals.deal_id AS deal_id,
      member_saved_deals.retailer_id AS retailer_id,
      member_saved_deals.source_label AS source_label,
      member_saved_deals.source_url AS source_url,
      member_saved_deals.product_url AS product_url,
      member_saved_deals.title AS title,
      member_saved_deals.captured_at AS captured_at,
      member_saved_deals.price_text AS price_text,
      member_saved_deals.previous_price_text AS previous_price_text,
      member_saved_deals.saving_text AS saving_text,
      member_saved_deals.evidence_text AS evidence_text,
      member_saved_deals.image_url AS image_url,
      member_saved_deals.valid_to AS valid_to,
      member_saved_deals.created_at AS saved_deal_created_at
      FROM member_basket_items
      INNER JOIN member_saved_deals ON member_saved_deals.id = member_basket_items.saved_deal_id
      WHERE member_basket_items.account_id = ?
      ORDER BY member_basket_items.created_at DESC`,
  )
    .bind(accountId)
    .all<BasketItemRow>()

  return buildBasket(result.results.map(basketItemRowToItem))
}

export async function addBasketItem(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: BasketItemDraft,
) {
  if (!hasMemberStore(env)) {
    return {
      issues: ['Member storage is not configured.'],
    }
  }

  if (!accountId) {
    return {
      issues: ['Sign in before adding basket items.'],
    }
  }

  const quantity = normalizeQuantity(input.quantity ?? 1)
  const savedDeal = await env.DB.prepare(
    `SELECT id FROM member_saved_deals
      WHERE account_id = ? AND id = ?`,
  )
    .bind(accountId, input.savedDealId)
    .first<{ id: string }>()

  if (!savedDeal) {
    return {
      issues: ['Save the deal before adding it to basket.'],
    }
  }

  const capacityIssue = await findPlanCapacityIssue(env, accountId, {
    countSql: 'SELECT COUNT(*) AS n FROM member_basket_items WHERE account_id = ?',
    existsKey: input.savedDealId,
    existsSql: 'SELECT id FROM member_basket_items WHERE account_id = ? AND saved_deal_id = ?',
    limitKey: 'basketItems',
    noun: 'basket items',
  })

  if (capacityIssue) {
    return {
      issues: [capacityIssue],
    }
  }

  const timestamp = new Date().toISOString()
  const id = `${accountId}-${hashString(`basket:${input.savedDealId}`)}`

  await env.DB.prepare(
    `INSERT INTO member_basket_items (
      id, account_id, saved_deal_id, quantity, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, saved_deal_id) DO UPDATE SET
      quantity = excluded.quantity,
      updated_at = excluded.updated_at`,
  )
    .bind(id, accountId, input.savedDealId, quantity, timestamp, timestamp)
    .run()

  return {
    basket: await getMemberBasket(env, accountId),
  }
}

export async function updateBasketItemQuantity(
  env: TrolleyScoutEnv,
  accountId: string | undefined,
  input: BasketQuantityDraft,
) {
  if (!hasMemberStore(env)) {
    return {
      issues: ['Member storage is not configured.'],
    }
  }

  if (!accountId) {
    return {
      issues: ['Sign in before changing basket items.'],
    }
  }

  const quantity = normalizeQuantity(input.quantity)
  const result = await env.DB.prepare(
    `UPDATE member_basket_items
      SET quantity = ?, updated_at = ?
      WHERE account_id = ? AND id = ?`,
  )
    .bind(quantity, new Date().toISOString(), accountId, input.id)
    .run()

  if (result.meta.changes === 0) {
    return {
      issues: ['Basket item was not found.'],
    }
  }

  return {
    basket: await getMemberBasket(env, accountId),
  }
}

export async function deleteBasketItem(env: TrolleyScoutEnv, accountId: string | undefined, id: string) {
  if (!hasMemberStore(env) || !accountId) {
    return {
      basket: emptyBasket(),
      deleted: false,
    }
  }

  const result = await env.DB.prepare(
    `DELETE FROM member_basket_items
      WHERE account_id = ? AND id = ?`,
  )
    .bind(accountId, id)
    .run()

  return {
    basket: await getMemberBasket(env, accountId),
    deleted: result.meta.changes > 0,
  }
}

export async function startSubscriptionCheckout(
  env: TrolleyScoutEnv,
  request: Request,
  account: MemberAccount | undefined,
  planId: MemberPlanId,
  billingCycle: BillingCycle,
  preferRedirect = false,
): Promise<SubscriptionCheckoutResult> {
  if (!hasMemberStore(env) || !account) {
    return {
      billingCycle,
      billingReady: false,
      message: 'Sign in before changing plan.',
      planId,
      provider: 'payfast' as const,
      status: 'checkout_required' as MemberPlanStatus,
    }
  }

  // Paying more takes effect now; paying less waits for the period already paid
  // for to run out. Without that split, moving to a cheaper plan mid-cycle threw
  // away the rest of a month the member had already handed over money for.
  const change = classifyPlanChange({
    currentBillingCycle: account.billingCycle ?? billingCycle,
    currentPlanId: account.planId,
    nextBillingCycle: billingCycle,
    nextPlanId: planId,
  })

  if (change === 'none') {
    return {
      billingCycle,
      billingReady: true,
      message: `${getMemberPlan(planId).name} is already your plan.`,
      planId,
      provider: 'payfast' as const,
      status: 'active' as MemberPlanStatus,
    }
  }

  if (change === 'downgrade') {
    return schedulePlanDowngrade(env, { account, billingCycle, planId })
  }

  const billingOption = getPlanBillingOption(
    planId,
    billingCycle,
    await resolveMemberPricing(env, account.countryCode),
  )
  const payfast = resolvePayFastConfig(env)

  if (!billingOption || !payfast) {
    return {
      billingCycle,
      billingReady: false,
      message: 'Billing keys are not configured for this plan.',
      planId,
      provider: 'payfast' as const,
      status: 'billing_not_configured' as MemberPlanStatus,
    }
  }

  const origin = env.APP_URL ?? new URL(request.url).origin
  const attemptId = `billing-${crypto.randomUUID()}`
  const timestamp = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await env.DB.prepare(
    `INSERT INTO billing_attempts (
      id, account_id, provider, plan_id, billing_cycle, amount_cents,
      status, created_at, updated_at, expires_at
    ) VALUES (?, ?, 'payfast', ?, ?, ?, 'created', ?, ?, ?)`,
  )
    .bind(
      attemptId,
      account.id,
      planId,
      billingCycle,
      billingOption.amountCents,
      timestamp,
      timestamp,
      expiresAt,
    )
    .run()

  const fields = createPayFastCheckoutFields({
    account,
    attemptId,
    cancelUrl: new URL('/Subscription?payfast=cancelled', origin).toString(),
    merchantId: payfast.merchantId,
    merchantKey: payfast.merchantKey,
    notifyUrl: resolvePayFastNotifyUrl(env, origin, '/api/payfast-itn'),
    option: billingOption,
    passphrase: payfast.passphrase ?? '',
    returnUrl: new URL('/Subscription?payfast=success', origin).toString(),
  })

  let onsiteUuid: string | undefined

  if (!preferRedirect) {
    try {
      onsiteUuid = await requestPayFastOnsitePayment(fields, payfast.mode)
    } catch {
      onsiteUuid = undefined
    }
  }

  if (!onsiteUuid) {
    // Onsite payments may not be enabled on the account. Fall back to the
    // classic redirect checkout, which works for any PayFast account (including
    // the public sandbox), so a payment can still be completed.
    await env.DB.prepare(
      `UPDATE billing_attempts
        SET status = 'pending', updated_at = ?
        WHERE id = ?`,
    )
      .bind(new Date().toISOString(), attemptId)
      .run()

    return {
      billingCycle,
      billingReady: true,
      message: 'Redirecting to PayFast to complete your payment.',
      planId,
      provider: 'payfast' as const,
      redirectFields: Object.fromEntries(fields),
      redirectUrl: getPayFastEndpoints(payfast.mode).processUrl,
      status: 'checkout_required' as MemberPlanStatus,
    }
  }

  await env.DB.prepare(
    `UPDATE billing_attempts
      SET onsite_uuid = ?, status = 'pending', updated_at = ?
      WHERE id = ?`,
  )
    .bind(onsiteUuid, new Date().toISOString(), attemptId)
    .run()

  return {
    billingCycle,
    billingReady: true,
    engineUrl: getPayFastEndpoints(payfast.mode).engineUrl,
    message: 'PayFast checkout is ready.',
    onsiteUuid,
    planId,
    provider: 'payfast' as const,
    status: 'checkout_required' as MemberPlanStatus,
  }
}

// A queued downgrade needs a subscription to hang off. When there is none the
// member is on a plan an admin granted, so no money was taken, there is no paid
// period to protect, and the change simply applies now.
async function schedulePlanDowngrade(
  env: TrolleyScoutEnv & { DB: D1Database },
  input: {
    account: MemberAccount
    billingCycle: BillingCycle
    planId: MemberPlanId
  },
): Promise<SubscriptionCheckoutResult> {
  const now = new Date()
  const timestamp = now.toISOString()
  const subscription = await env.DB.prepare(
    `SELECT billing_cycle, current_period_end FROM billing_subscriptions
      WHERE account_id = ? AND provider = 'payfast' AND status = 'active'`,
  )
    .bind(input.account.id)
    .first<{ billing_cycle: string | null; current_period_end: string | null }>()

  if (!subscription) {
    await env.DB.prepare(
      `UPDATE member_accounts SET plan_id = ?, plan_status = 'active', updated_at = ?
        WHERE id = ?`,
    )
      .bind(input.planId, timestamp, input.account.id)
      .run()

    return {
      billingCycle: input.billingCycle,
      billingReady: true,
      message: `You are now on ${getMemberPlan(input.planId).name}.`,
      planId: input.planId,
      provider: 'payfast' as const,
      status: 'active' as MemberPlanStatus,
    }
  }

  const effectiveAt = resolveEffectiveAt({
    billingCycle: subscription.billing_cycle === 'annual' ? 'annual' : 'monthly',
    currentPeriodEnd: subscription.current_period_end,
    now,
  })

  await env.DB.prepare(
    `UPDATE billing_subscriptions
      SET pending_plan_id = ?, pending_billing_cycle = ?, pending_effective_at = ?, updated_at = ?
      WHERE account_id = ? AND provider = 'payfast' AND status = 'active'`,
  )
    .bind(input.planId, input.billingCycle, effectiveAt, timestamp, input.account.id)
    .run()

  const effectiveDate = effectiveAt.slice(0, 10)

  return {
    billingCycle: input.billingCycle,
    billingReady: true,
    effectiveAt,
    message:
      input.planId === 'free'
        ? `Your subscription is cancelled. You keep ${input.account.planName} until ${effectiveDate} and will not be charged again.`
        : `${getMemberPlan(input.planId).name} starts on ${effectiveDate}. You keep ${input.account.planName} until then, and nothing is charged today.`,
    planId: input.planId,
    provider: 'payfast' as const,
    status: 'scheduled' as MemberPlanStatus,
  }
}

// Lets a member change their mind while the change is still queued.
export async function cancelPendingPlanChange(
  env: TrolleyScoutEnv,
  account: MemberAccount | undefined,
) {
  if (!hasMemberStore(env) || !account) {
    return { issues: ['Sign in to manage your plan.'] }
  }

  const result = await env.DB.prepare(
    `UPDATE billing_subscriptions
      SET pending_plan_id = NULL, pending_billing_cycle = NULL,
          pending_effective_at = NULL, updated_at = ?
      WHERE account_id = ? AND provider = 'payfast' AND pending_plan_id IS NOT NULL`,
  )
    .bind(new Date().toISOString(), account.id)
    .run()

  if (result.meta.changes === 0) {
    return { issues: ['There is no scheduled plan change to cancel.'] }
  }

  const row = await env.DB.prepare(`${ACCOUNT_WITH_BILLING_SELECT} WHERE member_accounts.id = ?`)
    .bind(account.id)
    .first<MemberAccountRow>()

  return row ? { account: await accountRowToMember(env, row) } : { issues: ['Account could not be loaded.'] }
}

interface TrustedSavedDeal {
  deal: SavedDealDraft
  sourceLabel: string
  sourceUrl: string
}

async function resolveTrustedSavedDeal(
  env: TrolleyScoutEnv & { DB: D1Database },
  input: SavedDealDraft,
): Promise<TrustedSavedDeal | undefined> {
  const retailer = retailers.find((candidate) => candidate.id === input.retailerId)

  // A deal is trusted when it points at the retailer's own domain family.
  // Requiring an exact registry source URL rejected every legitimate feed and
  // catalogue deal (their sourceUrl is the feed endpoint or leaflet document,
  // not the registry landing page), which shoppers saw as a refusal to save.
  if (
    retailer &&
    matchesRetailerSourceUrl(input.productUrl, retailer) &&
    matchesRetailerSourceUrl(input.sourceUrl, retailer)
  ) {
    const source = retailer.sources.find((candidate) => candidate.url === input.sourceUrl)
    return {
      deal: input,
      sourceLabel: source?.label ?? (input.sourceLabel?.trim() || `${retailer.name} official source`),
      sourceUrl: input.sourceUrl,
    }
  }

  // Catalogue scans can deep-link to a hosted viewer domain (e.g. PnP's
  // HFlip) — trust those through the stored deal item the scout wrote.
  const storedDeal = await findStoredDealItem(env, input)
  if (storedDeal) {
    return storedDeal
  }

  const row = await env.DB.prepare(
    'SELECT payload_json FROM deal_site_cache WHERE source_key = ?',
  )
    .bind(input.retailerId)
    .first<{ payload_json: string }>()

  if (!row) {
    return undefined
  }

  let items: DealSiteItem[]
  try {
    const parsed = JSON.parse(row.payload_json) as unknown
    if (!Array.isArray(parsed)) return undefined
    items = parsed as DealSiteItem[]
  } catch {
    return undefined
  }

  const item = items.find((candidate) =>
    candidate.source === input.retailerId &&
    candidate.id === input.id &&
    candidate.productUrl === input.productUrl,
  )

  if (!item) {
    return undefined
  }

  return {
    deal: {
      ...input,
      id: item.id,
      previousPriceText: item.previousPriceText,
      priceText: item.priceText,
      productUrl: item.productUrl,
      retailerId: item.source,
      retailerName: item.retailerName,
      savingText: item.savingText,
      sourceLabel: item.sourceLabel,
      sourceUrl: item.productUrl,
      title: item.title,
    },
    sourceLabel: item.sourceLabel,
    sourceUrl: item.productUrl,
  }
}

async function getAccountByEmail(env: TrolleyScoutEnv & { DB: D1Database }, email: string) {
  const lookup = await emailLookup(env, email)
  const row = await env.DB.prepare(
    `${ACCOUNT_WITH_BILLING_SELECT}
      WHERE member_accounts.email_lookup = ?
        OR (member_accounts.email_lookup IS NULL AND member_accounts.email = ?)`,
  )
    .bind(lookup, email)
    .first<MemberAccountRow>()

  return row ? accountRowToMember(env, row) : undefined
}

async function accountRowToMember(env: TrolleyScoutEnv, row: MemberAccountRow): Promise<MemberAccount> {
  const planId = normalizePlanId(row.plan_id)
  const plan = getMemberPlan(planId)
  const email = await revealEmail(env, row.email)
  const role = row.role === 'admin' || isAdminEmail(email) ? 'admin' : 'member'
  const country = countryFromCode(row.country_code ?? 'ZA')

  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    email,
    id: row.id,
    initials: getInitials(row.display_name),
    planId,
    planName: plan.name,
    planStatus: normalizePlanStatus(row.plan_status),
    propertiesAccess: computePropertiesAccess(planId, role, row.properties_access),
    role,
    status: row.status === 'banned' ? 'banned' : 'active',
    ...(row.banned_at ? { bannedAt: row.banned_at } : {}),
    ...(row.ban_reason ? { banReason: row.ban_reason } : {}),
    ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at } : {}),
    ...(row.deal_view_count === undefined || row.deal_view_count === null
      ? {}
      : { dealViewCount: Number(row.deal_view_count) }),
    countryCode: country.code,
    countryName: row.country_name ?? country.name,
    currencyCode: row.currency_code ?? country.currencyCode,
    updatedAt: row.updated_at,
    billingCycle: normalizeBillingCycle(row.billing_cycle),
    currentPeriodEnd: row.current_period_end ?? undefined,
    // A queued downgrade is only meaningful with a date to land on, so an
    // incomplete pair is reported as no pending change at all.
    ...(row.pending_plan_id && row.pending_effective_at
      ? {
          pendingBillingCycle: normalizeBillingCycle(row.pending_billing_cycle),
          pendingEffectiveAt: row.pending_effective_at,
          pendingPlanId: normalizePlanId(row.pending_plan_id),
        }
      : {}),
  }
}

export async function protectLegacyMemberEmails(
  env: TrolleyScoutEnv,
  limit = 500,
): Promise<{ protected: number; remaining: number }> {
  if (!hasMemberStore(env) || !hasEmailProtection(env)) {
    return { protected: 0, remaining: 0 }
  }

  const rows = await env.DB.prepare(
    `SELECT id, email FROM member_accounts
      WHERE email_lookup IS NULL OR email NOT LIKE 'enc:v1:%'
      LIMIT ?`,
  ).bind(limit).all<{ email: string; id: string }>()

  // Compute every row's new (encrypted email, lookup hash) pair up front, then
  // submit all the UPDATEs in one D1 round trip instead of one per row.
  const updates = await Promise.all(rows.results.map(async (row) => {
    const email = await revealEmail(env, row.email)
    return {
      email: isProtectedEmail(row.email) ? row.email : await protectEmail(env, email),
      id: row.id,
      lookup: await emailLookup(env, email),
    }
  }))

  const timestamp = new Date().toISOString()
  const statements: D1PreparedStatement[] = updates.map((update) =>
    env.DB.prepare(
      'UPDATE member_accounts SET email = ?, email_lookup = ?, updated_at = ? WHERE id = ?',
    ).bind(update.email, update.lookup, timestamp, update.id),
  )

  let protectedCount = 0
  if (statements.length > 0) {
    const results = await env.DB.batch(statements)
    protectedCount = results.filter((result) => result.meta.changes > 0).length
  }

  const remaining = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM member_accounts
      WHERE email_lookup IS NULL OR email NOT LIKE 'enc:v1:%'`,
  ).first<{ total: number }>()

  return { protected: protectedCount, remaining: Number(remaining?.total ?? 0) }
}

function savedSourceRowToSource(row: SavedSourceRow): SavedSource {
  const retailer = retailers.find((candidate) => candidate.id === row.retailer_id)

  return {
    createdAt: row.created_at,
    id: row.id,
    retailerId: normalizeRetailerId(row.retailer_id),
    retailerName: retailer?.name ?? row.source_label ?? row.retailer_id,
    sourceKind: normalizeSourceKind(row.source_kind),
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
  }
}

// The offer's last valid calendar day. A deal states this either as validTo or
// as an expiresAt instant; anything else is stored as unknown rather than
// guessed, so an offer is only ever hidden on evidence it has actually closed.
function savedDealValidTo(deal: SavedDealDraft): string | null {
  for (const value of [deal.validTo, deal.expiresAt]) {
    if (typeof value !== 'string') continue
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
    if (match) return match[1]
  }
  return null
}

function savedDealRowToDeal(row: SavedDealRow): SavedDeal {
  const retailer = retailers.find((candidate) => candidate.id === row.retailer_id)

  return {
    capturedAt: row.captured_at,
    evidenceText: row.evidence_text,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    previousPriceText: row.previous_price_text ?? undefined,
    priceText: row.price_text ?? undefined,
    productUrl: row.product_url,
    retailerId: normalizeRetailerId(row.retailer_id),
    retailerName: retailer?.name ?? row.source_label ?? row.retailer_id,
    savedAt: row.created_at,
    savingText: row.saving_text ?? undefined,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    title: row.title,
    validTo: row.valid_to ?? undefined,
  }
}

function basketItemRowToItem(row: BasketItemRow): BasketItem {
  const deal = savedDealRowToDeal({
    captured_at: row.captured_at,
    created_at: row.saved_deal_created_at,
    deal_id: row.deal_id,
    evidence_text: row.evidence_text,
    id: row.saved_deal_id,
    image_url: row.image_url,
    previous_price_text: row.previous_price_text,
    price_text: row.price_text,
    product_url: row.product_url,
    retailer_id: row.retailer_id,
    saving_text: row.saving_text,
    source_label: row.source_label,
    source_url: row.source_url,
    title: row.title,
    valid_to: row.valid_to,
  })
  const unitPriceCents = parseRandCents(deal.priceText)
  const previousUnitPriceCents = parseRandCents(deal.previousPriceText)
  // Honour multi-buy promotions ("2 for R30", "buy 2 get 1 free") so the line
  // cost and saving reflect what the shopper actually pays at the till.
  const multibuy = parseMultibuy(deal.priceText, deal.savingText)
  const { linePriceCents, lineSavingCents } = computeLineEconomics({
    multibuy,
    previousUnitPriceCents,
    quantity: row.basket_quantity,
    unitPriceCents,
  })

  return {
    addedAt: row.basket_created_at,
    deal,
    id: row.basket_id,
    linePriceCents,
    lineSavingCents,
    previousUnitPriceCents,
    quantity: row.basket_quantity,
    savedDealId: row.saved_deal_id,
    unitPriceCents,
    updatedAt: row.basket_updated_at,
  }
}

function buildBasket(items: BasketItem[]): Basket {
  return {
    items,
    summary: basketSummary(items),
  }
}

function basketSummary(items: BasketItem[]): BasketSummary {
  return items.reduce<BasketSummary>(
    (summary, item) => ({
      itemCount: summary.itemCount + item.quantity,
      knownPriceItemCount:
        summary.knownPriceItemCount + (item.unitPriceCents === undefined ? 0 : item.quantity),
      savingsCents: summary.savingsCents + (item.lineSavingCents ?? 0),
      totalCents: summary.totalCents + (item.linePriceCents ?? 0),
    }),
    {
      itemCount: 0,
      knownPriceItemCount: 0,
      savingsCents: 0,
      totalCents: 0,
    },
  )
}

function emptyBasket(): Basket {
  return buildBasket([])
}

function validateSavedDeal(input: SavedDealDraft) {
  const issues: string[] = []

  if (!input.retailerId) {
    issues.push('Choose a retailer or deal source.')
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

function normalizePlanId(value: string): MemberPlanId {
  return value === 'scout' || value === 'household' || value === 'organization' ? value : 'free'
}

function normalizePlanStatus(value: string): MemberPlanStatus {
  if (
    value === 'billing_not_configured' ||
    value === 'checkout_required' ||
    value === 'scheduled'
  ) {
    return value
  }

  return 'active'
}

function normalizeBillingCycle(value: string | null | undefined): BillingCycle | undefined {
  return value === 'annual' || value === 'monthly' ? value : undefined
}

function normalizeRetailerId(value: string): RetailerId {
  return (value.trim() || 'pick-n-pay') as RetailerId
}

function normalizeSourceKind(value: string): SourceKind {
  if (value === 'app' || value === 'loyalty' || value === 'store-finder') {
    return value
  }

  return 'specials'
}

function matchesRetailerSourceUrl(value: string, retailer: { sources: Array<{ url: string }> }) {
  try {
    const candidate = baseHostname(new URL(value).hostname)

    return retailer.sources.some((source) => {
      const sourceHost = baseHostname(new URL(source.url).hostname)
      return candidate === sourceHost || candidate.endsWith(`.${sourceHost}`)
    })
  } catch {
    return false
  }
}

// Registry sources are usually listed as www.<retailer>; deals live on
// sibling subdomains like specials.<retailer>. Compare the registrable part.
function baseHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '')
}

// A deal the scout itself stored in deal_items is trusted regardless of the
// domain it deep-links to (catalogue scans can point at hosted viewers).
async function findStoredDealItem(
  env: TrolleyScoutEnv & { DB: D1Database },
  input: SavedDealDraft,
): Promise<TrustedSavedDeal | undefined> {
  try {
    const row = await env.DB.prepare(
      `SELECT retailer_id, source_url FROM deal_items
        WHERE id = ? AND status = 'active'`,
    )
      .bind(input.id)
      .first<{ retailer_id: string; source_url: string }>()

    if (!row || row.retailer_id !== input.retailerId) {
      return undefined
    }

    return {
      deal: input,
      sourceLabel: input.sourceLabel?.trim() || 'Official source',
      sourceUrl: row.source_url,
    }
  } catch {
    // Environments without the deal_items table fall through to other checks.
    return undefined
  }
}

function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(99, Math.max(1, Math.trunc(value)))
}

function parseRandCents(value?: string) {
  if (!value) {
    return undefined
  }

  const match = /R\s*([0-9][0-9\s,.]*)/i.exec(value)

  if (!match) {
    return undefined
  }

  const rawAmount = match[1].replace(/\s/g, '')
  const lastComma = rawAmount.lastIndexOf(',')
  const lastDot = rawAmount.lastIndexOf('.')
  let normalized = rawAmount.replace(/[,.]/g, '')

  if (lastComma > -1 && (lastDot === -1 || lastComma > lastDot)) {
    const centsPart = rawAmount.slice(lastComma + 1)

    if (/^\d{2}$/.test(centsPart)) {
      normalized = `${rawAmount.slice(0, lastComma).replace(/[,.]/g, '')}.${centsPart}`
    }
  } else if (lastDot > -1) {
    const centsPart = rawAmount.slice(lastDot + 1)

    if (/^\d{2}$/.test(centsPart)) {
      normalized = `${rawAmount.slice(0, lastDot).replace(/[,.]/g, '')}.${centsPart}`
    }
  }

  const amount = Number(normalized)

  if (!Number.isFinite(amount)) {
    return undefined
  }

  return Math.round(amount * 100)
}

function hashString(value: string) {
  let hash = 5381

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index)
  }

  return (hash >>> 0).toString(36)
}
