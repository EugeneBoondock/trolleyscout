import {
  buildRetailerEvidence,
  isStructuredDealActive,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerDealScope,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerSlug,
} from './types'
import { isRecord, officialUrl, percentOffText, textValue } from './values'

// The big American chains publish their weekly ads through Flipp, which is why
// none of them showed up here: each one's own site is a store locator wrapped
// around a client-rendered circular, and there is no catalogue to read. Flipp
// carries them all behind one unauthenticated API — the same one its website
// calls — keyed by postal code, because a US weekly ad is a local document. A
// Kroger ad in Atlanta is not the Kroger ad in Detroit.
//
// Two shapes are read. The flyer list for a postal code says which chains are
// trading there this week, and a flyer's own endpoint gives its items. Both are
// plain GETs; only a browser user-agent is needed.
//
// What is deliberately NOT read: the per-item endpoint. It carries the real
// `original_price`, but at one request per item — a single Walmart flyer runs
// to 318 — so it would cost more than the whole sweep's budget to price one
// shop. The flyer's own `discount` percentage is used instead, and no previous
// price is claimed. See below for why that percentage is trusted as text but
// never back-computed into an amount.

export const FLIPP_API_ORIGIN = 'https://backflipp.wishabi.com'
export const FLIPP_WEB_ORIGIN = 'https://flipp.com'

const FLIPP_WEB_HOSTS = ['flipp.com', 'www.flipp.com']
const MAX_FLIPP_ITEMS_PER_FLYER = 400
const MAX_FLIPP_FLYERS_PER_POSTAL = 6

export interface FlippChain {
  /// Exactly as Flipp writes it. Matched whole, not by substring: "Publix"
  /// must not swallow "Publix Liquors", which is a different shop with a
  /// different ad.
  merchantNames: readonly string[]
  name: string
  /// The metros this chain was actually seen trading in. Sampling all sixteen
  /// for a chain that trades in one of them would spend fifteen sweeps
  /// learning nothing, since a source makes one request per run.
  postalCodes: readonly string[]
  retailerId: RetailerSlug
}

function chain(
  slug: string,
  name: string,
  postalCodes: readonly string[],
  merchantNames?: readonly string[],
): FlippChain {
  return {
    merchantNames: merchantNames ?? [name],
    name,
    postalCodes,
    retailerId: retailerSlug(slug),
  }
}

// Four metros is the cap for a chain that trades nationally. Every extra one
// is a different local ad for the same shop, and without knowing which US
// metro a shopper is in we would be filling their feed with Seattle prices to
// no purpose. Four spreads across the country; the scope on each deal records
// which metro it came from, so nothing is lost.
const NATIONWIDE = ['10001', '30301', '60601', '98101'] as const

// Measured against Flipp itself across sixteen metros rather than assumed. The
// chains that carry no flyer anywhere — Wegmans, Trader Joe's, Whole Foods —
// are absent on purpose: Flipp does not have them, and inventing a source that
// returns nothing would read as a broken shop rather than an absent one.
export const FLIPP_US_CHAINS: readonly FlippChain[] = [
  chain('walmart', 'Walmart', NATIONWIDE),
  chain('target', 'Target', NATIONWIDE),
  chain('costco', 'Costco', NATIONWIDE),
  chain('sams-club', "Sam's Club", NATIONWIDE),
  chain('aldi-us', 'ALDI', ['10001', '30301', '60601', '85001']),
  chain('kroger', 'Kroger', ['30301', '37201', '48201']),
  chain('publix', 'Publix', ['28202', '30301', '33101', '37201']),
  chain('heb', 'H-E-B', ['78701']),
  chain('meijer', 'Meijer', ['48201', '53202', '60601']),
  chain('albertsons', 'Albertsons', ['85001', '97201', '98101']),
  chain('safeway', 'Safeway', ['80202', '85001', '97201', '98101']),
  chain('lidl-us', 'Lidl', ['10001', '19103', '28202', '30301']),
  chain('sprouts', 'Sprouts Farmers Market', ['19103', '30301', '78701', '98101']),
  chain('bjs', "BJ's Wholesale Club", ['02108', '10001', '19103', '33101']),
  chain('stop-and-shop', 'Stop & Shop', ['02108', '10001']),
  chain('fred-meyer', 'Fred Meyer', ['97201', '98101']),
  chain('hy-vee', 'Hy-Vee', ['53202']),
  chain('food-lion', 'Food Lion', ['19103', '28202', '37201']),
  chain('winn-dixie', 'Winn-Dixie', ['33101']),
]

export interface FlippCursorPlan {
  flyerIds: readonly string[]
  flyerIndex: number
  postalIndex: number
}

export function buildFlippFlyerListUrl(postalCode: string): string {
  return `${FLIPP_API_ORIGIN}/flipp/flyers?locale=en-us&postal_code=${encodeURIComponent(postalCode)}`
}

export function buildFlippFlyerItemsUrl(flyerId: string, postalCode: string): string {
  return `${FLIPP_API_ORIGIN}/flipp/flyers/${encodeURIComponent(flyerId)}` +
    `?locale=en-us&postal_code=${encodeURIComponent(postalCode)}`
}

/// Where a shopper lands. Verified against Flipp's own links: the trailing
/// merchant slug is decorative — the item id alone resolves the page — so
/// deriving it from the chain name cannot break the link even if Flipp spells
/// it differently. The shape without the slug, `/flyer/<id>/item/<id>`, looks
/// right and answers HTTP 200, but renders Flipp's own 404 inside the app.
export function buildFlippItemUrl(
  itemId: string,
  chainName: string,
  postalCode: string,
): string | undefined {
  const slug = chainName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return officialUrl(
    `${FLIPP_WEB_ORIGIN}/en-us/item/${encodeURIComponent(itemId)}-${slug}-flyer` +
      `?postal_code=${encodeURIComponent(postalCode)}`,
    FLIPP_WEB_ORIGIN,
    FLIPP_WEB_HOSTS,
  )
}

export function encodeFlippCursor(plan: FlippCursorPlan): string {
  return JSON.stringify(plan)
}

export function decodeFlippCursor(token: string): FlippCursorPlan | undefined {
  try {
    const parsed: unknown = JSON.parse(token)

    if (
      !isRecord(parsed) ||
      !Array.isArray(parsed.flyerIds) ||
      !Number.isSafeInteger(parsed.flyerIndex) ||
      !Number.isSafeInteger(parsed.postalIndex)
    ) {
      return undefined
    }

    return {
      flyerIds: parsed.flyerIds.filter((id): id is string => typeof id === 'string'),
      flyerIndex: Math.max(0, parsed.flyerIndex as number),
      postalIndex: Math.max(0, parsed.postalIndex as number),
    }
  } catch {
    return undefined
  }
}

export function isFlippFlyerListPayload(payload: unknown): boolean {
  return isRecord(payload) && Array.isArray(payload.flyers)
}

/**
 * Flyer ids for one chain in one postal code. A flyer whose window has already
 * closed is dropped here rather than fetched: its items would all be rejected
 * downstream anyway, and each one costs a request the sweep could have spent
 * on a shop that is actually trading.
 */
export function parseFlippFlyerList(
  payload: unknown,
  chainToFind: FlippChain,
  capturedAt: string,
): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.flyers)) {
    throw new TypeError('Invalid Flipp flyer list payload')
  }

  const wanted = new Set(chainToFind.merchantNames)
  const ids: string[] = []

  for (const flyer of payload.flyers) {
    if (ids.length >= MAX_FLIPP_FLYERS_PER_POSTAL) {
      break
    }

    if (!isRecord(flyer) || !wanted.has(textValue(flyer, 'merchant'))) {
      continue
    }

    const id = textValue(flyer, 'id')
    const validTo = textValue(flyer, 'valid_to')

    // A flyer with no readable end date is kept: its items carry their own
    // windows, which are checked individually.
    if (!id || (validTo && !isStructuredDealActive({
      capturedAt,
      validTo,
    }))) {
      continue
    }

    ids.push(id)
  }

  return ids
}

export interface FlippItemsOptions {
  chain: FlippChain
  flyerId: string
  postalCode: string
}

export function parseFlippFlyerItems(
  payload: unknown,
  context: RetailerFeedContext,
  options: FlippItemsOptions,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new TypeError('Invalid Flipp flyer payload')
  }

  // The ad is for that chain's shops around this postal code, not the whole
  // country, and saying so is the difference between a Detroit shopper being
  // shown an Atlanta price as a fact and being shown it as a local ad.
  const scope: RetailerDealScope = {
    regionIds: [options.postalCode],
    type: 'province',
  }
  const promotionId = `flipp-flyer-${options.flyerId}`
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const item of payload.items) {
    if (candidates.length >= MAX_FLIPP_ITEMS_PER_FLYER) {
      break
    }

    if (!isRecord(item)) {
      continue
    }

    const productId = textValue(item, 'id')
    const title = textValue(item, 'name')
    const priceCents = flippPriceToCents(item.price)
    const validFrom = textValue(item, 'valid_from') || undefined
    const validTo = textValue(item, 'valid_to') || undefined

    if (!productId || !title || priceCents === undefined || seen.has(productId)) {
      continue
    }

    // Weekly ads are published ahead of the week they run: an ALDI flyer read
    // on the 25th carried items that only start on the 29th. Offering those
    // now would send a shopper to a shelf still at full price.
    if (!isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })) {
      continue
    }

    const productUrl = buildFlippItemUrl(productId, options.chain.name, options.postalCode)

    if (!productUrl) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        promotionMarker: promotionId,
        scope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: flippImage(item),
      priceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: options.chain.retailerId,
      savingText: flippSavingText(priceCents, item.discount),
      scope,
      sourceKind: 'catalogue',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  return { candidates, catalogues: [] }
}

/**
 * Flipp writes prices as plain decimal strings — "7.0", "2.85", "219.99".
 *
 * The shared rand parser cannot be used here and the reason is worth stating:
 * it treats a separator followed by exactly two digits as the decimal point,
 * so "7.0" fails that test, its dot is stripped as a thousands separator, and
 * $7.00 becomes $70.00. Ten times the price, silently.
 */
function flippPriceToCents(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }

  const text = String(value).trim()

  // Anything that is not a bare amount — "2/$5", "buy one get one" — is left
  // alone rather than guessed at. Half of a two-for price is not a price.
  if (!/^\d+(?:\.\d+)?$/.test(text)) {
    return undefined
  }

  const cents = Math.round(Number(text) * 100)
  return Number.isSafeInteger(cents) && cents > 0 ? cents : undefined
}

/**
 * The flyer's own percentage off, carried as text.
 *
 * It is genuine — checked against three real was-prices, 7.00 from 10.98 came
 * back as 36, 197 from 297 as 34, 7.48 from 8.48 as 12 — but it is rounded to
 * a whole percent, so turning it back into an amount would invent one. That
 * 36% reconstructs to $10.94 when the ad says $10.98. So the percentage is
 * shown as the shop stated it and no previous price is claimed.
 */
function flippSavingText(priceCents: number, discount: unknown): string | undefined {
  const percent = typeof discount === 'number' ? discount : Number(discount)

  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
    return undefined
  }

  return percentOffText(priceCents, undefined, percent)
}

// Flipp serves these over plain http from an image host that also answers on
// https, and a mixed-content image is a broken image.
function flippImage(item: Record<string, unknown>): string | undefined {
  const raw = textValue(item, 'cutout_image_url') || textValue(item, 'clipping_image_url')

  if (!raw) {
    return undefined
  }

  const secure = raw.replace(/^http:\/\//i, 'https://')

  try {
    const url = new URL(secure)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}
