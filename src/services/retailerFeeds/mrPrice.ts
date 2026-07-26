import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

// Mr Price fronts its catalogue with a Magento GraphQL endpoint. Two things are
// mandatory and neither is obvious: the `store: en_za` header, without which
// every query answers 404, and POST — a GET is refused as a suspected CSRF
// attempt however well-formed the query is.
//
// This shop reported no deals at all for months, and the reason was written
// into this file as a fact about Mr Price: that they re-price rather than mark
// down, so no was-price exists to read anywhere. That was wrong. The markdown
// is in `maximum_price`, and only `minimum_price` was ever asked for:
//
//     minimum_price: regular 200,    final 200,  discount 0%
//     maximum_price: regular 299.99, final 200,  discount 33.33%
//
// which is a dress on the shelf at R200 that was R299.99, priced exactly as its
// own page displays it. Around nine hundred of those were being dropped by a
// filter reading the wrong half of the payload.
//
// Mr Price runs two kinds of offer and both are read here:
//
//   Markdowns carry a real was-price in maximum_price and turn up right across
//   the catalogue, not only on the "Priced To Go" clearance rail — a third of
//   what is on the New In page is marked down — so every aisle is swept.
//
//   Multibuys — "take 2 for R130", "take 3 for 2" — mark nothing down, because
//   the saving arrives at the till, so they appear nowhere in the catalogue's
//   prices. Each one is a category under Promos whose own name is the offer,
//   which is better wording than anything that could be assembled here, and
//   means the promos page never has to be read: it is an Ionic shell that
//   arrives as 16KB of nothing and fills itself in the browser. They are
//   published at the real shelf price with no was-price at all — the same
//   treatment the Woolworths multibuys get.

export const MR_PRICE_GRAPHQL_URL = 'https://apiprd.omni.mrpg.com/graphql'
export const MR_PRICE_ORIGIN = 'https://www.mrp.com'
export const MR_PRICE_PROMOS_URL = `${MR_PRICE_ORIGIN}/en_za/promos`
export const MR_PRICE_PROMOS_URL_KEY = 'promos'
export const MR_PRICE_STORE_HEADER = 'en_za'
// Every aisle a markdown can appear in, which is all of them. Scoping this to
// "Priced To Go" was the old mistake compounding itself: that is the clearance
// rail, but a third of what is on the New In page is marked down too, and none
// of it was ever asked for. Taken from Mr Price's own navigation. Each key
// resolves to several category ids — a department and its children — and all of
// them are walked.
export const MR_PRICE_CATEGORY_KEYS = [
  'priced-to-go',
  'ladies',
  'mens',
  'kids',
  'baby',
  'shoes-all-store',
  'beauty',
  'everyday-basics',
  'new-in',
  'mrp-co',
] as const
export const MR_PRICE_PAGE_SIZE = 100
export const MR_PRICE_MAX_CATEGORIES = 40
export const MR_PRICE_MAX_CAMPAIGNS = 12

const MR_PRICE_HOSTS = ['mrp.com', 'www.mrp.com']
const MR_PRICE_IMAGE_HOSTS = [
  'cdn.media.amplience.net',
  'm2prd.mrpg.com',
  ...MR_PRICE_HOSTS,
]

const mrPriceRetailerId = retailerSlug('mr-price')
const mrPriceScope = { type: 'online' } as const
const mrPricePromotionId = 'mrp-markdowns'

const PRODUCT_FIELDS =
  '{ sku name url_key ' +
  'price_range { minimum_price { regular_price { value } final_price { value } } ' +
  'maximum_price { regular_price { value } final_price { value } ' +
  'discount { amount_off percent_off } } } small_image { url } }'

/// Resolves the aisles by their url keys each run rather than by stored ids, so
/// a rebuilt category tree does not quietly stop the sweep.
export function buildMrPriceCategoriesQuery(
  urlKeys: readonly string[] = MR_PRICE_CATEGORY_KEYS,
): string {
  return `{ categoryList(filters:{url_key:{in:${JSON.stringify(urlKeys)}}}) ` +
    '{ uid name url_path product_count } }'
}

export function parseMrPriceCategories(payload: unknown): string[] {
  const list = recordValue(payload, 'data')?.categoryList

  if (!Array.isArray(list)) {
    throw new TypeError('Invalid Mr Price category payload')
  }

  const uids: string[] = []

  for (const entry of list) {
    const uid = textValue(entry, 'uid')

    if (uid && !uids.includes(uid)) {
      uids.push(uid)
    }

    if (uids.length >= MR_PRICE_MAX_CATEGORIES) {
      break
    }
  }

  return uids
}

export function buildMrPriceProductsQuery(
  categoryUid: string,
  pageSize: number = MR_PRICE_PAGE_SIZE,
): string {
  const uid = JSON.stringify(categoryUid)
  const rows = Math.max(1, Math.min(Math.trunc(pageSize) || 0, MR_PRICE_PAGE_SIZE))

  return `{ products(filter:{category_uid:{eq:${uid}}}, pageSize:${rows}) ` +
    `{ total_count items ${PRODUCT_FIELDS} } }`
}

export interface MrPriceCategoryCursor {
  index: number
  uids: string[]
}

export function encodeMrPriceCursor(cursor: MrPriceCategoryCursor): string {
  return JSON.stringify({ i: cursor.index, uids: cursor.uids })
}

export function decodeMrPriceCursor(token: string): MrPriceCategoryCursor | undefined {
  try {
    const parsed = JSON.parse(token) as unknown

    if (!isRecord(parsed) || !Array.isArray(parsed.uids)) {
      return undefined
    }

    const uids = parsed.uids.filter((uid): uid is string => typeof uid === 'string' && uid !== '')
    const index = Number(parsed.i)

    if (uids.length === 0 || !Number.isSafeInteger(index) || index < 0) {
      return undefined
    }

    return { index, uids }
  } catch {
    return undefined
  }
}

export function parseMrPriceFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const products = recordValue(recordValue(payload, 'data'), 'products')

  if (!products || !Array.isArray(products.items)) {
    throw new TypeError('Invalid Mr Price feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const item of products.items) {
    const marked = mrPriceMarkdown(item)
    const productId = textValue(item, 'sku')
    const title = textValue(item, 'name')
    const productUrl = mrPriceProductUrl(item)

    if (!marked || !productId || !title || !productUrl || seen.has(productId)) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents: marked.priceCents,
        previousPriceCents: marked.previousPriceCents,
        promotionMarker: mrPricePromotionId,
        scope: mrPriceScope,
        sourceId: productId,
      }),
      imageUrl: mrPriceImage(item),
      priceCents: marked.priceCents,
      previousPriceCents: marked.previousPriceCents,
      productId,
      productUrl,
      promotionId: mrPricePromotionId,
      retailerId: mrPriceRetailerId,
      savingText: percentOffText(
        marked.priceCents,
        marked.previousPriceCents,
        marked.quotedPercent,
      ),
      scope: mrPriceScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: readTotalCount(products) }
}

export interface MrPriceCampaign {
  categoryUid: string
  offerText: string
  slug: string
}

export interface MrPriceCampaignCursor {
  campaigns: MrPriceCampaign[]
  index: number
}

/// The Promos aisle and the campaigns beneath it. Two levels down: Promos holds
/// groupings like "Ladies Real Deal", and each of those holds the offers.
export function buildMrPricePromotionsQuery(
  urlKey: string = MR_PRICE_PROMOS_URL_KEY,
): string {
  return `{ categoryList(filters:{url_key:{eq:${JSON.stringify(urlKey)}}}) ` +
    '{ uid name children { uid name children { uid name url_key product_count } } } }'
}

/**
 * The multibuys, read from the category tree rather than the promos page.
 *
 * A campaign's own name is the offer — "Selected sleepwear separates take 2 for
 * R130" — so the wording is Mr Price's rather than something reassembled from a
 * url slug, and an offer whose name says nothing useful is left out rather than
 * shown as a saving nobody can act on.
 */
export function parseMrPricePromotions(payload: unknown): MrPriceCampaign[] {
  const list = recordValue(payload, 'data')?.categoryList

  if (!Array.isArray(list)) {
    throw new TypeError('Invalid Mr Price promotions payload')
  }

  const campaigns: MrPriceCampaign[] = []
  const seen = new Set<string>()

  for (const promos of list) {
    for (const grouping of childCategories(promos)) {
      for (const campaign of childCategories(grouping)) {
        if (campaigns.length >= MR_PRICE_MAX_CAMPAIGNS) {
          return campaigns
        }

        const categoryUid = textValue(campaign, 'uid')
        const offerText = textValue(campaign, 'name')
        const slug = textValue(campaign, 'url_key') || categoryUid

        // "View All" is a link, not an offer, and a campaign holding nothing
        // has nothing to put on a card.
        if (
          !categoryUid ||
          offerText.length < 8 ||
          seen.has(categoryUid) ||
          productCount(campaign) === 0
        ) {
          continue
        }

        seen.add(categoryUid)
        campaigns.push({ categoryUid, offerText, slug })
      }
    }
  }

  return campaigns
}

function productCount(node: unknown): number {
  const count = Number(isRecord(node) ? node.product_count : undefined)
  return Number.isFinite(count) ? count : -1
}

function childCategories(node: unknown): unknown[] {
  const children = isRecord(node) ? node.children : undefined
  return Array.isArray(children) ? children : []
}

export function encodeMrPriceCampaignCursor(cursor: MrPriceCampaignCursor): string {
  return JSON.stringify({ c: cursor.campaigns, i: cursor.index })
}

export function decodeMrPriceCampaignCursor(
  token: string,
): MrPriceCampaignCursor | undefined {
  try {
    const parsed = JSON.parse(token) as unknown

    if (!isRecord(parsed) || !Array.isArray(parsed.c)) {
      return undefined
    }

    const campaigns = parsed.c.flatMap((entry): MrPriceCampaign[] => {
      const categoryUid = textValue(entry, 'categoryUid')
      const offerText = textValue(entry, 'offerText')
      const slug = textValue(entry, 'slug')
      return categoryUid && offerText ? [{ categoryUid, offerText, slug }] : []
    })
    const index = Number(parsed.i)

    if (campaigns.length === 0 || !Number.isSafeInteger(index) || index < 0) {
      return undefined
    }

    return { campaigns, index }
  } catch {
    return undefined
  }
}

/**
 * Products carrying a multibuy.
 *
 * No previous price is set and none is implied: "take 2 for R130" leaves the
 * shelf price where it was, and the saving only exists for a shopper who buys
 * two. The offer goes in as the saving text, in Mr Price's words, so the card
 * says what has to be done to get it.
 */
export function parseMrPriceCampaignFeed(
  payload: unknown,
  context: RetailerFeedContext,
  campaign: MrPriceCampaign,
): RetailerFeedPage {
  const products = recordValue(recordValue(payload, 'data'), 'products')

  if (!products || !Array.isArray(products.items)) {
    throw new TypeError('Invalid Mr Price campaign payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()
  const promotionId = `mrp-promo-${campaign.slug}`

  for (const item of products.items) {
    const productId = textValue(item, 'sku')
    const title = textValue(item, 'name')
    const productUrl = mrPriceProductUrl(item)
    const minimum = recordValue(recordValue(item, 'price_range'), 'minimum_price')
    const priceCents = randToCents(recordValue(minimum, 'final_price')?.value)

    if (!productId || !title || !productUrl || priceCents === undefined || seen.has(productId)) {
      continue
    }

    seen.add(productId)

    // A multibuy item can also be marked down in its own right, and when it is,
    // that was-price is real and worth carrying beside the offer.
    const marked = mrPriceMarkdown(item)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: marked?.previousPriceCents,
        promotionMarker: promotionId,
        scope: mrPriceScope,
        sourceId: productId,
      }),
      imageUrl: mrPriceImage(item),
      priceCents,
      previousPriceCents: marked?.previousPriceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: mrPriceRetailerId,
      savingText: campaign.offerText,
      scope: mrPriceScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      termsText: 'Offer valid on selected items for a limited time. Ts and Cs apply.',
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: readTotalCount(products) }
}

interface MrPriceMarkdown {
  priceCents: number
  previousPriceCents: number
  quotedPercent?: number
}

/**
 * The was-and-now pair, read from `maximum_price`.
 *
 * `minimum_price` is no use for this: its regular equals its final on every
 * product in the catalogue, marked down or not. The discount block is what
 * decides — a product whose price merely varies by size also has a maximum
 * above its minimum, and that is a size range, not a saving.
 */
function mrPriceMarkdown(item: unknown): MrPriceMarkdown | undefined {
  const maximum = recordValue(recordValue(item, 'price_range'), 'maximum_price')
  const percent = Number(recordValue(maximum, 'discount')?.percent_off)

  if (!Number.isFinite(percent) || percent <= 0) {
    return undefined
  }

  const priceCents = randToCents(recordValue(maximum, 'final_price')?.value)
  const previousPriceCents = randToCents(recordValue(maximum, 'regular_price')?.value)

  if (
    priceCents === undefined ||
    previousPriceCents === undefined ||
    previousPriceCents <= priceCents
  ) {
    return undefined
  }

  return { previousPriceCents, priceCents, quotedPercent: percent }
}

function readTotalCount(products: Record<string, unknown>): number | undefined {
  const total = Number(products.total_count)
  return Number.isSafeInteger(total) && total >= 0 ? total : undefined
}

function mrPriceImage(item: unknown): string | undefined {
  const supplied = officialUrl(
    textValue(recordValue(item, 'small_image'), 'url'),
    MR_PRICE_ORIGIN,
    MR_PRICE_IMAGE_HOSTS,
  )

  if (supplied && !isMrPricePlaceholder(supplied)) {
    return supplied
  }

  const sku = textValue(item, 'sku')

  if (!/^[A-Za-z0-9_-]{3,80}$/.test(sku)) {
    return undefined
  }

  return officialUrl(
    `https://cdn.media.amplience.net/i/mrpricegroup/` +
      `${encodeURIComponent(sku)}_SI_00?$preset$&fmt=auto`,
    MR_PRICE_ORIGIN,
    MR_PRICE_IMAGE_HOSTS,
  )
}

function isMrPricePlaceholder(value: string): boolean {
  try {
    const path = new URL(value).pathname.toLowerCase()
    return path.includes('/placeholder/') || path.includes('no-image')
  } catch {
    return true
  }
}

/// Without the `.html` this used to append: that form answers 200 and then
/// renders an empty shell, and the shop's own links carry no extension.
function mrPriceProductUrl(item: unknown): string | undefined {
  const key = textValue(item, 'url_key')
  return key ? officialUrl(`/en_za/${key}`, MR_PRICE_ORIGIN, MR_PRICE_HOSTS) : undefined
}
