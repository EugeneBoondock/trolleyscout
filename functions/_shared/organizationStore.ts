// Organisation onboarding data access. A member applies to trade on Trolley
// Scout, an admin reads the queue and decides, and an approval mints the
// organizations row that grants the org portal. Everything the flow touches
// lives here, guarded like every other store so an unbound D1 degrades to a
// safe empty result rather than a 500.
//
// Contact details are stored exactly as the applicant typed them (trimmed) and
// are never written to a log.

import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

export type OrganizationApplicationStatus = 'pending' | 'approved' | 'rejected'
export type OrganizationStatus = 'active' | 'suspended'
export type OrganizationDecision = 'approved' | 'rejected'

/// An application as both the applicant and the admin queue see it. The
/// reviewing admin's account id is recorded in the row for audit but is never
/// mapped out, so it cannot leak to the member who applied.
export interface OrganizationApplication {
  id: string
  accountId: string
  organisationName: string
  tradingName?: string
  registrationNumber?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  websiteUrl?: string
  category?: string
  description: string
  city?: string
  province?: string
  status: OrganizationApplicationStatus
  planId?: string
  planStatus?: string
  businessSubscriptionActive: boolean
  reviewNote?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Organization {
  id: string
  accountId: string
  applicationId?: string
  name: string
  slug: string
  status: OrganizationStatus
  createdAt: string
  updatedAt: string
}

/// What the org portal needs to gate itself — no owner or application detail.
export interface PortalOrganization {
  id: string
  name: string
  slug: string
  status: OrganizationStatus
}

export interface OrganizationApplicationInput {
  organisationName: string
  tradingName?: string
  registrationNumber?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  websiteUrl?: string
  category?: string
  description: string
  city?: string
  province?: string
}

export interface OrganizationReviewResult {
  application?: OrganizationApplication
  organization?: Organization
  changed: boolean
  issues?: string[]
}

interface ApplicationRow {
  id: string
  account_id: string
  organisation_name: string
  trading_name: string | null
  registration_number: string | null
  contact_name: string
  contact_email: string
  contact_phone: string | null
  website_url: string | null
  category: string | null
  description: string | null
  city: string | null
  province: string | null
  status: string
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  member_plan_id?: string | null
  member_plan_status?: string | null
}

interface OrganizationRow {
  id: string
  account_id: string
  application_id: string | null
  name: string
  slug: string
  status: string
  created_at: string
  updated_at: string
}

const APPLICATION_WITH_PLAN_COLUMNS =
  'application.id, application.account_id, application.organisation_name, ' +
  'application.trading_name, application.registration_number, application.contact_name, ' +
  'application.contact_email, application.contact_phone, application.website_url, ' +
  'application.category, application.description, application.city, application.province, ' +
  'application.status, application.review_note, application.reviewed_at, ' +
  'application.created_at, application.updated_at, account.plan_id AS member_plan_id, ' +
  'account.plan_status AS member_plan_status'

const MAX_LENGTH = {
  category: 60,
  city: 120,
  contactEmail: 200,
  contactName: 120,
  contactPhone: 32,
  description: 2000,
  organisationName: 120,
  province: 120,
  registrationNumber: 60,
  reviewNote: 1000,
  tradingName: 120,
  websiteUrl: 300,
} as const

const MIN_NAME_LENGTH = 2
const MIN_DESCRIPTION_LENGTH = 20
const MAX_SLUG_LENGTH = 60
const REVIEW_QUEUE_LIMIT = 200
const MEMBER_APPLICATION_LIMIT = 20

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^\+?[0-9][0-9\s()./-]{5,23}$/

// Slugs that would collide with the portal's own paths get a numeric suffix
// instead of the bare name.
const RESERVED_SLUGS = new Set(['about', 'admin', 'api', 'app', 'assets', 'org', 'portal', 'www'])

export async function submitOrganizationApplication(
  env: TrolleyScoutEnv,
  accountId: string,
  input: OrganizationApplicationInput,
): Promise<{ application?: OrganizationApplication; issues?: string[] }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { issues: ['Organisation applications are not available right now.'] }
  }

  const validated = validateApplicationInput(input)

  if (validated.issues.length > 0 || !validated.value) {
    return { issues: validated.issues }
  }

  const [pending, existing] = await Promise.all([
    countPendingApplications(env, accountId),
    findAccountOrganization(env, accountId),
  ])

  if (pending > 0) {
    return {
      issues: ['Your organisation application is already with our team. We will reply before you can send another.'],
    }
  }

  if (existing) {
    return { issues: [alreadyOwnedIssue(existing)] }
  }

  const value = validated.value
  const id = `org-app-${crypto.randomUUID()}`
  const now = new Date().toISOString()

  try {
    await env.DB.prepare(
      `INSERT INTO organization_applications (
        id, account_id, organisation_name, trading_name, registration_number, contact_name,
        contact_email, contact_phone, website_url, category, description, city, province,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        id,
        accountId,
        value.organisationName,
        value.tradingName ?? null,
        value.registrationNumber ?? null,
        value.contactName,
        value.contactEmail,
        value.contactPhone ?? null,
        value.websiteUrl ?? null,
        value.category ?? null,
        value.description,
        value.city ?? null,
        value.province ?? null,
        now,
        now,
      )
      .run()
  } catch {
    // The one-pending-per-account index also lands here when two submissions
    // race, which is the same answer the applicant should get either way.
    return { issues: ['Your application could not be saved. Try again in a moment.'] }
  }

  const application = await getOrganizationApplication(env, id)
  return application
    ? { application }
    : { issues: ['Your application could not be loaded after saving.'] }
}

export async function listMemberOrganizationApplications(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<OrganizationApplication[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT ${APPLICATION_WITH_PLAN_COLUMNS}
        FROM organization_applications AS application
        LEFT JOIN member_accounts AS account ON account.id = application.account_id
        WHERE application.account_id = ?
        ORDER BY application.created_at DESC LIMIT ?`,
    )
      .bind(accountId, MEMBER_APPLICATION_LIMIT)
      .all<ApplicationRow>()
    return result.results.map(rowToApplication)
  } catch {
    return []
  }
}

export async function listOrganizationApplicationsForReview(
  env: TrolleyScoutEnv,
  status?: string,
): Promise<OrganizationApplication[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  // Only a known status ever reaches the query, and it is bound rather than
  // interpolated.
  const filter = isApplicationStatus(status) ? status : undefined

  try {
    const statement = filter
      ? env.DB.prepare(
        `SELECT ${APPLICATION_WITH_PLAN_COLUMNS}
            FROM organization_applications AS application
            LEFT JOIN member_accounts AS account ON account.id = application.account_id
            WHERE application.status = ?
            ORDER BY application.created_at DESC LIMIT ?`,
      ).bind(filter, REVIEW_QUEUE_LIMIT)
      : env.DB.prepare(
        `SELECT ${APPLICATION_WITH_PLAN_COLUMNS}
            FROM organization_applications AS application
            LEFT JOIN member_accounts AS account ON account.id = application.account_id
            ORDER BY application.created_at DESC LIMIT ?`,
      ).bind(REVIEW_QUEUE_LIMIT)

    const result = await statement.all<ApplicationRow>()
    return result.results.map(rowToApplication)
  } catch {
    return []
  }
}

export async function getOrganizationApplication(
  env: TrolleyScoutEnv,
  id: string,
): Promise<OrganizationApplication | undefined> {
  if (!hasTrolleyScoutDatabase(env)) {
    return undefined
  }

  try {
    const row = await env.DB.prepare(
      `SELECT ${APPLICATION_WITH_PLAN_COLUMNS}
        FROM organization_applications AS application
        LEFT JOIN member_accounts AS account ON account.id = application.account_id
        WHERE application.id = ?`,
    )
      .bind(id)
      .first<ApplicationRow>()
    return row ? rowToApplication(row) : undefined
  } catch {
    return undefined
  }
}

/// The caller's active organisation, or undefined. This is the access grant the
/// org portal reads: no row, no portal. A suspended organisation deliberately
/// answers undefined — suspension is how an admin closes the portal.
export async function getOrganizationForAccount(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<Organization | undefined> {
  return findAccountOrganization(env, accountId, {
    activeOnly: true,
    requireBusinessSubscription: true,
  })
}

/// Whether the account has an organisation at all. Onboarding asks this rather
/// than the portal question, so a suspended owner cannot re-apply their way
/// back in — and an approval can never mark an application approved without
/// creating the organisation behind it.
async function findAccountOrganization(
  env: TrolleyScoutEnv,
  accountId: string,
  options: { activeOnly?: boolean; requireBusinessSubscription?: boolean } = {},
): Promise<Organization | undefined> {
  if (!hasTrolleyScoutDatabase(env)) {
    return undefined
  }

  try {
    const row = await env.DB.prepare(
      `SELECT
          organization.id, organization.account_id, organization.application_id,
          organization.name, organization.slug, organization.status,
          organization.created_at, organization.updated_at
        FROM organizations AS organization
        LEFT JOIN member_accounts AS account ON account.id = organization.account_id
        WHERE organization.account_id = ?
          AND (? = 0 OR organization.status = 'active')
          AND (
            ? = 0
            OR (account.plan_id = 'organization' AND account.plan_status = 'active')
          )
        ORDER BY organization.created_at ASC LIMIT 1`,
    )
      .bind(
        accountId,
        options.activeOnly ? 1 : 0,
        options.requireBusinessSubscription ? 1 : 0,
      )
      .first<OrganizationRow>()
    return row ? rowToOrganization(row) : undefined
  } catch {
    return undefined
  }
}

function alreadyOwnedIssue(organization: Organization): string {
  return organization.status === 'suspended'
    ? `${organization.name} is suspended on your account. Contact support to reopen it.`
    : `${organization.name} is already set up on your account.`
}

function activeOrUndefined(organization?: Organization): Organization | undefined {
  return organization?.status === 'active' ? organization : undefined
}

export function toPortalOrganization(organization: Organization): PortalOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
  }
}

/// Records an admin decision. Approval writes the decision and creates the
/// organisation in one D1 batch, so a half-approval — an approved application
/// with no organisation behind it — cannot happen. Deciding an application that
/// is no longer pending is a no-op that reports the state as it stands.
export async function reviewOrganizationApplication(
  env: TrolleyScoutEnv,
  adminAccountId: string,
  applicationId: string,
  decision: OrganizationDecision,
  note?: string,
): Promise<OrganizationReviewResult> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { changed: false, issues: ['Organisation reviews are not available right now.'] }
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    return { changed: false, issues: ['Decide either approved or rejected.'] }
  }

  const application = await getOrganizationApplication(env, applicationId)

  if (!application) {
    return { changed: false, issues: ['That application was not found.'] }
  }

  const owned = await findAccountOrganization(env, application.accountId)

  if (application.status !== 'pending') {
    return {
      application,
      changed: false,
      organization: application.businessSubscriptionActive
        ? activeOrUndefined(owned)
        : undefined,
    }
  }

  if (decision === 'approved' && !application.businessSubscriptionActive) {
    return {
      application,
      changed: false,
      issues: [
        'The Organisation subscription must be active before this application can be approved.',
      ],
    }
  }

  if (decision === 'approved' && owned) {
    return {
      application,
      changed: false,
      issues: [
        owned.status === 'suspended'
          ? `${owned.name} is suspended on that account. Reopen it instead of approving a new application.`
          : `${owned.name} is already set up on that account.`,
      ],
      organization: activeOrUndefined(owned),
    }
  }

  const reviewNote = boundedText(note, MAX_LENGTH.reviewNote)
  const now = new Date().toISOString()
  const decided =
    decision === 'approved'
      ? await approveApplication(env, { adminAccountId, application, now, reviewNote })
      : await rejectApplication(env, { adminAccountId, applicationId, now, reviewNote })

  if (!decided) {
    return { application, changed: false, issues: ['That decision could not be saved. Try again.'] }
  }

  return {
    application: (await getOrganizationApplication(env, applicationId)) ?? application,
    changed: true,
    organization: await getOrganizationForAccount(env, application.accountId),
  }
}

async function approveApplication(
  env: TrolleyScoutEnv & { DB: D1Database },
  input: {
    adminAccountId: string
    application: OrganizationApplication
    now: string
    reviewNote?: string
  },
): Promise<boolean> {
  const { adminAccountId, application, now, reviewNote } = input
  const slug = await reserveOrganizationSlug(env, application.organisationName)

  try {
    // One batch, one transaction. The insert re-reads the application row the
    // update just approved and refuses when the account already has an
    // organisation, so a repeated approval adds nothing.
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE organization_applications
          SET status = 'approved', review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'`,
      ).bind(reviewNote ?? null, adminAccountId, now, now, application.id),
      env.DB.prepare(
        `INSERT INTO organizations (
          id, account_id, application_id, name, slug, status, created_at, updated_at
        )
        SELECT ?, applied.account_id, applied.id, applied.organisation_name, ?, 'active', ?, ?
          FROM organization_applications AS applied
          WHERE applied.id = ?
            AND applied.status = 'approved'
            AND NOT EXISTS (
              SELECT 1 FROM organizations AS owned
                WHERE owned.account_id = applied.account_id
                  OR owned.application_id = applied.id
            )`,
      ).bind(`org-${crypto.randomUUID()}`, slug, now, now, application.id),
    ])
    return true
  } catch {
    // A slug that was taken between reserving and inserting rolls the whole
    // batch back, leaving the application pending for the admin to retry.
    return false
  }
}

async function rejectApplication(
  env: TrolleyScoutEnv & { DB: D1Database },
  input: { adminAccountId: string; applicationId: string; now: string; reviewNote?: string },
): Promise<boolean> {
  try {
    const result = await env.DB.prepare(
      `UPDATE organization_applications
        SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
      .bind(
        input.reviewNote ?? null,
        input.adminAccountId,
        input.now,
        input.now,
        input.applicationId,
      )
      .run()
    return result.meta.changes > 0
  } catch {
    return false
  }
}

async function countPendingApplications(
  env: TrolleyScoutEnv & { DB: D1Database },
  accountId: string,
): Promise<number> {
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM organization_applications
        WHERE account_id = ? AND status = 'pending'`,
    )
      .bind(accountId)
      .first<{ total: number }>()
    return Number(row?.total ?? 0)
  } catch {
    return 0
  }
}

/// Picks a free slug from the organisation name: lowercase, hyphenated, and
/// de-duplicated with a numeric suffix when the name is already taken.
async function reserveOrganizationSlug(
  env: TrolleyScoutEnv & { DB: D1Database },
  name: string,
): Promise<string> {
  const base = slugify(name) || 'organisation'
  let taken = new Set<string>()

  try {
    // Slugified text can only contain [a-z0-9-], so it carries no LIKE wildcard.
    const result = await env.DB.prepare(
      'SELECT slug FROM organizations WHERE slug = ? OR slug LIKE ?',
    )
      .bind(base, `${base}-%`)
      .all<{ slug: string }>()
    taken = new Set(result.results.map((row) => row.slug))
  } catch {
    // Fall through: the UNIQUE index is the real guard and a clash simply rolls
    // the approval back.
  }

  if (!taken.has(base) && !RESERVED_SLUGS.has(base)) {
    return base
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) {
      return candidate
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')
}

interface ValidatedApplication {
  organisationName: string
  tradingName?: string
  registrationNumber?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  websiteUrl?: string
  category?: string
  description: string
  city?: string
  province?: string
}

function validateApplicationInput(
  input: OrganizationApplicationInput,
): { issues: string[]; value?: ValidatedApplication } {
  const organisationName = trimmed(input.organisationName)
  const contactName = trimmed(input.contactName)
  const contactEmail = trimmed(input.contactEmail)
  const description = trimmed(input.description)
  const tradingName = trimmed(input.tradingName)
  const registrationNumber = trimmed(input.registrationNumber)
  const contactPhone = trimmed(input.contactPhone)
  const websiteUrl = trimmed(input.websiteUrl)
  const category = trimmed(input.category)
  const city = trimmed(input.city)
  const province = trimmed(input.province)

  const issues: string[] = []

  if (organisationName.length < MIN_NAME_LENGTH || organisationName.length > MAX_LENGTH.organisationName) {
    issues.push(`Enter the organisation name, between ${MIN_NAME_LENGTH} and ${MAX_LENGTH.organisationName} characters.`)
  }
  if (contactName.length < MIN_NAME_LENGTH || contactName.length > MAX_LENGTH.contactName) {
    issues.push('Enter the name of the person we should speak to.')
  }
  if (!contactEmail || contactEmail.length > MAX_LENGTH.contactEmail || !EMAIL_PATTERN.test(contactEmail)) {
    issues.push('Enter a valid contact email address so we can reply.')
  }
  if (description.length < MIN_DESCRIPTION_LENGTH || description.length > MAX_LENGTH.description) {
    issues.push(`Describe what the organisation sells in ${MIN_DESCRIPTION_LENGTH}–${MAX_LENGTH.description} characters.`)
  }
  if (contactPhone && (contactPhone.length > MAX_LENGTH.contactPhone || !PHONE_PATTERN.test(contactPhone))) {
    issues.push('Enter a valid contact phone number, or leave it blank.')
  }
  if (websiteUrl && (websiteUrl.length > MAX_LENGTH.websiteUrl || !isHttpUrl(websiteUrl))) {
    issues.push('The website must be a valid https:// link, or leave it blank.')
  }

  issues.push(...tooLongIssues({ category, city, province, registrationNumber, tradingName }))

  const allText = [
    organisationName, tradingName, registrationNumber, contactName, contactEmail,
    contactPhone, websiteUrl, category, description, city, province,
  ]

  if (allText.some(containsMarkup)) {
    issues.push('Remove < and > from the details — these fields take plain text only.')
  }

  if (issues.length > 0) {
    return { issues }
  }

  return {
    issues,
    value: {
      category: category || undefined,
      city: city || undefined,
      contactEmail,
      contactName,
      contactPhone: contactPhone || undefined,
      description,
      organisationName,
      province: province || undefined,
      registrationNumber: registrationNumber || undefined,
      tradingName: tradingName || undefined,
      websiteUrl: websiteUrl || undefined,
    },
  }
}

function tooLongIssues(fields: {
  category: string
  city: string
  province: string
  registrationNumber: string
  tradingName: string
}): string[] {
  const issues: string[] = []

  if (fields.tradingName.length > MAX_LENGTH.tradingName) {
    issues.push(`Keep the trading name under ${MAX_LENGTH.tradingName} characters.`)
  }
  if (fields.registrationNumber.length > MAX_LENGTH.registrationNumber) {
    issues.push(`Keep the registration number under ${MAX_LENGTH.registrationNumber} characters.`)
  }
  if (fields.category.length > MAX_LENGTH.category) {
    issues.push(`Keep the category under ${MAX_LENGTH.category} characters.`)
  }
  if (fields.city.length > MAX_LENGTH.city) {
    issues.push(`Keep the city under ${MAX_LENGTH.city} characters.`)
  }
  if (fields.province.length > MAX_LENGTH.province) {
    issues.push(`Keep the province under ${MAX_LENGTH.province} characters.`)
  }

  return issues
}

function trimmed(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function boundedText(value: string | undefined, maximum: number): string | undefined {
  const text = trimmed(value)
  return text ? text.slice(0, maximum) : undefined
}

function containsMarkup(value: string): boolean {
  return /[<>]/.test(value)
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function isApplicationStatus(value: unknown): value is OrganizationApplicationStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

function normalizeApplicationStatus(value: string): OrganizationApplicationStatus {
  return isApplicationStatus(value) ? value : 'pending'
}

function rowToApplication(row: ApplicationRow): OrganizationApplication {
  const planId = row.member_plan_id ?? undefined
  const planStatus = row.member_plan_status ?? undefined

  return {
    accountId: row.account_id,
    category: row.category ?? undefined,
    city: row.city ?? undefined,
    contactEmail: row.contact_email,
    contactName: row.contact_name,
    contactPhone: row.contact_phone ?? undefined,
    createdAt: row.created_at,
    description: row.description ?? '',
    id: row.id,
    organisationName: row.organisation_name,
    province: row.province ?? undefined,
    registrationNumber: row.registration_number ?? undefined,
    reviewNote: row.review_note ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    status: normalizeApplicationStatus(row.status),
    planId,
    planStatus,
    businessSubscriptionActive: planId === 'organization' && planStatus === 'active',
    tradingName: row.trading_name ?? undefined,
    updatedAt: row.updated_at,
    websiteUrl: row.website_url ?? undefined,
  }
}

function rowToOrganization(row: OrganizationRow): Organization {
  return {
    accountId: row.account_id,
    applicationId: row.application_id ?? undefined,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status === 'suspended' ? 'suspended' : 'active',
    updatedAt: row.updated_at,
  }
}
