import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  arrayValue,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

export const SUPERBALIST_HM_ORIGIN = 'https://superbalist.com'
export const SUPERBALIST_HM_PAGE_SIZE = 72
export const MAX_SUPERBALIST_HM_PAGES = 40

const SUPERBALIST_HOSTS = ['superbalist.com', 'www.superbalist.com']
const SUPERBALIST_IMAGE_HOSTS = ['assets.superbalistcdn.co.za']
const MAX_HTML_BYTES = 6 * 1024 * 1024
const PRODUCT_LIST_PATTERN =
  /<script\b(?=[^>]*\bid=["']product-list-jsonld["'])[^>]*>([\s\S]*?)<\/script>/i
const hmRetailerId = retailerSlug('h-and-m')
const hmScope = { type: 'online' } as const
const hmPromotionId = 'hm-superbalist-sale'

export function buildSuperbalistHmUrl(page = 1): string {
  const url = new URL('/browse', SUPERBALIST_HM_ORIGIN)
  url.searchParams.set('designer_s[0]', 'hm')
  url.searchParams.set('min_discount', '1')
  url.searchParams.set('page', String(Math.max(1, Math.trunc(page) || 1)))
  return url.toString()
}

export function decodeSuperbalistProductList(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Superbalist response exceeded the decoder limit')
  }

  const raw = PRODUCT_LIST_PATTERN.exec(body)?.[1]

  if (!raw) {
    throw new TypeError('Invalid Superbalist product list')
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new TypeError('Invalid Superbalist product list')
  }
}

export function parseSuperbalistHmFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const rows = arrayValue(payload, 'itemListElement')

  if (!recordValue(payload, '@context') && rows.length === 0) {
    const type = textValue(payload, '@type')

    if (type !== 'ItemList') {
      throw new TypeError('Invalid Superbalist H&M feed payload')
    }
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const product = recordValue(row, 'item')
    const brand = recordValue(product, 'brand')
    const offers = recordValue(product, 'offers')
    const specification = recordValue(offers, 'priceSpecification')
    const productId = textValue(product, 'sku')
    const title = textValue(product, 'name')
    const priceCents = randToCents(offers?.price)
    const previousPriceCents = randToCents(specification?.price)
    const productUrl = officialUrl(
      textValue(product, 'url') || textValue(offers, 'url'),
      SUPERBALIST_HM_ORIGIN,
      SUPERBALIST_HOSTS,
    )

    if (
      textValue(brand, 'name').toUpperCase() !== 'H&M' ||
      textValue(specification, 'priceType') !== 'StrikethroughPrice' ||
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      previousPriceCents === undefined ||
      previousPriceCents <= priceCents ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: hmPromotionId,
        scope: hmScope,
        sourceId: productId,
      }),
      imageUrl: officialUrl(
        textValue(product, 'image'),
        SUPERBALIST_HM_ORIGIN,
        SUPERBALIST_IMAGE_HOSTS,
      ),
      previousPriceCents,
      priceCents,
      productId,
      productUrl,
      promotionId: hmPromotionId,
      retailerId: hmRetailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      soldOut: textValue(offers, 'availability') === 'OutOfStock' || undefined,
      scope: hmScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: rows.length }
}
