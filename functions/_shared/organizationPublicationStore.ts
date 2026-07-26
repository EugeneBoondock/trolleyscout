import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'
import { getOrganizationForAccount } from './organizationStore'

export type OrganizationPublicationKind = 'deal' | 'special' | 'promotion' | 'post'
export type OrganizationPublicationStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'expired'
  | 'rejected'
  | 'archived'
export type OrganizationPublicationPlacement = 'marketplace' | 'window' | 'both'
export type OrganizationPublicationDecision = 'approved' | 'changes_requested' | 'rejected'
export type OrganizationPublicationEvent = 'impression' | 'open' | 'save' | 'outbound'
export type OrganizationLocationStatus = 'active' | 'closed'

export interface OrganizationPublicationInput {
  kind: OrganizationPublicationKind
  placement: OrganizationPublicationPlacement
  title: string
  bodyText: string
  targetUrl?: string
  imageUrl?: string
  imageAlt?: string
  priceCents?: number
  previousPriceCents?: number
  currencyCode?: string
  offerText?: string
  couponCode?: string
  startsAt?: string
  endsAt?: string
  locationIds?: string[]
  soldOut?: boolean
}

export interface OrganizationPublication extends OrganizationPublicationInput {
  id: string
  organizationId: string
  organizationName: string
  organizationSlug: string
  createdBy: string
  status: OrganizationPublicationStatus
  reviewNote?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface OrganizationLocationInput {
  name: string
  addressLine: string
  city: string
  province?: string
  countryCode: string
  latitude?: number
  longitude?: number
  websiteUrl?: string
  status?: OrganizationLocationStatus
}

export interface OrganizationLocation extends OrganizationLocationInput {
  id: string
  organizationId: string
  status: OrganizationLocationStatus
  createdAt: string
  updatedAt: string
}

export interface OrganizationMetricTotals {
  impressions: number
  opens: number
  saves: number
  outboundVisits: number
}

export interface OrganizationMetricDay extends OrganizationMetricTotals {
  date: string
}

export interface OrganizationMetrics {
  days: OrganizationMetricDay[]
  rangeDays: number
  totals: OrganizationMetricTotals
}

interface PublicationRow {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  created_by: string
  kind: string
  status: string
  placement: string
  title: string
  body_text: string
  target_url: string | null
  image_url: string | null
  image_alt: string | null
  price_cents: number | null
  previous_price_cents: number | null
  currency_code: string | null
  offer_text: string | null
  coupon_code: string | null
  starts_at: string | null
  ends_at: string | null
  sold_out: number
  review_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

interface LocationRow {
  id: string
  organization_id: string
  name: string
  address_line: string
  city: string
  province: string | null
  country_code: string
  latitude: number | null
  longitude: number | null
  website_url: string | null
  status: string
  created_at: string
  updated_at: string
}

interface ValidPublication {
  kind: OrganizationPublicationKind
  placement: OrganizationPublicationPlacement
  title: string
  bodyText: string
  targetUrl?: string
  imageUrl?: string
  imageAlt?: string
  priceCents?: number
  previousPriceCents?: number
  currencyCode?: string
  offerText?: string
  couponCode?: string
  startsAt?: string
  endsAt?: string
  locationIds: string[]
  soldOut: boolean
}

const PUBLICATION_SELECT = `
  publication.id, publication.organization_id, organization.name AS organization_name,
  organization.slug AS organization_slug, publication.created_by, publication.kind,
  publication.status, publication.placement, publication.title, publication.body_text,
  publication.target_url, publication.image_url, publication.image_alt,
  publication.price_cents, publication.previous_price_cents, publication.currency_code,
  publication.offer_text, publication.coupon_code, publication.starts_at,
  publication.ends_at, publication.sold_out, publication.review_note,
  publication.reviewed_at, publication.created_at, publication.updated_at`

const LOCATION_SELECT =
  'id, organization_id, name, address_line, city, province, country_code, latitude, ' +
  'longitude, website_url, status, created_at, updated_at'

const MAX_LIVE_PUBLICATIONS = 25
const MAX_LOCATION_IDS = 100
const REVIEW_QUEUE_LIMIT = 200
const OWNER_LIST_LIMIT = 500

export async function createOrganizationPublication(
  env: TrolleyScoutEnv,
  accountId: string,
  input: OrganizationPublicationInput,
): Promise<{ publication?: OrganizationPublication; issues?: string[] }> {
  const access = await activeOrganization(env, accountId)
  if (!access) return { issues: ['An active organization is required.'] }

  const validated = validatePublicationInput(input)
  if (!validated.value) return { issues: validated.issues }

  const locationIssue = await validateLocationOwnership(
    env,
    access.id,
    validated.value.locationIds,
  )
  if (locationIssue) return { issues: [locationIssue] }

  const id = `org-pub-${crypto.randomUUID()}`
  const now = new Date().toISOString()
  const value = validated.value

  try {
    await env.DB!.prepare(
      `INSERT INTO organization_publications (
        id, organization_id, created_by, kind, status, placement, title, body_text,
        target_url, image_url, image_alt, price_cents, previous_price_cents,
        currency_code, offer_text, coupon_code, starts_at, ends_at, sold_out,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      access.id,
      accountId,
      value.kind,
      value.placement,
      value.title,
      value.bodyText,
      value.targetUrl ?? null,
      value.imageUrl ?? null,
      value.imageAlt ?? null,
      value.priceCents ?? null,
      value.previousPriceCents ?? null,
      value.currencyCode ?? null,
      value.offerText ?? null,
      value.couponCode ?? null,
      value.startsAt ?? null,
      value.endsAt ?? null,
      value.soldOut ? 1 : 0,
      now,
      now,
    ).run()
    await replacePublicationLocations(env, id, value.locationIds)
    await attachPublicationMedia(env, access.id, id, value.imageUrl, value.imageAlt)
  } catch {
    return { issues: ['The publication could not be saved. Try again.'] }
  }

  const publication = await getOrganizationPublication(env, accountId, id)
  return publication
    ? { publication }
    : { issues: ['The publication could not be loaded after saving.'] }
}

export async function updateOrganizationPublication(
  env: TrolleyScoutEnv,
  accountId: string,
  publicationId: string,
  input: OrganizationPublicationInput,
): Promise<{ publication?: OrganizationPublication; issues?: string[] }> {
  const current = await getOrganizationPublication(env, accountId, publicationId)
  if (!current) return { issues: ['That publication was not found.'] }
  if (current.status === 'archived') {
    return { issues: ['Archived publications cannot be edited. Duplicate it instead.'] }
  }

  const validated = validatePublicationInput(input)
  if (!validated.value) return { issues: validated.issues }
  const locationIssue = await validateLocationOwnership(
    env,
    current.organizationId,
    validated.value.locationIds,
  )
  if (locationIssue) return { issues: [locationIssue] }

  const value = validated.value
  const now = new Date().toISOString()
  const nextStatus: OrganizationPublicationStatus = 'draft'

  try {
    await env.DB!.prepare(
      `UPDATE organization_publications
        SET kind = ?, status = ?, placement = ?, title = ?, body_text = ?,
          target_url = ?, image_url = ?, image_alt = ?, price_cents = ?,
          previous_price_cents = ?, currency_code = ?, offer_text = ?,
          coupon_code = ?, starts_at = ?, ends_at = ?, sold_out = ?,
          review_note = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = ?
        WHERE id = ? AND organization_id = ?`,
    ).bind(
      value.kind,
      nextStatus,
      value.placement,
      value.title,
      value.bodyText,
      value.targetUrl ?? null,
      value.imageUrl ?? null,
      value.imageAlt ?? null,
      value.priceCents ?? null,
      value.previousPriceCents ?? null,
      value.currencyCode ?? null,
      value.offerText ?? null,
      value.couponCode ?? null,
      value.startsAt ?? null,
      value.endsAt ?? null,
      value.soldOut ? 1 : 0,
      now,
      publicationId,
      current.organizationId,
    ).run()
    await replacePublicationLocations(env, publicationId, value.locationIds)
    await attachPublicationMedia(
      env,
      current.organizationId,
      publicationId,
      value.imageUrl,
      value.imageAlt,
    )
  } catch {
    return { issues: ['The publication changes could not be saved. Try again.'] }
  }

  return {
    publication: await getOrganizationPublication(env, accountId, publicationId),
  }
}

export async function submitOrganizationPublication(
  env: TrolleyScoutEnv,
  accountId: string,
  publicationId: string,
): Promise<{ publication?: OrganizationPublication; issues?: string[] }> {
  const current = await getOrganizationPublication(env, accountId, publicationId)
  if (!current) return { issues: ['That publication was not found.'] }
  if (!['draft', 'changes_requested', 'rejected'].includes(current.status)) {
    return { publication: current, issues: ['Only a draft can be submitted for review.'] }
  }

  const validated = validatePublicationInput(current)
  if (!validated.value) return { publication: current, issues: validated.issues }

  try {
    await env.DB!.prepare(
      `UPDATE organization_publications
        SET status = 'submitted', review_note = NULL, updated_at = ?
        WHERE id = ? AND organization_id = ?`,
    ).bind(new Date().toISOString(), publicationId, current.organizationId).run()
  } catch {
    return { publication: current, issues: ['The publication could not be submitted. Try again.'] }
  }

  return { publication: await getOrganizationPublication(env, accountId, publicationId) }
}

export async function setOrganizationPublicationAction(
  env: TrolleyScoutEnv,
  accountId: string,
  publicationId: string,
  action: 'archive' | 'pause' | 'resume' | 'sold_out',
  nowIso = new Date().toISOString(),
): Promise<{ publication?: OrganizationPublication; issues?: string[] }> {
  const current = await getOrganizationPublication(env, accountId, publicationId)
  if (!current) return { issues: ['That publication was not found.'] }

  let status: OrganizationPublicationStatus = current.status
  let soldOut = current.soldOut
  if (action === 'archive') status = 'archived'
  if (action === 'pause' && current.status === 'live') status = 'paused'
  if (action === 'resume' && current.status === 'paused') {
    const ended = current.endsAt && Date.parse(current.endsAt) <= Date.parse(nowIso)
    status = ended ? 'expired' : 'live'
  }
  if (action === 'sold_out') soldOut = true

  if (status === current.status && soldOut === current.soldOut) {
    return { publication: current, issues: ['That action is not available for this publication.'] }
  }

  await env.DB!.prepare(
    `UPDATE organization_publications
      SET status = ?, sold_out = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  ).bind(status, soldOut ? 1 : 0, nowIso, publicationId, current.organizationId).run()
  return { publication: await getOrganizationPublication(env, accountId, publicationId) }
}

export async function listOrganizationPublications(
  env: TrolleyScoutEnv,
  accountId: string,
  status?: OrganizationPublicationStatus,
): Promise<OrganizationPublication[]> {
  const access = await activeOrganization(env, accountId)
  if (!access) return []

  try {
    const filter = isPublicationStatus(status) ? status : undefined
    const statement = filter
      ? env.DB!.prepare(
        `SELECT ${PUBLICATION_SELECT}
          FROM organization_publications AS publication
          INNER JOIN organizations AS organization ON organization.id = publication.organization_id
          WHERE publication.organization_id = ? AND publication.status = ?
          ORDER BY publication.updated_at DESC LIMIT ?`,
      ).bind(access.id, filter, OWNER_LIST_LIMIT)
      : env.DB!.prepare(
        `SELECT ${PUBLICATION_SELECT}
          FROM organization_publications AS publication
          INNER JOIN organizations AS organization ON organization.id = publication.organization_id
          WHERE publication.organization_id = ?
          ORDER BY publication.updated_at DESC LIMIT ?`,
      ).bind(access.id, OWNER_LIST_LIMIT)
    const result = await statement.all<PublicationRow>()
    return attachPublicationLocations(env, result.results.map(rowToPublication))
  } catch {
    return []
  }
}

export async function getOrganizationPublication(
  env: TrolleyScoutEnv,
  accountId: string,
  publicationId: string,
): Promise<OrganizationPublication | undefined> {
  const access = await activeOrganization(env, accountId)
  if (!access || !safeId(publicationId)) return undefined

  try {
    const row = await env.DB!.prepare(
      `SELECT ${PUBLICATION_SELECT}
        FROM organization_publications AS publication
        INNER JOIN organizations AS organization ON organization.id = publication.organization_id
        WHERE publication.id = ? AND publication.organization_id = ?`,
    ).bind(publicationId, access.id).first<PublicationRow>()
    if (!row) return undefined
    return (await attachPublicationLocations(env, [rowToPublication(row)]))[0]
  } catch {
    return undefined
  }
}

export async function listOrganizationPublicationsForReview(
  env: TrolleyScoutEnv,
  status: OrganizationPublicationStatus = 'submitted',
): Promise<OrganizationPublication[]> {
  if (!hasTrolleyScoutDatabase(env)) return []
  const safeStatus = isPublicationStatus(status) ? status : 'submitted'
  try {
    const result = await env.DB!.prepare(
      `SELECT ${PUBLICATION_SELECT}
        FROM organization_publications AS publication
        INNER JOIN organizations AS organization ON organization.id = publication.organization_id
        WHERE publication.status = ?
        ORDER BY publication.updated_at ASC LIMIT ?`,
    ).bind(safeStatus, REVIEW_QUEUE_LIMIT).all<PublicationRow>()
    return attachPublicationLocations(env, result.results.map(rowToPublication))
  } catch {
    return []
  }
}

export async function reviewOrganizationPublication(
  env: TrolleyScoutEnv,
  adminAccountId: string,
  publicationId: string,
  decision: OrganizationPublicationDecision,
  note?: string,
  nowIso = new Date().toISOString(),
): Promise<{ publication?: OrganizationPublication; changed: boolean; issues?: string[] }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { changed: false, issues: ['Publication reviews are not available right now.'] }
  }
  if (!safeId(publicationId) || !isPublicationDecision(decision)) {
    return { changed: false, issues: ['Choose an available review decision.'] }
  }

  const admin = await env.DB!.prepare(
    `SELECT role FROM member_accounts WHERE id = ?`,
  ).bind(adminAccountId).first<{ role: string }>()
  if (admin?.role !== 'admin') {
    return { changed: false, issues: ['Admin access is required.'] }
  }

  const current = await getPublicationById(env, publicationId)
  if (!current) return { changed: false, issues: ['That publication was not found.'] }
  if (current.status !== 'submitted') {
    return {
      changed: false,
      publication: current,
      issues: ['That publication is no longer waiting for review.'],
    }
  }

  let nextStatus: OrganizationPublicationStatus
  if (decision === 'changes_requested') {
    nextStatus = 'changes_requested'
  } else if (decision === 'rejected') {
    nextStatus = 'rejected'
  } else {
    if (current.endsAt && Date.parse(current.endsAt) <= Date.parse(nowIso)) {
      return {
        changed: false,
        publication: current,
        issues: ['The publication end time has already passed.'],
      }
    }
    const liveCount = await countLivePublications(env, current.organizationId)
    if (liveCount >= MAX_LIVE_PUBLICATIONS) {
      return {
        changed: false,
        publication: current,
        issues: [`This organization already has ${MAX_LIVE_PUBLICATIONS} active publications.`],
      }
    }
    nextStatus =
      current.startsAt && Date.parse(current.startsAt) > Date.parse(nowIso) ? 'scheduled' : 'live'
  }

  const reviewNote = boundedText(note, 1000)
  try {
    await env.DB!.batch([
      env.DB!.prepare(
        `UPDATE organization_publications
          SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
          WHERE id = ? AND status = 'submitted'`,
      ).bind(nextStatus, reviewNote ?? null, adminAccountId, nowIso, nowIso, publicationId),
      env.DB!.prepare(
        `INSERT INTO organization_publication_reviews (
          id, publication_id, reviewer_account_id, decision, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        `org-review-${crypto.randomUUID()}`,
        publicationId,
        adminAccountId,
        decision,
        reviewNote ?? null,
        nowIso,
      ),
    ])
  } catch {
    return {
      changed: false,
      publication: current,
      issues: ['The review decision could not be saved. Try again.'],
    }
  }

  return {
    changed: true,
    publication: await getPublicationById(env, publicationId),
  }
}

export async function listLiveOrganizationPublications(
  env: TrolleyScoutEnv,
  placement: 'marketplace' | 'window',
  nowIso = new Date().toISOString(),
): Promise<OrganizationPublication[]> {
  if (!hasTrolleyScoutDatabase(env)) return []
  try {
    const result = await env.DB!.prepare(
      `SELECT ${PUBLICATION_SELECT}
        FROM organization_publications AS publication
        INNER JOIN organizations AS organization ON organization.id = publication.organization_id
        WHERE organization.status = 'active'
          AND publication.status IN ('scheduled', 'live')
          AND (publication.placement = ? OR publication.placement = 'both')
          AND (publication.starts_at IS NULL OR publication.starts_at <= ?)
          AND (publication.ends_at IS NULL OR publication.ends_at > ?)
        ORDER BY publication.reviewed_at DESC, publication.created_at DESC
        LIMIT 500`,
    ).bind(placement, nowIso, nowIso).all<PublicationRow>()
    return attachPublicationLocations(env, result.results.map(rowToPublication))
  } catch {
    return []
  }
}

export async function advanceOrganizationPublicationStatuses(
  env: TrolleyScoutEnv,
  nowIso = new Date().toISOString(),
): Promise<number> {
  if (!hasTrolleyScoutDatabase(env)) return 0
  try {
    const expired = await env.DB!.prepare(
      `UPDATE organization_publications
        SET status = 'expired', updated_at = ?
        WHERE status IN ('scheduled', 'live') AND ends_at IS NOT NULL AND ends_at <= ?`,
    ).bind(nowIso, nowIso).run()
    const live = await env.DB!.prepare(
      `UPDATE organization_publications
        SET status = 'live', updated_at = ?
        WHERE status = 'scheduled'
          AND (starts_at IS NULL OR starts_at <= ?)
          AND (ends_at IS NULL OR ends_at > ?)`,
    ).bind(nowIso, nowIso, nowIso).run()
    return Number(expired.meta.changes ?? 0) + Number(live.meta.changes ?? 0)
  } catch {
    return 0
  }
}

export async function createOrganizationLocation(
  env: TrolleyScoutEnv,
  accountId: string,
  input: OrganizationLocationInput,
): Promise<{ location?: OrganizationLocation; issues?: string[] }> {
  const access = await activeOrganization(env, accountId)
  if (!access) return { issues: ['An active organization is required.'] }
  const validated = validateLocationInput(input)
  if (!validated.value) return { issues: validated.issues }

  const id = `org-location-${crypto.randomUUID()}`
  const now = new Date().toISOString()
  const value = validated.value
  try {
    await env.DB!.prepare(
      `INSERT INTO organization_locations (
        id, organization_id, name, address_line, city, province, country_code,
        latitude, longitude, website_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      access.id,
      value.name,
      value.addressLine,
      value.city,
      value.province ?? null,
      value.countryCode,
      value.latitude ?? null,
      value.longitude ?? null,
      value.websiteUrl ?? null,
      value.status,
      now,
      now,
    ).run()
  } catch {
    return { issues: ['The location could not be saved. Try again.'] }
  }
  return { location: await getOrganizationLocation(env, access.id, id) }
}

export async function updateOrganizationLocation(
  env: TrolleyScoutEnv,
  accountId: string,
  locationId: string,
  input: OrganizationLocationInput,
): Promise<{ location?: OrganizationLocation; issues?: string[] }> {
  const access = await activeOrganization(env, accountId)
  if (!access) return { issues: ['An active organization is required.'] }
  const current = await getOrganizationLocation(env, access.id, locationId)
  if (!current) return { issues: ['That location was not found.'] }
  const validated = validateLocationInput(input)
  if (!validated.value) return { issues: validated.issues }
  const value = validated.value

  await env.DB!.prepare(
    `UPDATE organization_locations
      SET name = ?, address_line = ?, city = ?, province = ?, country_code = ?,
        latitude = ?, longitude = ?, website_url = ?, status = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?`,
  ).bind(
    value.name,
    value.addressLine,
    value.city,
    value.province ?? null,
    value.countryCode,
    value.latitude ?? null,
    value.longitude ?? null,
    value.websiteUrl ?? null,
    value.status,
    new Date().toISOString(),
    locationId,
    access.id,
  ).run()
  return { location: await getOrganizationLocation(env, access.id, locationId) }
}

export async function listOrganizationLocations(
  env: TrolleyScoutEnv,
  accountId: string,
): Promise<OrganizationLocation[]> {
  const access = await activeOrganization(env, accountId)
  if (!access) return []
  try {
    const result = await env.DB!.prepare(
      `SELECT ${LOCATION_SELECT} FROM organization_locations
        WHERE organization_id = ? ORDER BY status, name`,
    ).bind(access.id).all<LocationRow>()
    return result.results.map(rowToLocation)
  } catch {
    return []
  }
}

export async function recordOrganizationPublicationEvent(
  env: TrolleyScoutEnv,
  publicationId: string,
  event: OrganizationPublicationEvent,
  nowIso = new Date().toISOString(),
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env) || !safeId(publicationId) || !isPublicationEvent(event)) {
    return false
  }
  const visible = await env.DB!.prepare(
    `SELECT id FROM organization_publications
      WHERE id = ? AND status IN ('scheduled', 'live')
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at > ?)`,
  ).bind(publicationId, nowIso, nowIso).first<{ id: string }>()
  if (!visible) return false

  const column = {
    impression: 'impressions',
    open: 'opens',
    save: 'saves',
    outbound: 'outbound_visits',
  }[event]
  const date = nowIso.slice(0, 10)
  try {
    await env.DB!.prepare(
      `INSERT INTO organization_publication_events_daily (
        publication_id, event_date, ${column}
      ) VALUES (?, ?, 1)
      ON CONFLICT(publication_id, event_date)
      DO UPDATE SET ${column} = ${column} + 1`,
    ).bind(publicationId, date).run()
    return true
  } catch {
    return false
  }
}

export async function readOrganizationMetrics(
  env: TrolleyScoutEnv,
  accountId: string,
  rangeDays = 30,
  nowIso = new Date().toISOString(),
): Promise<OrganizationMetrics> {
  const access = await activeOrganization(env, accountId)
  const safeRange = rangeDays === 7 || rangeDays === 90 ? rangeDays : 30
  if (!access) return emptyMetrics(safeRange)
  const start = new Date(nowIso)
  start.setUTCDate(start.getUTCDate() - safeRange + 1)
  const startDate = start.toISOString().slice(0, 10)
  try {
    const result = await env.DB!.prepare(
      `SELECT event.event_date, SUM(event.impressions) AS impressions,
          SUM(event.opens) AS opens, SUM(event.saves) AS saves,
          SUM(event.outbound_visits) AS outbound_visits
        FROM organization_publication_events_daily AS event
        INNER JOIN organization_publications AS publication
          ON publication.id = event.publication_id
        WHERE publication.organization_id = ? AND event.event_date >= ?
        GROUP BY event.event_date ORDER BY event.event_date`,
    ).bind(access.id, startDate).all<{
      event_date: string
      impressions: number
      opens: number
      saves: number
      outbound_visits: number
    }>()
    const days = result.results.map((row) => ({
      date: row.event_date,
      impressions: Number(row.impressions ?? 0),
      opens: Number(row.opens ?? 0),
      saves: Number(row.saves ?? 0),
      outboundVisits: Number(row.outbound_visits ?? 0),
    }))
    return {
      days,
      rangeDays: safeRange,
      totals: days.reduce<OrganizationMetricTotals>(
        (total, day) => ({
          impressions: total.impressions + day.impressions,
          opens: total.opens + day.opens,
          saves: total.saves + day.saves,
          outboundVisits: total.outboundVisits + day.outboundVisits,
        }),
        { impressions: 0, opens: 0, saves: 0, outboundVisits: 0 },
      ),
    }
  } catch {
    return emptyMetrics(safeRange)
  }
}

function validatePublicationInput(
  input: OrganizationPublicationInput,
): { issues: string[]; value?: ValidPublication } {
  const kind = input.kind
  const placement = input.placement
  const title = trimmed(input.title)
  const bodyText = trimmed(input.bodyText)
  const targetUrl = trimmed(input.targetUrl)
  const imageUrl = trimmed(input.imageUrl)
  const imageAlt = trimmed(input.imageAlt)
  const currencyCode = trimmed(input.currencyCode).toUpperCase()
  const offerText = trimmed(input.offerText)
  const couponCode = trimmed(input.couponCode)
  const startsAt = normalizeDate(input.startsAt)
  const endsAt = normalizeDate(input.endsAt)
  const locationIds = uniqueIds(input.locationIds)
  const priceCents = positiveInteger(input.priceCents)
  const previousPriceCents = positiveInteger(input.previousPriceCents)
  const issues: string[] = []

  if (!isPublicationKind(kind)) issues.push('Choose a publication type.')
  if (!isPublicationPlacement(placement)) issues.push('Choose where this publication should appear.')
  if (title.length < 3 || title.length > 120) {
    issues.push('Keep the title between 3 and 120 characters.')
  }
  if (bodyText.length < 10 || bodyText.length > 2000) {
    issues.push('Keep the description between 10 and 2,000 characters.')
  }
  if ([title, bodyText, offerText, couponCode, imageAlt].some(containsMarkup)) {
    issues.push('Remove < and > from publication text.')
  }
  if (kind === 'post' && placement !== 'window') {
    issues.push('Posts can appear in Window Shopping only.')
  }
  if (kind !== 'post' && !isHttpsUrl(targetUrl)) {
    issues.push('Use a valid HTTPS destination link.')
  } else if (targetUrl && !isHttpsUrl(targetUrl)) {
    issues.push('Use a valid HTTPS destination link.')
  }
  if (kind !== 'post' && (!isHttpsUrl(imageUrl) || imageAlt.length < 3)) {
    issues.push('Add a cover image and alternative text.')
  } else if (imageUrl && !isHttpsUrl(imageUrl)) {
    issues.push('Use a valid HTTPS image link.')
  }
  if (kind === 'deal' && !priceCents) {
    issues.push('Add a current price greater than zero.')
  }
  if ((kind === 'special' || kind === 'promotion') && !priceCents && offerText.length < 3) {
    issues.push('Add a price or describe the offer.')
  }
  if (previousPriceCents && priceCents && previousPriceCents <= priceCents) {
    issues.push('The previous price must be higher than the current price.')
  }
  if (priceCents && !/^[A-Z]{3}$/.test(currencyCode)) {
    issues.push('Choose a three-letter currency code.')
  }
  if (input.startsAt && !startsAt) issues.push('Use a valid start date and time.')
  if (input.endsAt && !endsAt) issues.push('Use a valid end date and time.')
  if (kind !== 'post' && !endsAt) {
    issues.push('Add an end date for this commercial publication.')
  }
  if (startsAt && endsAt && Date.parse(startsAt) >= Date.parse(endsAt)) {
    issues.push('The end time must be after the start time.')
  }
  if (locationIds.length > MAX_LOCATION_IDS) {
    issues.push(`Choose no more than ${MAX_LOCATION_IDS} locations.`)
  }
  if (offerText.length > 240) issues.push('Keep the offer summary under 240 characters.')
  if (couponCode.length > 80) issues.push('Keep the coupon code under 80 characters.')
  if (imageAlt.length > 240) issues.push('Keep the image description under 240 characters.')

  if (issues.length > 0 || !isPublicationKind(kind) || !isPublicationPlacement(placement)) {
    return { issues }
  }
  return {
    issues,
    value: {
      bodyText,
      couponCode: couponCode || undefined,
      currencyCode: priceCents ? currencyCode : undefined,
      endsAt,
      imageAlt: imageAlt || undefined,
      imageUrl: imageUrl || undefined,
      kind,
      locationIds,
      offerText: offerText || undefined,
      placement,
      previousPriceCents,
      priceCents,
      soldOut: Boolean(input.soldOut),
      startsAt,
      targetUrl: targetUrl || undefined,
      title,
    },
  }
}

function validateLocationInput(
  input: OrganizationLocationInput,
): { issues: string[]; value?: OrganizationLocationInput & { status: OrganizationLocationStatus } } {
  const name = trimmed(input.name)
  const addressLine = trimmed(input.addressLine)
  const city = trimmed(input.city)
  const province = trimmed(input.province)
  const countryCode = trimmed(input.countryCode).toUpperCase()
  const websiteUrl = trimmed(input.websiteUrl)
  const status = input.status === 'closed' ? 'closed' : 'active'
  const latitude = finiteCoordinate(input.latitude, -90, 90)
  const longitude = finiteCoordinate(input.longitude, -180, 180)
  const issues: string[] = []

  if (name.length < 2 || name.length > 120) issues.push('Enter a location name.')
  if (addressLine.length < 4 || addressLine.length > 240) issues.push('Enter a street address.')
  if (city.length < 2 || city.length > 120) issues.push('Enter a city or town.')
  if (!/^[A-Z]{2}$/.test(countryCode)) issues.push('Choose a two-letter country code.')
  if (websiteUrl && !isHttpsUrl(websiteUrl)) issues.push('Use a valid HTTPS store link.')
  if (input.latitude !== undefined && latitude === undefined) issues.push('Enter a valid latitude.')
  if (input.longitude !== undefined && longitude === undefined) issues.push('Enter a valid longitude.')
  if ([name, addressLine, city, province].some(containsMarkup)) {
    issues.push('Remove < and > from location details.')
  }
  if (issues.length > 0) return { issues }
  return {
    issues,
    value: {
      addressLine,
      city,
      countryCode,
      latitude,
      longitude,
      name,
      province: province || undefined,
      status,
      websiteUrl: websiteUrl || undefined,
    },
  }
}

async function activeOrganization(env: TrolleyScoutEnv, accountId: string) {
  if (!hasTrolleyScoutDatabase(env) || !safeId(accountId)) return undefined
  return getOrganizationForAccount(env, accountId)
}

async function getPublicationById(
  env: TrolleyScoutEnv,
  publicationId: string,
): Promise<OrganizationPublication | undefined> {
  try {
    const row = await env.DB!.prepare(
      `SELECT ${PUBLICATION_SELECT}
        FROM organization_publications AS publication
        INNER JOIN organizations AS organization ON organization.id = publication.organization_id
        WHERE publication.id = ?`,
    ).bind(publicationId).first<PublicationRow>()
    if (!row) return undefined
    return (await attachPublicationLocations(env, [rowToPublication(row)]))[0]
  } catch {
    return undefined
  }
}

async function getOrganizationLocation(
  env: TrolleyScoutEnv,
  organizationId: string,
  locationId: string,
): Promise<OrganizationLocation | undefined> {
  if (!safeId(locationId)) return undefined
  const row = await env.DB!.prepare(
    `SELECT ${LOCATION_SELECT} FROM organization_locations
      WHERE id = ? AND organization_id = ?`,
  ).bind(locationId, organizationId).first<LocationRow>()
  return row ? rowToLocation(row) : undefined
}

async function validateLocationOwnership(
  env: TrolleyScoutEnv,
  organizationId: string,
  locationIds: string[],
): Promise<string | undefined> {
  if (locationIds.length === 0) return undefined
  const placeholders = locationIds.map(() => '?').join(', ')
  const row = await env.DB!.prepare(
    `SELECT COUNT(*) AS total FROM organization_locations
      WHERE organization_id = ? AND id IN (${placeholders}) AND status = 'active'`,
  ).bind(organizationId, ...locationIds).first<{ total: number }>()
  return Number(row?.total ?? 0) === locationIds.length
    ? undefined
    : 'One or more selected locations are not available.'
}

async function replacePublicationLocations(
  env: TrolleyScoutEnv,
  publicationId: string,
  locationIds: string[],
): Promise<void> {
  const statements = [
    env.DB!.prepare(
      'DELETE FROM organization_publication_locations WHERE publication_id = ?',
    ).bind(publicationId),
    ...locationIds.map((locationId) =>
      env.DB!.prepare(
        `INSERT INTO organization_publication_locations (publication_id, location_id)
          VALUES (?, ?)`,
      ).bind(publicationId, locationId),
    ),
  ]
  await env.DB!.batch(statements)
}

async function attachPublicationMedia(
  env: TrolleyScoutEnv,
  organizationId: string,
  publicationId: string,
  mediaUrl?: string,
  altText?: string,
): Promise<void> {
  if (!mediaUrl) return
  try {
    await env.DB!.prepare(
      `UPDATE organization_publication_media
        SET publication_id = ?, alt_text = ?
        WHERE organization_id = ? AND media_url = ?
          AND (publication_id IS NULL OR publication_id = ?)`,
    ).bind(
      publicationId,
      altText ?? '',
      organizationId,
      mediaUrl,
      publicationId,
    ).run()
  } catch {
    // A secure external image URL does not need a local media row.
  }
}

async function attachPublicationLocations(
  env: TrolleyScoutEnv,
  publications: OrganizationPublication[],
): Promise<OrganizationPublication[]> {
  if (publications.length === 0) return publications
  const placeholders = publications.map(() => '?').join(', ')
  const result = await env.DB!.prepare(
    `SELECT publication_id, location_id FROM organization_publication_locations
      WHERE publication_id IN (${placeholders}) ORDER BY location_id`,
  ).bind(...publications.map((publication) => publication.id))
    .all<{ publication_id: string; location_id: string }>()
  const byPublication = new Map<string, string[]>()
  for (const row of result.results) {
    const ids = byPublication.get(row.publication_id) ?? []
    ids.push(row.location_id)
    byPublication.set(row.publication_id, ids)
  }
  return publications.map((publication) => ({
    ...publication,
    locationIds: byPublication.get(publication.id) ?? [],
  }))
}

async function countLivePublications(
  env: TrolleyScoutEnv,
  organizationId: string,
): Promise<number> {
  const row = await env.DB!.prepare(
    `SELECT COUNT(*) AS total FROM organization_publications
      WHERE organization_id = ? AND status IN ('scheduled', 'live')`,
  ).bind(organizationId).first<{ total: number }>()
  return Number(row?.total ?? 0)
}

function rowToPublication(row: PublicationRow): OrganizationPublication {
  return {
    bodyText: row.body_text,
    couponCode: row.coupon_code ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
    currencyCode: row.currency_code ?? undefined,
    endsAt: row.ends_at ?? undefined,
    id: row.id,
    imageAlt: row.image_alt ?? undefined,
    imageUrl: row.image_url ?? undefined,
    kind: normalizePublicationKind(row.kind),
    locationIds: [],
    offerText: row.offer_text ?? undefined,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug,
    placement: normalizePublicationPlacement(row.placement),
    previousPriceCents: row.previous_price_cents ?? undefined,
    priceCents: row.price_cents ?? undefined,
    reviewNote: row.review_note ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    soldOut: row.sold_out === 1,
    startsAt: row.starts_at ?? undefined,
    status: normalizePublicationStatus(row.status),
    targetUrl: row.target_url ?? undefined,
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function rowToLocation(row: LocationRow): OrganizationLocation {
  return {
    addressLine: row.address_line,
    city: row.city,
    countryCode: row.country_code,
    createdAt: row.created_at,
    id: row.id,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    name: row.name,
    organizationId: row.organization_id,
    province: row.province ?? undefined,
    status: row.status === 'closed' ? 'closed' : 'active',
    updatedAt: row.updated_at,
    websiteUrl: row.website_url ?? undefined,
  }
}

function isPublicationKind(value: unknown): value is OrganizationPublicationKind {
  return value === 'deal' || value === 'special' || value === 'promotion' || value === 'post'
}

export function isPublicationStatus(value: unknown): value is OrganizationPublicationStatus {
  return value === 'draft' || value === 'submitted' || value === 'changes_requested' ||
    value === 'scheduled' || value === 'live' || value === 'paused' || value === 'expired' ||
    value === 'rejected' || value === 'archived'
}

function isPublicationPlacement(value: unknown): value is OrganizationPublicationPlacement {
  return value === 'marketplace' || value === 'window' || value === 'both'
}

function isPublicationDecision(value: unknown): value is OrganizationPublicationDecision {
  return value === 'approved' || value === 'changes_requested' || value === 'rejected'
}

export function isPublicationEvent(value: unknown): value is OrganizationPublicationEvent {
  return value === 'impression' || value === 'open' || value === 'save' || value === 'outbound'
}

function normalizePublicationKind(value: string): OrganizationPublicationKind {
  return isPublicationKind(value) ? value : 'post'
}

function normalizePublicationStatus(value: string): OrganizationPublicationStatus {
  return isPublicationStatus(value) ? value : 'draft'
}

function normalizePublicationPlacement(value: string): OrganizationPublicationPlacement {
  return isPublicationPlacement(value) ? value : 'window'
}

function uniqueIds(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map(trimmed).filter(safeId))].slice(0, MAX_LOCATION_IDS + 1)
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined
}

function finiteCoordinate(
  value: number | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined
}

function normalizeDate(value: string | undefined): string | undefined {
  const text = trimmed(value)
  if (!text) return undefined
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function containsMarkup(value: string): boolean {
  return /[<>]/.test(value)
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function boundedText(value: string | undefined, maximum: number): string | undefined {
  const text = trimmed(value)
  return text ? text.slice(0, maximum) : undefined
}

function emptyMetrics(rangeDays: number): OrganizationMetrics {
  return {
    days: [],
    rangeDays,
    totals: { impressions: 0, opens: 0, saves: 0, outboundVisits: 0 },
  }
}
