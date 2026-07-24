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
import {
  brandedTitle,
  firstText,
  integerValue,
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

// Decathlon's price-drop listing renders server-side, but the same route
// answers with the search index behind it when asked for JSON
// (?ajax=1&x-requested-with: XMLHttpRequest). That payload carries the two
// prices per hit that the page itself strikes through, so no scraping of
// rendered markup is needed.
//
// The rule that matters: `regular` is a genuine was-price, not the top of a
// variant range, but the listing also carries full-price items whose `regular`
// equals `prix`. Those are not deals and are dropped rather than published
// with an invented saving.

export const DECATHLON_ORIGIN = 'https://www.decathlon.co.za'
export const DECATHLON_PRICES_DROP_URL = `${DECATHLON_ORIGIN}/prices-drop`
// The listing serves a fixed 24 hits per page whatever is asked for.
export const DECATHLON_PAGE_SIZE = 24

const DECATHLON_HOSTS = ['decathlon.co.za', 'www.decathlon.co.za']
const decathlonRetailerId = retailerSlug('decathlon')
const decathlonScope = { type: 'online' } as const
const decathlonPromotionId = 'prices-drop'

export function buildDecathlonPricesDropUrl(page: number): string {
  const url = new URL(DECATHLON_PRICES_DROP_URL)
  url.searchParams.set('ajax', '1')
  url.searchParams.set('page', String(Math.max(1, Math.trunc(page) || 1)))
  return url.toString()
}

export interface DecathlonFeedOptions {
  /** Page this payload was requested for, used when the reply omits it. */
  page?: number
}

export function parseDecathlonFeed(
  payload: unknown,
  context: RetailerFeedContext,
  options: DecathlonFeedOptions = {},
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.resultHits)) {
    throw new TypeError('Invalid Decathlon feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const hit of payload.resultHits) {
    const productId = firstText(hit, ['objectID', 'id_code_model', 'sku'])
    const title = brandedTitle(textValue(hit, 'brand'), textValue(hit, 'product_name'))
    const productUrl = officialUrl(textValue(hit, 'url'), DECATHLON_ORIGIN, DECATHLON_HOSTS)
    const priceCents = randToCents(isRecord(hit) ? hit.prix : undefined)
    const regularCents = randToCents(isRecord(hit) ? hit.regular : undefined)
    const validFrom = decathlonInstant(hit, 'discount_start_date')
    const validTo = decathlonInstant(hit, 'discount_end_date')

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      // A price drop with no higher regular price is just the shelf price.
      regularCents === undefined ||
      regularCents <= priceCents ||
      seen.has(productId) ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validFrom, validTo })
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: regularCents,
        promotionMarker: decathlonPromotionId,
        scope: decathlonScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: decathlonImageUrl(hit),
      priceCents,
      previousPriceCents: regularCents,
      productId,
      productUrl,
      promotionId: decathlonPromotionId,
      retailerId: decathlonRetailerId,
      savingText: percentOffText(priceCents, regularCents, quotedPercent(hit)),
      scope: decathlonScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validFrom,
      validTo,
    })
  }

  const pagination = recordValue(payload, 'pagination')
  const currentPage = integerValue(payload, 'current_page') ?? options.page
  const hasNextPage = typeof pagination?.rel_next === 'string' &&
    pagination.rel_next.length > 0

  return {
    candidates,
    catalogues: [],
    nextCursor: hasNextPage && currentPage !== undefined && currentPage > 0
      ? { kind: 'page', page: currentPage + 1 }
      : undefined,
    totalCount: pagination ? integerValue(pagination, 'total_items') : undefined,
  }
}

function quotedPercent(hit: unknown): number | undefined {
  const percent = Number(isRecord(hit) ? hit.percentoff : undefined)
  return Number.isFinite(percent) && percent > 0 ? percent : undefined
}

function decathlonImageUrl(hit: unknown): string | undefined {
  for (const key of ['image_url', 'thumb_url']) {
    const url = officialUrl(textValue(hit, key), DECATHLON_ORIGIN, [
      'contents.mediadecathlon.com',
      ...DECATHLON_HOSTS,
    ])

    if (url) {
      return url
    }
  }

  return undefined
}

// Discount windows arrive as "2026-07-24T11:10:24+02:00" or as a bare calendar
// date, and are null far more often than not.
function decathlonInstant(hit: unknown, key: string): string | undefined {
  const value = textValue(hit, key)

  if (!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value) || !Number.isFinite(Date.parse(value))) {
    return undefined
  }

  return value
}
