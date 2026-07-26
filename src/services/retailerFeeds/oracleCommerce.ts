import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerSlug,
} from './types'
import {
  arrayValue,
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

export interface OracleCommerceShop {
  categoryId: string
  host: string
  name: string
  retailerId: RetailerSlug
}

export const ORACLE_COMMERCE_PAGE_SIZE = 50
const oracleScope = { type: 'online' } as const

export const ORACLE_COMMERCE_SHOPS: readonly OracleCommerceShop[] = [
  {
    categoryId: 'sale',
    host: 'www.truworths.co.za',
    name: 'Truworths',
    retailerId: retailerSlug('truworths'),
  },
  {
    categoryId: 'sale-of',
    host: 'officelondon.truworths.co.za',
    name: 'Office London',
    retailerId: retailerSlug('office-london'),
  },
]

export function buildOracleCommerceUrl(
  shop: OracleCommerceShop,
  offset = 0,
): string {
  const url = new URL('/ccstore/v1/products', `https://${shop.host}`)
  url.searchParams.set('categoryId', shop.categoryId)
  url.searchParams.set('limit', String(ORACLE_COMMERCE_PAGE_SIZE))
  url.searchParams.set('offset', String(Math.max(0, Math.trunc(offset) || 0)))
  url.searchParams.set('includeChildren', 'true')
  return url.toString()
}

export function parseOracleCommerceFeed(
  payload: unknown,
  context: RetailerFeedContext,
  shop: OracleCommerceShop,
  offset: number,
): RetailerFeedPage {
  const items = isRecord(payload) && Array.isArray(payload.items)
    ? payload.items
    : undefined

  if (!items) {
    throw new TypeError('Invalid Oracle Commerce feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()
  const origin = `https://${shop.host}`
  const hosts = [shop.host]
  const promotionId = `oracle-${shop.categoryId}`

  for (const item of items) {
    const productId = textValue(item, 'id')
    const title = textValue(item, 'displayName')
    const productUrl = officialUrl(textValue(item, 'route'), origin, hosts)
    const markdown = lowestMarkdown(item)

    if (
      !productId ||
      !title ||
      !productUrl ||
      !markdown ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents: markdown.priceCents,
        previousPriceCents: markdown.previousPriceCents,
        promotionMarker: promotionId,
        scope: oracleScope,
        sourceId: productId,
      }),
      imageUrl:
        `https://cdn.media.amplience.net/i/truworths/` +
        `${encodeURIComponent(productId)}_1?fmt=auto&w=800&h=800`,
      previousPriceCents: markdown.previousPriceCents,
      priceCents: markdown.priceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: shop.retailerId,
      savingText: percentOffText(markdown.priceCents, markdown.previousPriceCents),
      scope: oracleScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const totalCount = safeNonNegativeInteger(
    isRecord(payload) ? payload.totalResults : undefined,
  )
  const nextOffset = Math.max(0, Math.trunc(offset) || 0) + items.length

  return {
    candidates,
    catalogues: [],
    nextCursor: totalCount !== undefined && items.length > 0 && nextOffset < totalCount
      ? { kind: 'offset', offset: nextOffset }
      : undefined,
    totalCount,
  }
}

interface OracleMarkdown {
  previousPriceCents: number
  priceCents: number
}

function lowestMarkdown(product: unknown): OracleMarkdown | undefined {
  const rows = [product, ...arrayValue(product, 'childSKUs')]
  const markdowns: OracleMarkdown[] = []

  for (const row of rows) {
    if (isRecord(row) && row.active === false) {
      continue
    }

    const priceCents = randToCents(recordValue(row, 'salePrices')?.zar)
    const previousPriceCents = randToCents(recordValue(row, 'listPrices')?.zar)

    if (
      priceCents !== undefined &&
      previousPriceCents !== undefined &&
      previousPriceCents > priceCents
    ) {
      markdowns.push({ previousPriceCents, priceCents })
    }
  }

  return markdowns.sort((left, right) =>
    left.priceCents - right.priceCents ||
    left.previousPriceCents - right.previousPriceCents
  )[0]
}

function safeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}
