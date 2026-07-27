import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

export type BusinessAdminOrganizationStatus = 'active' | 'suspended'

export interface BusinessAdminTotals {
  activeBusinesses: number
  businesses: number
  campaigns: number
  completedCampaigns: number
  liveCampaigns: number
  paidCents: number
  paidTransactions: number
  pendingApplications: number
  pendingModeration: number
  suspendedBusinesses: number
}

export interface BusinessAdminOrganization {
  activeCampaigns: number
  campaigns: number
  category?: string
  completedCampaigns: number
  createdAt: string
  id: string
  impressions: number
  lastCampaignAt?: string
  locations: number
  name: string
  opens: number
  ownerName: string
  paidCents: number
  paidTransactions: number
  planId: string
  planStatus: string
  saves: number
  slug: string
  status: BusinessAdminOrganizationStatus
  updatedAt: string
  visits: number
}

export interface BusinessAdminCampaign {
  createdAt: string
  endsAt?: string
  id: string
  imageAlt?: string
  imageUrl?: string
  impressions: number
  kind: string
  opens: number
  organizationId: string
  organizationName: string
  placement: string
  saves: number
  soldOut: boolean
  startsAt?: string
  status: string
  targetUrl?: string
  title: string
  updatedAt: string
  visits: number
}

export interface BusinessAdminPayment {
  amountCents: number
  businessId: string
  businessName: string
  createdAt: string
  id: string
  paymentId: string
  planId: string
  status: string
}

export interface BusinessAdminOverview {
  businesses: BusinessAdminOrganization[]
  campaigns: BusinessAdminCampaign[]
  generatedAt: string
  payments: BusinessAdminPayment[]
  totals: BusinessAdminTotals
}

interface TotalsRow {
  active_businesses: number
  businesses: number
  campaigns: number
  completed_campaigns: number
  live_campaigns: number
  paid_cents: number
  paid_transactions: number
  pending_applications: number
  pending_moderation: number
  suspended_businesses: number
}

interface BusinessRow {
  active_campaigns: number
  campaigns: number
  category: string | null
  completed_campaigns: number
  created_at: string
  id: string
  impressions: number
  last_campaign_at: string | null
  locations: number
  name: string
  opens: number
  owner_name: string
  paid_cents: number
  paid_transactions: number
  plan_id: string
  plan_status: string
  saves: number
  slug: string
  status: string
  updated_at: string
  visits: number
}

interface CampaignRow {
  created_at: string
  ends_at: string | null
  id: string
  image_alt: string | null
  image_url: string | null
  impressions: number
  kind: string
  opens: number
  organization_id: string
  organization_name: string
  placement: string
  saves: number
  sold_out: number
  starts_at: string | null
  status: string
  target_url: string | null
  title: string
  updated_at: string
  visits: number
}

interface PaymentRow {
  amount_cents: number
  business_id: string
  business_name: string
  created_at: string
  id: string
  payment_id: string
  plan_id: string
  status: string
}

const BUSINESS_LIMIT = 250
const CAMPAIGN_LIMIT = 400
const PAYMENT_LIMIT = 250

const emptyTotals: BusinessAdminTotals = {
  activeBusinesses: 0,
  businesses: 0,
  campaigns: 0,
  completedCampaigns: 0,
  liveCampaigns: 0,
  paidCents: 0,
  paidTransactions: 0,
  pendingApplications: 0,
  pendingModeration: 0,
  suspendedBusinesses: 0,
}

export async function loadBusinessAdminOverview(
  env: TrolleyScoutEnv,
): Promise<BusinessAdminOverview> {
  const generatedAt = new Date().toISOString()
  if (!hasTrolleyScoutDatabase(env)) {
    return { businesses: [], campaigns: [], generatedAt, payments: [], totals: emptyTotals }
  }

  try {
    const [totals, businesses, campaigns, payments] = await Promise.all([
      env.DB.prepare(
        `SELECT
          (SELECT COUNT(*) FROM organizations) AS businesses,
          (SELECT COUNT(*) FROM organizations WHERE status = 'active') AS active_businesses,
          (SELECT COUNT(*) FROM organizations WHERE status = 'suspended') AS suspended_businesses,
          (SELECT COUNT(*) FROM organization_applications WHERE status = 'pending')
            AS pending_applications,
          (SELECT COUNT(*) FROM organization_publications) AS campaigns,
          (SELECT COUNT(*) FROM organization_publications WHERE status IN ('live', 'scheduled'))
            AS live_campaigns,
          (SELECT COUNT(*) FROM organization_publications WHERE status IN ('expired', 'archived'))
            AS completed_campaigns,
          (SELECT COUNT(*) FROM organization_publications WHERE status = 'submitted')
            AS pending_moderation,
          (SELECT COUNT(*) FROM billing_events AS event
            INNER JOIN billing_attempts AS attempt ON attempt.id = event.attempt_id
            INNER JOIN organizations AS organization
              ON organization.account_id = attempt.account_id
            WHERE UPPER(event.payment_status) = 'COMPLETE') AS paid_transactions,
          (SELECT COALESCE(SUM(event.amount_cents), 0) FROM billing_events AS event
            INNER JOIN billing_attempts AS attempt ON attempt.id = event.attempt_id
            INNER JOIN organizations AS organization
              ON organization.account_id = attempt.account_id
            WHERE UPPER(event.payment_status) = 'COMPLETE') AS paid_cents`,
      ).first<TotalsRow>(),
      env.DB.prepare(
        `SELECT
          organization.id, organization.name, organization.slug, organization.status,
          organization.created_at, organization.updated_at,
          account.display_name AS owner_name, account.plan_id, account.plan_status,
          application.category,
          (SELECT COUNT(*) FROM organization_locations AS location
            WHERE location.organization_id = organization.id) AS locations,
          (SELECT COUNT(*) FROM organization_publications AS publication
            WHERE publication.organization_id = organization.id) AS campaigns,
          (SELECT COUNT(*) FROM organization_publications AS publication
            WHERE publication.organization_id = organization.id
              AND publication.status IN ('live', 'scheduled')) AS active_campaigns,
          (SELECT COUNT(*) FROM organization_publications AS publication
            WHERE publication.organization_id = organization.id
              AND publication.status IN ('expired', 'archived')) AS completed_campaigns,
          (SELECT MAX(publication.updated_at) FROM organization_publications AS publication
            WHERE publication.organization_id = organization.id) AS last_campaign_at,
          (SELECT COALESCE(SUM(event.impressions), 0)
            FROM organization_publication_events_daily AS event
            INNER JOIN organization_publications AS publication
              ON publication.id = event.publication_id
            WHERE publication.organization_id = organization.id) AS impressions,
          (SELECT COALESCE(SUM(event.opens), 0)
            FROM organization_publication_events_daily AS event
            INNER JOIN organization_publications AS publication
              ON publication.id = event.publication_id
            WHERE publication.organization_id = organization.id) AS opens,
          (SELECT COALESCE(SUM(event.saves), 0)
            FROM organization_publication_events_daily AS event
            INNER JOIN organization_publications AS publication
              ON publication.id = event.publication_id
            WHERE publication.organization_id = organization.id) AS saves,
          (SELECT COALESCE(SUM(event.outbound_visits), 0)
            FROM organization_publication_events_daily AS event
            INNER JOIN organization_publications AS publication
              ON publication.id = event.publication_id
            WHERE publication.organization_id = organization.id) AS visits,
          (SELECT COUNT(*) FROM billing_events AS event
            INNER JOIN billing_attempts AS attempt ON attempt.id = event.attempt_id
            WHERE attempt.account_id = organization.account_id
              AND UPPER(event.payment_status) = 'COMPLETE') AS paid_transactions,
          (SELECT COALESCE(SUM(event.amount_cents), 0) FROM billing_events AS event
            INNER JOIN billing_attempts AS attempt ON attempt.id = event.attempt_id
            WHERE attempt.account_id = organization.account_id
              AND UPPER(event.payment_status) = 'COMPLETE') AS paid_cents
        FROM organizations AS organization
        INNER JOIN member_accounts AS account ON account.id = organization.account_id
        LEFT JOIN organization_applications AS application
          ON application.id = organization.application_id
        ORDER BY organization.updated_at DESC
        LIMIT ?`,
      ).bind(BUSINESS_LIMIT).all<BusinessRow>(),
      env.DB.prepare(
        `SELECT
          publication.id, publication.organization_id,
          organization.name AS organization_name, publication.kind, publication.status,
          publication.placement, publication.title, publication.target_url,
          publication.image_url, publication.image_alt, publication.starts_at,
          publication.ends_at, publication.sold_out, publication.created_at,
          publication.updated_at, COALESCE(SUM(event.impressions), 0) AS impressions,
          COALESCE(SUM(event.opens), 0) AS opens,
          COALESCE(SUM(event.saves), 0) AS saves,
          COALESCE(SUM(event.outbound_visits), 0) AS visits
        FROM organization_publications AS publication
        INNER JOIN organizations AS organization
          ON organization.id = publication.organization_id
        LEFT JOIN organization_publication_events_daily AS event
          ON event.publication_id = publication.id
        GROUP BY publication.id
        ORDER BY publication.updated_at DESC
        LIMIT ?`,
      ).bind(CAMPAIGN_LIMIT).all<CampaignRow>(),
      env.DB.prepare(
        `SELECT
          event.id, event.payment_id, event.payment_status AS status,
          event.amount_cents, event.created_at, attempt.plan_id,
          organization.id AS business_id, organization.name AS business_name
        FROM billing_events AS event
        INNER JOIN billing_attempts AS attempt ON attempt.id = event.attempt_id
        INNER JOIN organizations AS organization
          ON organization.account_id = attempt.account_id
        WHERE UPPER(event.payment_status) = 'COMPLETE'
        ORDER BY event.created_at DESC
        LIMIT ?`,
      ).bind(PAYMENT_LIMIT).all<PaymentRow>(),
    ])

    return {
      businesses: businesses.results.map(toBusiness),
      campaigns: campaigns.results.map(toCampaign),
      generatedAt,
      payments: payments.results.map(toPayment),
      totals: totals ? toTotals(totals) : emptyTotals,
    }
  } catch {
    return { businesses: [], campaigns: [], generatedAt, payments: [], totals: emptyTotals }
  }
}

export async function setBusinessAdminStatus(
  env: TrolleyScoutEnv,
  businessId: string,
  status: BusinessAdminOrganizationStatus,
): Promise<{ changed: boolean; issues?: string[] }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { changed: false, issues: ['Business moderation is unavailable right now.'] }
  }
  if (
    !businessId ||
    businessId.length > 200 ||
    (status !== 'active' && status !== 'suspended')
  ) {
    return { changed: false, issues: ['Choose a business and an available status.'] }
  }

  try {
    const result = await env.DB.prepare(
      `UPDATE organizations
        SET status = ?, updated_at = ?
        WHERE id = ? AND status <> ?`,
    ).bind(status, new Date().toISOString(), businessId, status).run()
    return { changed: result.meta.changes > 0 }
  } catch {
    return { changed: false, issues: ['The business status could not be changed.'] }
  }
}

function toTotals(row: TotalsRow): BusinessAdminTotals {
  return {
    activeBusinesses: number(row.active_businesses),
    businesses: number(row.businesses),
    campaigns: number(row.campaigns),
    completedCampaigns: number(row.completed_campaigns),
    liveCampaigns: number(row.live_campaigns),
    paidCents: number(row.paid_cents),
    paidTransactions: number(row.paid_transactions),
    pendingApplications: number(row.pending_applications),
    pendingModeration: number(row.pending_moderation),
    suspendedBusinesses: number(row.suspended_businesses),
  }
}

function toBusiness(row: BusinessRow): BusinessAdminOrganization {
  return {
    activeCampaigns: number(row.active_campaigns),
    campaigns: number(row.campaigns),
    category: row.category ?? undefined,
    completedCampaigns: number(row.completed_campaigns),
    createdAt: row.created_at,
    id: row.id,
    impressions: number(row.impressions),
    lastCampaignAt: row.last_campaign_at ?? undefined,
    locations: number(row.locations),
    name: row.name,
    opens: number(row.opens),
    ownerName: row.owner_name,
    paidCents: number(row.paid_cents),
    paidTransactions: number(row.paid_transactions),
    planId: row.plan_id,
    planStatus: row.plan_status,
    saves: number(row.saves),
    slug: row.slug,
    status: row.status === 'suspended' ? 'suspended' : 'active',
    updatedAt: row.updated_at,
    visits: number(row.visits),
  }
}

function toCampaign(row: CampaignRow): BusinessAdminCampaign {
  return {
    createdAt: row.created_at,
    endsAt: row.ends_at ?? undefined,
    id: row.id,
    imageAlt: row.image_alt ?? undefined,
    imageUrl: row.image_url ?? undefined,
    impressions: number(row.impressions),
    kind: row.kind,
    opens: number(row.opens),
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    placement: row.placement,
    saves: number(row.saves),
    soldOut: row.sold_out === 1,
    startsAt: row.starts_at ?? undefined,
    status: row.status,
    targetUrl: row.target_url ?? undefined,
    title: row.title,
    updatedAt: row.updated_at,
    visits: number(row.visits),
  }
}

function toPayment(row: PaymentRow): BusinessAdminPayment {
  return {
    amountCents: number(row.amount_cents),
    businessId: row.business_id,
    businessName: row.business_name,
    createdAt: row.created_at,
    id: row.id,
    paymentId: row.payment_id,
    planId: row.plan_id,
    status: row.status,
  }
}

function number(value: number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
