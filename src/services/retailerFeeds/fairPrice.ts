import { buildRetailerEvidence, isStructuredDealActive, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'

// Fair Price (furniture, appliances and homeware discounter) runs a stock
// Magento storefront whose GraphQL endpoint is publicly readable. One
// products query per page returns names, images and both regular and final
// prices; rows whose final price sits below the regular price are the
// store's live markdowns.

const fairPriceRetailerId = retailerSlug('fair-price')
const FAIR_PRICE_ORIGIN = 'https://www.fairprice.co.za'

export const FAIR_PRICE_PAGE_SIZE = 100

export function buildFairPriceGraphqlQuery(page: number): string {
  return JSON.stringify({
    query: `{products(filter:{},pageSize:${FAIR_PRICE_PAGE_SIZE},currentPage:${page}){` +
      'total_count items{name sku url_key stock_status small_image{url}' +
      ' price_range{minimum_price{regular_price{value currency}' +
      ' final_price{value} discount{amount_off}}}}}}',
  })
}

export function parseFairPriceFeed(
  payload: unknown,
  context: RetailerFeedContext & { page: number },
): RetailerFeedPage {
  const products = nestedRecord(payload, ['data', 'products'])
  const items = products && Array.isArray(products.items) ? products.items : undefined

  if (!items) {
    throw new TypeError('Invalid Fair Price product response')
  }

  const candidates: RetailerDealCandidate[] = []

  for (const item of items) {
    if (!isRecord(item)) {
      continue
    }

    const title = textValue(item, 'name')
    const sku = textValue(item, 'sku')
    const urlKey = textValue(item, 'url_key')
    const minimumPrice = nestedRecord(item, ['price_range', 'minimum_price'])
    const priceCents = moneyCents(nestedRecord(minimumPrice, ['final_price'])?.value)
    const regularCents = moneyCents(nestedRecord(minimumPrice, ['regular_price'])?.value)
    const currency = textValue(nestedRecord(minimumPrice, ['regular_price']), 'currency')

    if (
      !title ||
      !sku ||
      !urlKey ||
      priceCents === undefined ||
      regularCents === undefined ||
      (currency && currency !== 'ZAR') ||
      textValue(item, 'stock_status') === 'OUT_OF_STOCK' ||
      // Only genuine markdowns belong in a deals feed.
      regularCents <= priceCents ||
      !isStructuredDealActive({ capturedAt: context.capturedAt })
    ) {
      continue
    }

    const productId = `fair-price-${sku.toLocaleLowerCase()}`
    const scope = { type: 'national' as const }
    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: regularCents,
        promotionMarker: 'magento-markdown',
        scope,
        sourceId: sku,
      }),
      imageUrl: textValue(nestedRecord(item, ['small_image']), 'url') || undefined,
      priceCents,
      previousPriceCents: regularCents,
      productId,
      productUrl: `${FAIR_PRICE_ORIGIN}/${encodeURIComponent(urlKey)}`,
      promotionId: productId,
      retailerId: fairPriceRetailerId,
      savingText: `Save R${((regularCents - priceCents) / 100).toFixed(2)}`,
      scope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const totalCount = integerValue(products?.total_count)
  const seen = context.page * FAIR_PRICE_PAGE_SIZE

  return {
    candidates,
    catalogues: [],
    nextCursor: totalCount !== undefined && seen < totalCount && items.length > 0
      ? { kind: 'page', page: context.page + 1 }
      : undefined,
    totalCount,
  }
}

function moneyCents(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value * 100)
    : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function nestedRecord(
  value: unknown,
  path: string[],
): Record<string, unknown> | undefined {
  let current: unknown = value
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return isRecord(current) ? current : undefined
}

function textValue(value: unknown, key: string): string {
  if (!isRecord(value)) {
    return ''
  }
  const nested = value[key]
  return typeof nested === 'string' ? nested.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
