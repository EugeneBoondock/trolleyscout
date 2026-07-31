/**
 * Licensed voucher feeds from affiliate networks.
 *
 * This is where checkout codes legitimately come from at scale, and it is half
 * of what Honey is built on. The coupon aggregators cannot be scraped for
 * them: they hide the value behind a reveal click that only resolves on their
 * own outbound redirect, and Picodi ships no code in its markup at all.
 *
 * Both networks below need a publisher account. Without credentials this does
 * nothing and says so, rather than half-working — the crowd-sourced codes in
 * voucherCodeStore carry the feature until an account exists.
 */

import type { TrolleyScoutEnv } from './env'
import type { VoucherCodeDraft } from './voucherCodeStore'

const REQUEST_TIMEOUT_MS = 12_000

export interface AffiliateFeedResult {
  /** Why nothing was fetched, when that is the case. */
  message?: string
  network: string
  vouchers: VoucherCodeDraft[]
}

/**
 * Every network that is configured. A network without credentials is reported
 * rather than skipped silently, so the admin console can say what is missing.
 */
export async function fetchAffiliateVoucherFeeds(
  env: TrolleyScoutEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AffiliateFeedResult[]> {
  return [
    await fetchAwinVouchers(env, fetchImpl),
    await fetchAdmitadVouchers(env, fetchImpl),
  ]
}

/**
 * Awin's promotions endpoint. `AWIN_API_TOKEN` is an OAuth2 token from the
 * publisher dashboard and `AWIN_PUBLISHER_ID` the account it belongs to.
 */
export async function fetchAwinVouchers(
  env: TrolleyScoutEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AffiliateFeedResult> {
  const token = env.AWIN_API_TOKEN
  const publisherId = env.AWIN_PUBLISHER_ID
  if (!token || !publisherId) {
    return {
      message: 'Set AWIN_API_TOKEN and AWIN_PUBLISHER_ID to collect Awin codes.',
      network: 'awin',
      vouchers: [],
    }
  }

  try {
    const response = await fetchImpl(
      `https://api.awin.com/publishers/${encodeURIComponent(publisherId)}/promotions/`,
      {
        body: JSON.stringify({ filters: { exclusive: false, type: 'voucher' } }),
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      return { message: `Awin returned HTTP ${response.status}.`, network: 'awin', vouchers: [] }
    }

    const payload = (await response.json()) as unknown
    return { network: 'awin', vouchers: parseAwinPromotions(payload) }
  } catch (error) {
    return { message: describe(error), network: 'awin', vouchers: [] }
  }
}

export function parseAwinPromotions(payload: unknown): VoucherCodeDraft[] {
  const rows = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
  const drafts: VoucherCodeDraft[] = []

  for (const row of rows) {
    if (!isRecord(row)) continue
    const code = text(row.voucher && isRecord(row.voucher) ? row.voucher.code : undefined)
    const advertiser = isRecord(row.advertiser) ? row.advertiser : undefined
    const retailerId = slug(text(advertiser?.name))
    const benefitText = text(row.description) || text(row.title)
    if (!code || !retailerId || !benefitText) continue

    drafts.push({
      benefitText,
      code,
      retailerId,
      source: 'affiliate:awin',
      sourceUrl: text(row.urlTracking) || undefined,
      termsText: text(row.terms) || undefined,
      validTo: text(row.endDate) || undefined,
    })
  }

  return drafts
}

/**
 * Admitad's coupons endpoint. `ADMITAD_ACCESS_TOKEN` is the OAuth2 bearer from
 * their publisher API.
 */
export async function fetchAdmitadVouchers(
  env: TrolleyScoutEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AffiliateFeedResult> {
  const token = env.ADMITAD_ACCESS_TOKEN
  if (!token) {
    return {
      message: 'Set ADMITAD_ACCESS_TOKEN to collect Admitad codes.',
      network: 'admitad',
      vouchers: [],
    }
  }

  try {
    const response = await fetchImpl(
      'https://api.admitad.com/coupons/?limit=200&order_by=-date_start',
      {
        headers: { accept: 'application/json', authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      return {
        message: `Admitad returned HTTP ${response.status}.`,
        network: 'admitad',
        vouchers: [],
      }
    }

    const payload = (await response.json()) as unknown
    return { network: 'admitad', vouchers: parseAdmitadCoupons(payload) }
  } catch (error) {
    return { message: describe(error), network: 'admitad', vouchers: [] }
  }
}

export function parseAdmitadCoupons(payload: unknown): VoucherCodeDraft[] {
  const rows = isRecord(payload) && Array.isArray(payload.results) ? payload.results : []
  const drafts: VoucherCodeDraft[] = []

  for (const row of rows) {
    if (!isRecord(row)) continue
    const code = text(row.promocode)
    // A coupon with no code is a plain sale link, not something to paste.
    if (!code) continue
    const campaign = isRecord(row.campaign) ? row.campaign : undefined
    const retailerId = slug(text(campaign?.name))
    const benefitText = text(row.name) || text(row.description)
    if (!retailerId || !benefitText) continue

    drafts.push({
      benefitText,
      code,
      retailerId,
      source: 'affiliate:admitad',
      sourceUrl: text(row.goto_link) || undefined,
      termsText: text(row.description) || undefined,
      validTo: text(row.date_end) || undefined,
    })
  }

  return drafts
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''
}

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'The feed did not answer.'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
