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

// Mr Price fronts its catalogue with a Magento GraphQL endpoint. The `store`
// header is mandatory: without `store: en_za` the endpoint answers 404.
//
// Mr Price runs no markdowns as data: `final_price` equals `regular_price` and
// `percent_off` is 0 for every product, including inside "Priced To Go", their
// own reduced aisle. Those items are re-priced rather than marked down, so
// there is no was-price to read anywhere, and their product pages are
// client-rendered shells that carry no prices either.
//
// So this sweep asks the aisle where a sale would actually appear and accepts
// nothing until one does. Publishing the regular price as a was-price would
// invent a discount that does not exist. The aisle is looked up by its url key
// each run rather than by a stored id, so a rebuilt category tree does not
// quietly stop the sweep.

export const MR_PRICE_GRAPHQL_URL = 'https://apiprd.omni.mrpg.com/graphql'
export const MR_PRICE_ORIGIN = 'https://www.mrp.com'
export const MR_PRICE_STORE_HEADER = 'en_za'
export const MR_PRICE_MARKDOWN_URL_KEY = 'priced-to-go'
export const MR_PRICE_PAGE_SIZE = 100
export const MR_PRICE_MAX_CATEGORIES = 12

const MR_PRICE_HOSTS = ['mrp.com', 'www.mrp.com']
const MR_PRICE_IMAGE_HOSTS = ['m2prd.mrpg.com', ...MR_PRICE_HOSTS]

const mrPriceRetailerId = retailerSlug('mr-price')
const mrPriceScope = { type: 'online' } as const
const mrPricePromotionId = 'mrp-markdowns'

/// Finds every "Priced To Go" aisle — there is one per department — so the
/// sweep never depends on a category id that Mr Price may rebuild.
export function buildMrPriceCategoriesQuery(
  urlKey: string = MR_PRICE_MARKDOWN_URL_KEY,
): string {
  return `{ categoryList(filters:{url_key:{eq:${JSON.stringify(urlKey)}}}) ` +
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
    '{ total_count items { sku name url_key price_range { minimum_price ' +
    '{ regular_price { value } final_price { value } ' +
    'discount { amount_off percent_off } } } small_image { url } } } }'
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
    const minimum = recordValue(recordValue(item, 'price_range'), 'minimum_price')
    const productId = textValue(item, 'sku')
    const title = textValue(item, 'name')
    const productUrl = mrPriceProductUrl(item)
    const priceCents = randToCents(recordValue(minimum, 'final_price')?.value)
    const regularCents = randToCents(recordValue(minimum, 'regular_price')?.value)

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      // No markdown today: final equals regular right across the catalogue.
      regularCents === undefined ||
      regularCents <= priceCents ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: regularCents,
        promotionMarker: mrPricePromotionId,
        scope: mrPriceScope,
        sourceId: productId,
      }),
      imageUrl: officialUrl(
        textValue(recordValue(item, 'small_image'), 'url'),
        MR_PRICE_ORIGIN,
        MR_PRICE_IMAGE_HOSTS,
      ),
      priceCents,
      previousPriceCents: regularCents,
      productId,
      productUrl,
      promotionId: mrPricePromotionId,
      retailerId: mrPriceRetailerId,
      savingText: percentOffText(priceCents, regularCents, quotedPercent(minimum)),
      scope: mrPriceScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const totalCount = Number(products.total_count)

  return {
    candidates,
    catalogues: [],
    totalCount: Number.isSafeInteger(totalCount) && totalCount >= 0
      ? totalCount
      : undefined,
  }
}

function quotedPercent(minimum: Record<string, unknown> | undefined): number | undefined {
  const percent = Number(recordValue(minimum, 'discount')?.percent_off)
  return Number.isFinite(percent) && percent > 0 ? percent : undefined
}

function mrPriceProductUrl(item: unknown): string | undefined {
  const key = textValue(item, 'url_key')
  return key ? officialUrl(`/en_za/${key}.html`, MR_PRICE_ORIGIN, MR_PRICE_HOSTS) : undefined
}
