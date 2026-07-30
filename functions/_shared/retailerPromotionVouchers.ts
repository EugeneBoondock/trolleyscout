/**
 * Vouchers taken from the retailers' own live product APIs.
 *
 * Voucher Scout was built to read public promo codes off retailer voucher
 * pages. South African retailers do not publish those. Probing every official
 * promotions page — Clicks, Zando, Yuppiechef, Faithful to Nature, NetFlorist
 * — found not one usable code between them, so the only source that ever
 * yielded anything was Amazon's clip coupons, and the shopper saw an Amazon-
 * only list.
 *
 * What South Africans actually redeem is the loyalty offer: Smart Shopper at
 * Pick n Pay, Xtra Savings at Checkers and Shoprite. Those are published, they
 * are dated, and the same live product APIs that power Compare carry them.
 * This module turns them into vouchers a shopper can genuinely use.
 */

import type { VoucherCandidate, VoucherRedemptionMode } from '../../src/services/vouchers/types'
import { buildKnownProductSearchRequest } from './productPriceSearch'

const MAX_BODY_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 10_000

/**
 * The staples a weekly shop is built from. Promotions are attached to
 * products, so a sweep of common terms is how they surface.
 */
export const STAPLE_SWEEP_TERMS: readonly string[] = [
  'milk', 'bread', 'eggs', 'rice', 'maize meal', 'chicken', 'coffee', 'tea',
  'sugar', 'cooking oil', 'washing powder', 'nappies', 'cereal', 'pasta',
  'mince', 'cheese', 'yoghurt', 'juice', 'soap', 'toilet paper',
]

const LOYALTY_PROGRAMMES: Record<string, string> = {
  checkers: 'Xtra Savings',
  'pick-n-pay': 'Smart Shopper',
  shoprite: 'Xtra Savings',
}

const STORE_URL: Record<string, string> = {
  checkers: 'https://www.checkers.co.za',
  'pick-n-pay': 'https://www.pnp.co.za',
  shoprite: 'https://www.shoprite.co.za',
}

/**
 * One term is one subrequest, and a Worker invocation on the free plan gets
 * fifty of them for every lane it runs — not just this one. Each run takes a
 * slice of the basket and the next run takes the following slice, so the
 * whole basket is still covered across the hourly schedule.
 */
const MAX_TERMS_PER_RUN = 6

export interface PromotionSweepInput {
  capturedAt: string
  fetchImpl?: typeof fetch
  /** Which slice of the basket to sweep. Defaults to rotating by the hour. */
  rotation?: number
  retailerId: string
  terms: readonly string[]
}

export function termsForRun(
  terms: readonly string[],
  rotation: number,
  size = MAX_TERMS_PER_RUN,
): string[] {
  if (terms.length <= size) return [...terms]
  const start = (Math.abs(Math.trunc(rotation)) * size) % terms.length
  const slice = terms.slice(start, start + size)
  // Wrap around so the last slice is full rather than short.
  return slice.length === size ? slice : [...slice, ...terms.slice(0, size - slice.length)]
}

export async function sweepRetailerPromotions(
  input: PromotionSweepInput,
): Promise<VoucherCandidate[]> {
  const fetchImpl = input.fetchImpl ?? fetch
  const found: VoucherCandidate[] = []
  const seen = new Set<string>()
  const rotation = input.rotation ?? Math.floor(Date.parse(input.capturedAt) / 3_600_000)

  for (const term of termsForRun(input.terms, rotation)) {
    const request = buildKnownProductSearchRequest(input.retailerId, term)
    if (!request) continue

    try {
      const url = input.retailerId === 'pick-n-pay'
        ? withFullFields(request.url)
        : request.url
      const response = await fetchImpl(url, {
        ...request.init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) continue
      const body = await response.text()
      if (body.length > MAX_BODY_BYTES) continue

      for (const candidate of parsePromotionVouchers(
        input.retailerId,
        JSON.parse(body) as unknown,
        input.capturedAt,
      )) {
        if (seen.has(candidate.externalId)) continue
        seen.add(candidate.externalId)
        found.push(candidate)
      }
    } catch {
      // One dead term never costs the rest of the sweep.
    }
  }

  return found
}

export function parsePromotionVouchers(
  retailerId: string,
  payload: unknown,
  capturedAt: string,
): VoucherCandidate[] {
  if (retailerId === 'pick-n-pay') {
    return parsePnpPromotions(payload, capturedAt)
  }
  if (retailerId === 'checkers' || retailerId === 'shoprite') {
    return parseShopriteGroupPromotions(retailerId, payload, capturedAt)
  }
  return []
}

/**
 * Pick n Pay publishes promotions per product with real start and end dates.
 * `SMART_SHOPPER` needs the loyalty card; everything else applies at the till.
 */
function parsePnpPromotions(payload: unknown, capturedAt: string): VoucherCandidate[] {
  const rows = arrayValue(payload, 'products')
  const vouchers: VoucherCandidate[] = []

  for (const row of rows) {
    if (!isRecord(row)) continue
    const productTitle = text(row.name)
    const productUrl = absoluteUrl(text(row.url), STORE_URL['pick-n-pay'])
    if (!productTitle || !productUrl) continue

    for (const promotion of arrayValue(row, 'potentialPromotions')) {
      if (!isRecord(promotion)) continue
      const benefitText = text(promotion.promotionTextMessage)
      const externalId = text(promotion.code)
      if (!benefitText || !externalId) continue

      const validTo = isoDate(promotion.endDate)
      // A promotion that has already ended is not a voucher.
      if (validTo && Date.parse(validTo) < Date.parse(capturedAt)) continue

      const loyalty = text(promotion.promotionDisplayType).toUpperCase() === 'SMART_SHOPPER'
      vouchers.push(voucher({
        accountRequired: loyalty,
        benefitText,
        capturedAt,
        externalId: `pick-n-pay:${externalId}`,
        imageUrl: firstImageUrl(row, STORE_URL['pick-n-pay']),
        productTitle,
        redemptionMode: loyalty ? 'loyalty' : 'automatic',
        redemptionUrl: productUrl,
        retailerId: 'pick-n-pay',
        validFrom: isoDate(promotion.startDate),
        validTo,
      }))
    }
  }

  return vouchers
}

/**
 * Shoprite and Checkers flag a promotion on the product row itself, either
 * with `isOnPromotion` or by carrying a higher `oldPrice` than the shelf price.
 */
function parseShopriteGroupPromotions(
  retailerId: string,
  payload: unknown,
  capturedAt: string,
): VoucherCandidate[] {
  const rows = arrayValue(payload, 'products')
  const vouchers: VoucherCandidate[] = []

  for (const row of rows) {
    if (!isRecord(row)) continue
    const productTitle = text(row.name) || text(row.displayName)
    const id = text(row.id)
    if (!productTitle || !id) continue

    const price = money(row.discountedPrice) ?? money(row.price)
    // `oldPrice` is an integer in the minor unit while `price` is already a
    // decimal, so comparing them raw makes every product look marked down.
    // priceFactor is how the rest of the codebase folds the two together.
    const factor = money(row.priceFactor) ?? 100
    const rawWas = money(row.oldPrice)
    const wasPrice = rawWas === undefined ? undefined : rawWas / factor
    const flagged = row.isOnPromotion === true
    const markedDown = price !== undefined && wasPrice !== undefined && wasPrice > price
    if (!flagged && !markedDown) continue

    const benefitText = markedDown
      ? `Was R${wasPrice.toFixed(2)}, now R${price.toFixed(2)} — save R${(wasPrice - price).toFixed(2)}`
      : `On promotion${price !== undefined ? ` at R${price.toFixed(2)}` : ''}`

    vouchers.push(voucher({
      // Xtra Savings prices need the free card scanned at the till.
      accountRequired: true,
      benefitText,
      capturedAt,
      externalId: `${retailerId}:${id}`,
      imageUrl: absoluteUrl(text(row.imageURL), STORE_URL[retailerId]),
      productTitle,
      redemptionMode: 'loyalty',
      redemptionUrl: `${STORE_URL[retailerId]}/product/${encodeURIComponent(id)}`,
      retailerId,
    }))
  }

  return vouchers
}

function voucher(input: {
  accountRequired: boolean
  benefitText: string
  capturedAt: string
  externalId: string
  imageUrl?: string
  productTitle: string
  redemptionMode: VoucherRedemptionMode
  redemptionUrl: string
  retailerId: string
  validFrom?: string
  validTo?: string
}): VoucherCandidate {
  const programme = LOYALTY_PROGRAMMES[input.retailerId]
  const howToRedeem = input.redemptionMode === 'loyalty' && programme
    ? `Scan your ${programme} card at the till to get this price.`
    : 'The discount is applied automatically at checkout.'

  return {
    accountRequired: input.accountRequired,
    benefitText: input.benefitText,
    capturedAt: input.capturedAt,
    evidenceText: `${input.productTitle}. ${input.benefitText}. ${howToRedeem}`,
    externalId: input.externalId,
    imageUrl: input.imageUrl,
    productTitle: input.productTitle,
    // No code to type, but any shopper with the free card gets the same price.
    publicReusable: true,
    redemptionMode: input.redemptionMode,
    redemptionUrl: input.redemptionUrl,
    retailerId: input.retailerId,
    sourceUrl: input.redemptionUrl,
    termsText: howToRedeem,
    title: input.productTitle,
    validFrom: input.validFrom,
    validTo: input.validTo,
    voucherKind: 'loyalty_offer',
  }
}

function withFullFields(url: string): string {
  // The Compare field mask omits promotions; the voucher sweep needs them.
  const full = new URL(url)
  full.searchParams.set('fields', 'FULL')
  return full.toString()
}

function firstImageUrl(row: Record<string, unknown>, origin: string): string | undefined {
  for (const image of arrayValue(row, 'images')) {
    if (!isRecord(image)) continue
    const candidate = absoluteUrl(text(image.url), origin)
    if (candidate) return candidate
  }
  return undefined
}

function isoDate(value: unknown): string | undefined {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function money(value: unknown): number | undefined {
  const amount = typeof value === 'number' ? value : Number(text(value))
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function absoluteUrl(value: string, origin: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, origin)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function arrayValue(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  return Array.isArray(value[key]) ? value[key] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
