import {
  buildRetailerEvidence,
  isStructuredDealActive,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'

// Takealot publishes its running promotions through its own public API. The
// deals page itself renders client-side, so reading the API is both cheaper and
// far richer: /promotions lists every live campaign ("Best of Deals We Love:
// Tech"), and each campaign's products come from the product search filtered by
// that promotion id. Sweeping the campaigns yields the whole deal catalogue
// rather than the handful of tiles the landing page happens to render.
//
// Two facts drive the parsing rules:
//   * buybox_summary.prices is a PRICE RANGE across a product's variants, so
//     prices[1] is the top of that range, NOT a previous price. Only
//     listing_price is a genuine was-price, so only it can produce a strike
//     through. Treating the range top as a was-price would invent discounts.
//   * The search API ignores `start`, returning the same first page whatever
//     the offset. Promotions are therefore the pagination axis: one campaign
//     per request, carried across runs in a token cursor.

export const TAKEALOT_ORIGIN = 'https://www.takealot.com'
export const TAKEALOT_API_ORIGIN = 'https://api.takealot.com/rest/v-1-18-0'
export const TAKEALOT_PROMOTIONS_URL = `${TAKEALOT_API_ORIGIN}/promotions`
// The API caps a search response at 36 products however many rows are asked
// for, so a campaign is read in a single request.
const TAKEALOT_ROWS = 100
const MAX_TRACKED_PROMOTIONS = 120

const takealotRetailerId = retailerSlug('takealot')
const takealotScope = { type: 'online' } as const

export interface TakealotPromotionCursor {
  /** Index of the campaign this request reads. */
  index: number
  /** Live campaign ids captured when the sweep started. */
  ids: number[]
}

export function buildTakealotPromotionProductsUrl(promotionId: number): string {
  const url = new URL(`${TAKEALOT_API_ORIGIN}/searches/products,filters`)
  url.searchParams.set('filter', `Promotions:${promotionId}`)
  url.searchParams.set('rows', String(TAKEALOT_ROWS))
  url.searchParams.set('start', '0')
  return url.toString()
}

export function encodeTakealotCursor(cursor: TakealotPromotionCursor): string {
  return JSON.stringify({ i: cursor.index, ids: cursor.ids })
}

export function decodeTakealotCursor(token: string): TakealotPromotionCursor | undefined {
  try {
    const parsed = JSON.parse(token) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.ids)) {
      return undefined
    }
    const ids = parsed.ids.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
    const index = Number(parsed.i)
    if (ids.length === 0 || !Number.isSafeInteger(index) || index < 0) {
      return undefined
    }
    return { ids, index }
  } catch {
    return undefined
  }
}

/** Live campaign ids, newest first, from the /promotions payload. */
export function parseTakealotPromotions(payload: unknown, capturedAt: string): number[] {
  const rows = isRecord(payload) && Array.isArray(payload.response)
    ? payload.response
    : []
  const ids: number[] = []

  for (const row of rows) {
    if (!isRecord(row)) continue
    const id = Number(row.promotion_id)
    if (!Number.isSafeInteger(id) || id <= 0 || row.is_active === false) {
      continue
    }
    const validFrom = takealotDate(row.date_start)
    const validTo = takealotDate(row.date_end)
    // A campaign that has not started, or has already closed, has nothing to
    // show a shopper today.
    if (!isStructuredDealActive({ capturedAt, validFrom, validTo })) {
      continue
    }
    if (!ids.includes(id) && ids.length < MAX_TRACKED_PROMOTIONS) {
      ids.push(id)
    }
  }

  return ids
}

export function isTakealotPromotionsPayload(payload: unknown): boolean {
  return isRecord(payload) && Array.isArray(payload.response) &&
    payload.response.some((row) => isRecord(row) && 'promotion_id' in row)
}

export interface TakealotFeedOptions {
  promotionId?: number
  validFrom?: string
  validTo?: string
}

export function parseTakealotFeed(
  payload: unknown,
  context: RetailerFeedContext,
  options: TakealotFeedOptions = {},
): RetailerFeedPage {
  const results = takealotResults(payload)
  if (results === undefined) {
    throw new TypeError('Invalid Takealot feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()
  const promotionId = options.promotionId !== undefined
    ? String(options.promotionId)
    : 'takealot-deals'

  for (const result of results) {
    const view = productView(result)
    if (!view) continue

    const core = recordValue(view, 'core')
    const buybox = recordValue(view, 'buybox_summary')
    const productId = integerValue(core, 'id')
    const title = textValue(core, 'title')
    const slug = textValue(core, 'slug')
    const priceCents = takealotPriceCents(buybox)

    if (productId === undefined || !title || !slug || priceCents === undefined) {
      continue
    }

    // Only listing_price is a real was-price; the price array is a variant
    // range. Anything else would be an invented saving.
    const listingCents = moneyToCents(buybox?.listing_price)
    const previousPriceCents = listingCents !== undefined && listingCents > priceCents
      ? listingCents
      : undefined

    const key = String(productId)
    if (seen.has(key)) continue
    seen.add(key)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: promotionId,
        scope: takealotScope,
        sourceId: key,
        validFrom: options.validFrom,
        validTo: options.validTo,
      }),
      imageUrl: takealotImageUrl(view),
      priceCents,
      previousPriceCents,
      productId: key,
      productUrl: `${TAKEALOT_ORIGIN}/${encodeURIComponent(slug)}/PLID${productId}`,
      promotionId,
      retailerId: takealotRetailerId,
      savingText: takealotSavingText(view, buybox),
      scope: takealotScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom: options.validFrom,
      validTo: options.validTo,
    })
  }

  return { candidates, catalogues: [] }
}

function takealotResults(payload: unknown): unknown[] | undefined {
  if (!isRecord(payload)) return undefined
  const sections = recordValue(payload, 'sections')
  const products = recordValue(sections, 'products')
  if (products && Array.isArray(products.results)) {
    return products.results
  }
  return Array.isArray(payload.results) ? payload.results : undefined
}

function productView(result: unknown): Record<string, unknown> | undefined {
  if (!isRecord(result)) return undefined
  const view = recordValue(result, 'product_views')
  return view ?? (isRecord(result.core) ? result : undefined)
}

// The lowest live price. For a single-variant product this is the price the
// shopper pays; for a multi-variant product it is the "From" price Takealot
// itself displays.
function takealotPriceCents(buybox: Record<string, unknown> | undefined): number | undefined {
  const prices = buybox && Array.isArray(buybox.prices) ? buybox.prices : []
  const amounts = prices
    .map((value) => moneyToCents(value))
    .filter((value): value is number => value !== undefined && value > 0)
  return amounts.length > 0 ? Math.min(...amounts) : undefined
}

function takealotSavingText(
  view: Record<string, unknown>,
  buybox: Record<string, unknown> | undefined,
): string | undefined {
  const saving = textValue(buybox, 'saving')
  if (saving) {
    return /off$/i.test(saving) ? saving : `${saving} off`
  }
  const badges = recordValue(view, 'badges')
  const entries = badges && Array.isArray(badges.entries) ? badges.entries : []
  for (const entry of entries) {
    const value = textValue(entry, 'value')
    if (value) return value
  }
  return undefined
}

function takealotImageUrl(view: Record<string, unknown>): string | undefined {
  const gallery = recordValue(view, 'gallery')
  const images = gallery && Array.isArray(gallery.images) ? gallery.images : []
  const first = images.find((value): value is string => typeof value === 'string' && value.length > 0)
  if (!first) return undefined
  const resolved = first.replace('{size}', 'pdpxl')
  try {
    const url = new URL(resolved)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

// Campaign dates arrive as "2026-07-24 17:45:00" in South African time.
function takealotDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(value.trim())
  if (!match) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : undefined
  }
  return `${match[1]}T${match[2]}+02:00`
}

export function takealotPromotionWindow(
  payload: unknown,
  promotionId: number,
): { validFrom?: string; validTo?: string } {
  const rows = isRecord(payload) && Array.isArray(payload.response) ? payload.response : []
  for (const row of rows) {
    if (isRecord(row) && Number(row.promotion_id) === promotionId) {
      return { validFrom: takealotDate(row.date_start), validTo: takealotDate(row.date_end) }
    }
  }
  return {}
}

function moneyToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const cents = Math.round(value * 100)
    return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
  }
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[^\d.,]/g, '').replace(/,/g, '')
  if (!cleaned) return undefined
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  const cents = Math.round(amount * 100)
  return Number.isSafeInteger(cents) ? cents : undefined
}

function recordValue(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  return isRecord(nested) ? nested : undefined
}

function textValue(value: unknown, key: string): string {
  if (!isRecord(value)) return ''
  const nested = value[key]
  return typeof nested === 'string' || typeof nested === 'number'
    ? String(nested).trim()
    : ''
}

function integerValue(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const nested = Number(value[key])
  return Number.isSafeInteger(nested) && nested > 0 ? nested : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
