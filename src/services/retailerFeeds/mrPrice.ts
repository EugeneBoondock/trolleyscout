import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

// Mr Price fronts its catalogue with a Magento GraphQL endpoint. The `store`
// header is mandatory: without `store: en_za` the endpoint answers 404.
//
// Mr Price currently runs no markdowns at all: `final_price` equals
// `regular_price` and `percent_off` is 0 across the catalogue. That is a real
// answer, not a parsing failure, so this adapter simply yields nothing until
// they run a sale. Publishing the regular price as a was-price would invent a
// discount that does not exist.

export const MR_PRICE_GRAPHQL_URL = 'https://apiprd.omni.mrpg.com/graphql'
export const MR_PRICE_ORIGIN = 'https://www.mrp.com'
export const MR_PRICE_STORE_HEADER = 'en_za'
export const MR_PRICE_SEARCH_TERM = 'dress'
export const MR_PRICE_PAGE_SIZE = 100

const MR_PRICE_HOSTS = ['mrp.com', 'www.mrp.com']
const MR_PRICE_IMAGE_HOSTS = ['m2prd.mrpg.com', ...MR_PRICE_HOSTS]

const mrPriceRetailerId = retailerSlug('mr-price')
const mrPriceScope = { type: 'online' } as const
const mrPricePromotionId = 'mrp-markdowns'

export function buildMrPriceProductsQuery(
  search: string = MR_PRICE_SEARCH_TERM,
  pageSize: number = MR_PRICE_PAGE_SIZE,
): string {
  const term = JSON.stringify(search)
  const rows = Math.max(1, Math.min(Math.trunc(pageSize) || 0, MR_PRICE_PAGE_SIZE))

  return `{ products(search:${term}, pageSize:${rows}) { total_count items { ` +
    'sku name url_key price_range { minimum_price { regular_price { value } ' +
    'final_price { value } discount { amount_off percent_off } } } ' +
    'small_image { url } } } }'
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
