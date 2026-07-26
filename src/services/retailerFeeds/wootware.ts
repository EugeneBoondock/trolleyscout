import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  FeedCursor,
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  balancedLiteralEnd,
  brandedTitle,
  firstText,
  integerValue,
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  textValue,
} from './values'

// Wootware's open-box listing renders its product grid client-side, but the
// page also emits a GA4 `dataLayer` block describing every item on it. That
// block is plain JSON and carries both the selling price and the saving.
//
// THE RULE THAT MATTERS: GA4 `discount` is a RAND AMOUNT OFF, not a
// percentage and not a was-price. The previous price is therefore
// price + discount. An item with no discount is full price and is dropped
// rather than published with a fabricated strike through.
//
// Cloudflare intermittently answers scheduled requests with a 403 interstitial.
// That is a transient fetch failure the scout already records per source; this
// decoder only ever sees a body that got through.

export const WOOTWARE_ORIGIN = 'https://www.wootware.co.za'
export const WOOTWARE_SPECIALS_URL =
  `${WOOTWARE_ORIGIN}/computer-hardware/open-box-reburbished-specials`
export const WOOTWARE_SEARCH_URL =
  'https://ZWADJY9VJG-dsn.algolia.net/1/indexes/production_products_index/query'
export const WOOTWARE_PAGE_SIZE = 100
export const MAX_WOOTWARE_PAGES = 5

const WOOTWARE_HOSTS = ['wootware.co.za', 'www.wootware.co.za']
const WOOTWARE_IMAGE_HOSTS = ['media.wootware.co.za', ...WOOTWARE_HOSTS]
const MAX_HTML_BYTES = 6 * 1024 * 1024
const ITEMS_KEY = '"items"'

const wootwareRetailerId = retailerSlug('wootware')
const wootwareScope = { type: 'online' } as const
const wootwarePromotionId = 'open-box-specials'

export function buildWootwareSpecialsUrl(page = 1): string {
  const safePage = Math.max(1, Math.min(20, Math.trunc(page) || 1))
  return safePage === 1 ? WOOTWARE_SPECIALS_URL : `${WOOTWARE_SPECIALS_URL}?p=${safePage}`
}

export interface WootwareSearchRequest {
  init: RequestInit
  url: string
}

export function buildWootwareSearchRequest(page = 0): WootwareSearchRequest {
  const safePage = Math.max(
    0,
    Math.min(MAX_WOOTWARE_PAGES - 1, Math.trunc(page) || 0),
  )

  return {
    init: {
      body: JSON.stringify({
        facetFilters: [[
          'Stock Condition:Open Box',
          'Stock Condition:Refurbished',
        ]],
        hitsPerPage: WOOTWARE_PAGE_SIZE,
        page: safePage,
        query: '',
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-algolia-api-key': '5336148ad5ab645a9a76da689315dabd',
        'x-algolia-application-id': 'ZWADJY9VJG',
      },
      method: 'POST',
    },
    url: WOOTWARE_SEARCH_URL,
  }
}

export function parseWootwareSearchFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const hits = isRecord(payload) && Array.isArray(payload.hits)
    ? payload.hits
    : undefined
  const pageNumber = integerValue(payload, 'page')
  const pageCount = integerValue(payload, 'nbPages')
  const totalCount = integerValue(payload, 'nbHits')

  if (
    !hits ||
    pageNumber === undefined ||
    pageCount === undefined ||
    totalCount === undefined
  ) {
    throw new TypeError('Invalid Wootware search response')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const hit of hits) {
    const productId = firstText(hit, ['objectID', 'ProductId', 'Sku'])
    const title = textValue(hit, 'Name')
    const priceCents = randToCents(isRecord(hit) ? hit.CurrentPrice : undefined)
    const previousPriceCents = randToCents(
      isRecord(hit) ? hit.OriginalPrice : undefined,
    )

    if (
      !productId ||
      !title ||
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
        promotionMarker: wootwarePromotionId,
        scope: wootwareScope,
        sourceId: productId,
      }),
      imageUrl: officialUrl(
        textValue(hit, 'ThumbnailUrl'),
        WOOTWARE_ORIGIN,
        WOOTWARE_IMAGE_HOSTS,
      ),
      priceCents,
      previousPriceCents,
      productId,
      productUrl: officialUrl(
        textValue(hit, 'Url'),
        WOOTWARE_ORIGIN,
        WOOTWARE_HOSTS,
      ) ?? context.sourceUrl,
      promotionId: wootwarePromotionId,
      retailerId: wootwareRetailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: wootwareScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const nextCursor: FeedCursor | undefined =
    pageNumber + 1 < pageCount && pageNumber + 1 < MAX_WOOTWARE_PAGES
      ? { kind: 'page', page: pageNumber + 1 }
      : undefined

  return { candidates, catalogues: [], nextCursor, totalCount }
}

/** Lifts every GA4 `items` array of product entries out of the page. */
export function decodeWootwareDataLayer(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Wootware response exceeded the decoder limit')
  }

  const items: unknown[] = []
  let index = body.indexOf(ITEMS_KEY)

  while (index >= 0) {
    const arrayStart = body.indexOf('[', index + ITEMS_KEY.length)
    const separator = body.slice(index + ITEMS_KEY.length, arrayStart < 0 ? undefined : arrayStart)
    const arrayEnd = arrayStart < 0 || !/^\s*:\s*$/.test(separator)
      ? -1
      : balancedLiteralEnd(body, arrayStart)

    if (arrayEnd > 0) {
      try {
        const parsed: unknown = JSON.parse(body.slice(arrayStart, arrayEnd + 1))
        if (Array.isArray(parsed)) {
          items.push(...parsed.filter(isProductItem))
        }
      } catch {
        // Not every "items": [...] on the page is JSON the parser can read.
      }
    }

    index = body.indexOf(ITEMS_KEY, index + ITEMS_KEY.length)
  }

  if (items.length === 0) {
    throw new TypeError('Invalid Wootware dataLayer response')
  }

  const cards = decodeProductCards(body)
  const enrichedItems = items.map((item) => {
    const card = cards.get(normalizedTitle(textValue(item, 'item_name')))
    return card && isRecord(item)
      ? { ...item, item_image: card.imageUrl, item_url: card.productUrl }
      : item
  })

  return { items: enrichedItems, nextPage: decodeNextPage(body) }
}

export function parseWootwareFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new TypeError('Invalid Wootware feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const item of payload.items) {
    const productId = firstText(item, ['item_id', 'item_sku', 'id'])
    const title = brandedTitle(textValue(item, 'item_brand'), textValue(item, 'item_name'))
    const priceCents = randToCents(isRecord(item) ? item.price : undefined)
    const discountCents = randToCents(isRecord(item) ? item.discount : undefined)

    if (
      !productId ||
      !title ||
      priceCents === undefined ||
      // No rands off means no deal to publish.
      discountCents === undefined ||
      seen.has(productId)
    ) {
      continue
    }

    // Rands off, so the previous price is the sum, never the discount itself.
    const previousPriceCents = priceCents + discountCents
    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: wootwarePromotionId,
        scope: wootwareScope,
        sourceId: productId,
      }),
      imageUrl: officialUrl(
        firstText(item, ['item_image', 'image', 'item_thumbnail']),
        WOOTWARE_ORIGIN,
        WOOTWARE_IMAGE_HOSTS,
      ),
      priceCents,
      previousPriceCents,
      productId,
      // GA4 items carry no product link, so a shopper is sent to the listing
      // the item was read from rather than to a guessed product path.
      productUrl: wootwareProductUrl(item) ?? context.sourceUrl,
      promotionId: wootwarePromotionId,
      retailerId: wootwareRetailerId,
      savingText: `Save R${(discountCents / 100).toFixed(2)}`,
      scope: wootwareScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const nextPage = Number(payload.nextPage)

  return {
    candidates,
    catalogues: [],
    nextCursor: Number.isSafeInteger(nextPage) && nextPage > 1 && nextPage <= 20
      ? { kind: 'page', page: nextPage }
      : undefined,
    totalCount: payload.items.length,
  }
}

function decodeProductCards(
  body: string,
): Map<string, { imageUrl?: string; productUrl?: string }> {
  const cards = new Map<string, { imageUrl?: string; productUrl?: string }>()
  const headingPattern =
    /<h2\b[^>]*\bclass=["'][^"']*\bproduct-name\b[^"']*["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = headingPattern.exec(body)) !== null) {
    const end = body.indexOf('</li>', match.index)
    const card = body.slice(match.index, end < 0 ? match.index + 6_000 : end)
    const anchor = /<a\b[^>]*>/i.exec(card)?.[0] ?? ''
    const href = /\bhref=["']([^"']+)["']/i.exec(anchor)?.[1] ?? ''
    const title = /\btitle=["']([^"']*)["']/i.exec(anchor)?.[1] ?? ''
    const image =
      /\bdata-srcset=["']([^"']+)["']/i.exec(card)?.[1] ??
      /\bdata-src=["']([^"']+)["']/i.exec(card)?.[1] ??
      ''
    const key = normalizedTitle(decodeHtmlText(title))

    if (!key || cards.has(key)) {
      continue
    }

    cards.set(key, {
      imageUrl: officialUrl(image, WOOTWARE_ORIGIN, WOOTWARE_IMAGE_HOSTS),
      productUrl: officialUrl(href, WOOTWARE_ORIGIN, WOOTWARE_HOSTS),
    })
  }

  return cards
}

function decodeNextPage(body: string): number | undefined {
  const linkPattern = /<link\b[^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(body)) !== null) {
    if (!/\brel=["']next["']/i.test(match[0])) {
      continue
    }

    const href = /\bhref=["']([^"']+)["']/i.exec(match[0])?.[1]

    try {
      const url = new URL(href ?? '', WOOTWARE_ORIGIN)
      const page = Number(url.searchParams.get('p'))
      return Number.isSafeInteger(page) && page > 1 && page <= 20
        ? page
        : undefined
    } catch {
      return undefined
    }
  }

  return undefined
}

function normalizedTitle(value: string): string {
  return decodeHtmlText(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
}

function wootwareProductUrl(item: unknown): string | undefined {
  return officialUrl(
    firstText(item, ['item_url', 'url', 'link']),
    WOOTWARE_ORIGIN,
    WOOTWARE_HOSTS,
  )
}

function isProductItem(value: unknown): boolean {
  return isRecord(value) && 'item_id' in value && 'price' in value
}
