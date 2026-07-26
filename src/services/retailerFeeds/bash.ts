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
  percentOffText,
  recordValue,
  textValue,
} from './values'

export interface BashStorefront {
  name: string
  path: string
  retailerId: RetailerSlug
  storeKey: string
}

export const BASH_ORIGIN = 'https://bash.com'
export const BASH_PAGE_SIZE = 30
const MAX_HTML_BYTES = 6 * 1024 * 1024
const NEXT_DATA_PATTERN =
  /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
const bashScope = { type: 'online' } as const

export const BASH_STOREFRONTS: readonly BashStorefront[] = [
  {
    name: 'Sportscene',
    path: '/sportscene/offers-sale',
    retailerId: retailerSlug('sportscene'),
    storeKey: 'sportscene',
  },
  {
    name: 'Totalsports',
    path: '/totalsports/offers-sale/sale',
    retailerId: retailerSlug('totalsports'),
    storeKey: 'totalsports',
  },
  {
    name: 'Archive',
    path: '/archive/offers-sale',
    retailerId: retailerSlug('archive'),
    storeKey: 'archive',
  },
  {
    name: 'Sneaker Factory',
    path: '/sneaker-factory/deals',
    retailerId: retailerSlug('sneaker-factory'),
    storeKey: 'sneaker-factory',
  },
]

export function buildBashSaleUrl(shop: BashStorefront, page = 1): string {
  const url = new URL(shop.path, BASH_ORIGIN)
  url.searchParams.set('page', String(Math.max(1, Math.trunc(page) || 1)))
  return url.toString()
}

export function decodeBashNextData(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Bash response exceeded the decoder limit')
  }

  const raw = NEXT_DATA_PATTERN.exec(body)?.[1]

  if (!raw) {
    throw new TypeError('Invalid Bash sale response')
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new TypeError('Invalid Bash sale response')
  }
}

export function parseBashFeed(
  payload: unknown,
  context: RetailerFeedContext,
  shop: BashStorefront,
): RetailerFeedPage {
  const fallback = nestedRecord(payload, ['props', 'pageProps', 'fallback'])
  const data = fallback && findSearchData(fallback, shop.storeKey)
  const items = data && Array.isArray(data.items) ? data.items : undefined

  if (!data || !items) {
    throw new TypeError('Invalid Bash feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()
  const promotionId = `bash-${shop.storeKey}-sale`

  for (const item of items) {
    const productId = textValue(item, 'vtexId') || textValue(item, 'id')
    const title = textValue(item, 'name')
    const priceCents = centsValue(item, 'sellingPrice')
    const previousPriceCents = centsValue(item, 'retailPrice')
    const productUrl = bashProductUrl(textValue(item, 'path'))

    if (
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
        promotionMarker: promotionId,
        scope: bashScope,
        sourceId: productId,
      }),
      imageUrl: bashImage(item),
      previousPriceCents,
      priceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: shop.retailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: bashScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const page = safePositiveInteger(data.page)
  const pages = safePositiveInteger(data.pages)
  const totalCount = safeNonNegativeInteger(data.total)

  return {
    candidates,
    catalogues: [],
    nextCursor: page !== undefined && pages !== undefined && page < pages
      ? { kind: 'page', page }
      : undefined,
    totalCount,
  }
}

function findSearchData(
  fallback: Record<string, unknown>,
  storeKey: string,
): Record<string, unknown> | undefined {
  for (const [key, value] of Object.entries(fallback)) {
    const data = recordValue(value, 'data')

    if (
      key.startsWith('/search?') &&
      key.includes(`store:${storeKey}`) &&
      data
    ) {
      return data
    }
  }

  return undefined
}

function bashProductUrl(path: string): string | undefined {
  if (!path) {
    return undefined
  }

  try {
    const url = new URL(path, BASH_ORIGIN)
    return url.protocol === 'https:' && url.hostname === 'bash.com'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function bashImage(item: unknown): string | undefined {
  for (const asset of arrayValue(item, 'assets')) {
    const sizes = recordValue(asset, 'sizes')

    for (const key of ['full', 'thumbnail', 'tiny']) {
      const value = textValue(sizes, key)

      try {
        const url = new URL(value)

        if (
          url.protocol === 'https:' &&
          (url.hostname === 'bash.com' || url.hostname.endsWith('.vtexassets.com'))
        ) {
          return url.toString()
        }
      } catch {
        // Try the next official asset size.
      }
    }
  }

  return undefined
}

function centsValue(value: unknown, key: string): number | undefined {
  return isRecord(value) ? safePositiveInteger(value[key]) : undefined
}

function safePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

function safeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function nestedRecord(
  value: unknown,
  path: readonly string[],
): Record<string, unknown> | undefined {
  let current = value

  for (const key of path) {
    const nested = recordValue(current, key)

    if (!nested) {
      return undefined
    }

    current = nested
  }

  return current as Record<string, unknown>
}
