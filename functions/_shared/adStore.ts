// Advertising data access. Everything an ad goes through — submit, admin
// review, once-off PayFast payment, going live, and the public live feed —
// lives here, guarded like every other store so an unbound D1 degrades to a
// safe empty result rather than a 500.

import {
  clampReach,
  computeAdPriceCents,
  isValidAdPlacement,
  isValidAdProvince,
  type AdPlacement,
} from '../../src/services/adPricing'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

export type AdStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'expired'

export interface AdSubmission {
  id: string
  accountId: string
  title: string
  bodyText: string
  targetUrl: string
  imageUrl?: string
  placement: AdPlacement
  reach: number
  province?: string
  amountCents: number
  status: AdStatus
  reviewNote?: string
  reviewedAt?: string
  paidAt?: string
  expiresAt?: string
  impressions: number
  createdAt: string
  updatedAt: string
}

/// A paid, live ad as the public feed exposes it — no account or billing detail.
export interface PublicAd {
  id: string
  title: string
  bodyText: string
  targetUrl: string
  imageUrl?: string
  placement: AdPlacement
  province?: string
}

export interface AdInput {
  title: string
  bodyText: string
  targetUrl: string
  imageUrl?: string
  placement: string
  reach: number
  province?: string
}

interface AdRow {
  id: string
  account_id: string
  title: string
  body_text: string
  target_url: string
  image_url: string | null
  placement: string
  reach: number
  province: string | null
  amount_cents: number
  status: string
  review_note: string | null
  reviewed_at: string | null
  paid_at: string | null
  expires_at: string | null
  impressions: number
  created_at: string
  updated_at: string
}

const COLUMNS =
  'id, account_id, title, body_text, target_url, image_url, placement, reach, province, ' +
  'amount_cents, status, review_note, reviewed_at, paid_at, expires_at, impressions, created_at, updated_at'

const MAX_TITLE = 80
const MAX_BODY = 240
// A paid ad runs for 30 days from the moment payment completes.
const AD_RUN_DAYS = 30

export async function submitAd(
  env: TrolleyScoutEnv,
  accountId: string,
  input: AdInput,
): Promise<{ ad?: AdSubmission; issues?: string[] }> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { issues: ['Advertising is not available right now.'] }
  }

  const title = (input.title ?? '').trim()
  const bodyText = (input.bodyText ?? '').trim()
  const targetUrl = (input.targetUrl ?? '').trim()
  const imageUrl = (input.imageUrl ?? '').trim()
  const placement: AdPlacement = isValidAdPlacement(input.placement) ? input.placement : 'feed'
  const reach = clampReach(Number(input.reach))
  const province = input.province && isValidAdProvince(input.province) ? input.province : undefined

  const issues: string[] = []
  if (title.length < 3 || title.length > MAX_TITLE) {
    issues.push(`Give the ad a title between 3 and ${MAX_TITLE} characters.`)
  }
  if (bodyText.length < 3 || bodyText.length > MAX_BODY) {
    issues.push(`Write ad text between 3 and ${MAX_BODY} characters.`)
  }
  if (!isHttpUrl(targetUrl)) {
    issues.push('Enter a valid link (starting with https://) for the ad to open.')
  }
  if (imageUrl && !isHttpUrl(imageUrl)) {
    issues.push('The image link must be a valid https:// URL, or leave it blank.')
  }
  if (input.province && !isValidAdProvince(input.province)) {
    issues.push('Choose a valid province, or leave it blank to reach the whole country.')
  }

  if (issues.length > 0) {
    return { issues }
  }

  const amountCents = computeAdPriceCents({ placement, reach })
  const id = `ad-${crypto.randomUUID()}`
  const now = new Date().toISOString()

  try {
    await env.DB.prepare(
      `INSERT INTO ad_submissions (
        id, account_id, title, body_text, target_url, image_url, placement, reach,
        province, amount_cents, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        id,
        accountId,
        title,
        bodyText,
        targetUrl,
        imageUrl || null,
        placement,
        reach,
        province ?? null,
        amountCents,
        now,
        now,
      )
      .run()
  } catch {
    return { issues: ['Your ad could not be saved. Try again.'] }
  }

  const ad = await getAd(env, id)
  return ad ? { ad } : { issues: ['Your ad could not be loaded after saving.'] }
}

export async function listMemberAds(env: TrolleyScoutEnv, accountId: string): Promise<AdSubmission[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM ad_submissions WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(accountId)
      .all<AdRow>()
    return result.results.map(rowToAd)
  } catch {
    return []
  }
}

export async function listAdsForReview(env: TrolleyScoutEnv): Promise<AdSubmission[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM ad_submissions
        ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 200`,
    ).all<AdRow>()
    return result.results.map(rowToAd)
  } catch {
    return []
  }
}

export async function getAd(env: TrolleyScoutEnv, id: string): Promise<AdSubmission | undefined> {
  if (!hasTrolleyScoutDatabase(env)) {
    return undefined
  }

  try {
    const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM ad_submissions WHERE id = ?`)
      .bind(id)
      .first<AdRow>()
    return row ? rowToAd(row) : undefined
  } catch {
    return undefined
  }
}

export async function reviewAd(
  env: TrolleyScoutEnv,
  adminId: string,
  id: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) {
    return false
  }

  const now = new Date().toISOString()

  try {
    // Only a pending ad can be reviewed, so a second click is a harmless no-op.
    const result = await env.DB.prepare(
      `UPDATE ad_submissions
        SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'`,
    )
      .bind(decision, note?.trim() || null, adminId, now, now, id)
      .run()
    return result.meta.changes > 0
  } catch {
    return false
  }
}

export async function attachAdCheckout(
  env: TrolleyScoutEnv,
  id: string,
  onsiteUuid: string | null,
): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) {
    return
  }

  try {
    await env.DB.prepare('UPDATE ad_submissions SET onsite_uuid = ?, updated_at = ? WHERE id = ?')
      .bind(onsiteUuid, new Date().toISOString(), id)
      .run()
  } catch {
    // Best-effort; the ITN is the authoritative record of payment.
  }
}

export async function listLiveAds(
  env: TrolleyScoutEnv,
  placement: AdPlacement,
  nowIso: string,
  limit = 8,
): Promise<PublicAd[]> {
  if (!hasTrolleyScoutDatabase(env)) {
    return []
  }

  try {
    const result = await env.DB.prepare(
      `SELECT ${COLUMNS} FROM ad_submissions
        WHERE status = 'active' AND placement = ? AND (expires_at IS NULL OR expires_at > ?)
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(placement, nowIso, Math.max(1, Math.min(limit, 20)))
      .all<AdRow>()
    return result.results.map(rowToPublicAd)
  } catch {
    return []
  }
}

// Records an ad's ITN once. Returns false when the event was already claimed
// (duplicate webhook) so activation never runs twice.
export async function claimAdPaymentEvent(
  env: TrolleyScoutEnv,
  input: {
    adId: string
    amountCents: number
    eventId: string
    paymentId: string
    payloadHash: string
    status: string
  },
): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) {
    return false
  }

  try {
    const result = await env.DB.prepare(
      `INSERT INTO ad_payment_events (
        id, provider_event_id, ad_id, payment_id, payment_status, amount_cents, payload_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (provider_event_id) DO NOTHING`,
    )
      .bind(
        `adevt-${crypto.randomUUID()}`,
        input.eventId,
        input.adId,
        input.paymentId,
        input.status,
        input.amountCents,
        input.payloadHash,
        new Date().toISOString(),
      )
      .run()
    return result.meta.changes > 0
  } catch {
    return false
  }
}

export async function activatePaidAd(
  env: TrolleyScoutEnv,
  adId: string,
  paymentId: string,
): Promise<void> {
  if (!hasTrolleyScoutDatabase(env)) {
    return
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + AD_RUN_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    await env.DB.prepare(
      `UPDATE ad_submissions
        SET status = 'active', payment_id = ?, paid_at = ?, expires_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('approved', 'active')`,
    )
      .bind(paymentId, nowIso, expiresAt, nowIso, adId)
      .run()
  } catch {
    // Best-effort; the ITN ledger prevents a retry from double-charging.
  }
}

function rowToAd(row: AdRow): AdSubmission {
  return {
    accountId: row.account_id,
    amountCents: row.amount_cents,
    bodyText: row.body_text,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    impressions: row.impressions,
    paidAt: row.paid_at ?? undefined,
    placement: (row.placement === 'near_me' ? 'near_me' : 'feed') as AdPlacement,
    province: row.province ?? undefined,
    reach: row.reach,
    reviewNote: row.review_note ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    status: normalizeStatus(row.status),
    targetUrl: row.target_url,
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function rowToPublicAd(row: AdRow): PublicAd {
  return {
    bodyText: row.body_text,
    id: row.id,
    imageUrl: row.image_url ?? undefined,
    placement: (row.placement === 'near_me' ? 'near_me' : 'feed') as AdPlacement,
    province: row.province ?? undefined,
    targetUrl: row.target_url,
    title: row.title,
  }
}

function normalizeStatus(value: string): AdStatus {
  return value === 'approved' ||
    value === 'rejected' ||
    value === 'active' ||
    value === 'expired'
    ? value
    : 'pending'
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
