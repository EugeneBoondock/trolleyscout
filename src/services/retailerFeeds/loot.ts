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
  arrayValue,
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

// Loot's sale page is a Next.js pages-router route, so the whole rendered
// state sits in the `__NEXT_DATA__` script tag. The sale category splits its
// products across several featured-content blocks (one per rail), so they are
// collected across every block rather than read from the first.
//
// `listPrice` is Loot's recommended retail price and `price` is what a shopper
// pays; the two are equal on full-price stock, so only a genuinely higher
// listPrice becomes a was-price.

export const LOOT_ORIGIN = 'https://www.loot.co.za'
export const LOOT_SALE_URL = `${LOOT_ORIGIN}/sale`

const LOOT_HOSTS = ['loot.co.za', 'www.loot.co.za']
const LOOT_IMAGE_HOSTS = ['media.loot.co.za', ...LOOT_HOSTS]
const MAX_HTML_BYTES = 6 * 1024 * 1024
const NEXT_DATA_PATTERN =
  /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i

const lootRetailerId = retailerSlug('loot')
const lootScope = { type: 'online' } as const
const lootPromotionId = 'loot-sale'

export function decodeLootNextData(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Loot response exceeded the decoder limit')
  }

  const match = NEXT_DATA_PATTERN.exec(body)

  if (!match) {
    throw new TypeError('Invalid Loot sale response')
  }

  try {
    return JSON.parse(match[1]) as unknown
  } catch {
    throw new TypeError('Invalid Loot sale response')
  }
}

export function parseLootFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  const category = nestedRecord(payload, [
    'props',
    'pageProps',
    'initialProps',
    'category',
  ])
  const blocks = category ? arrayValue(category, 'featuredContent') : undefined

  if (!blocks) {
    throw new TypeError('Invalid Loot feed payload')
  }

  const products = blocks.flatMap((block) => arrayValue(block, 'products'))
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const product of products) {
    const productId = textValue(product, 'code')
    const title = textValue(product, 'fullTitle') || textValue(product, 'name')
    const productUrl = lootProductUrl(product)
    const priceCents = randToCents(isRecord(product) ? product.price : undefined)
    const listCents = randToCents(isRecord(product) ? product.listPrice : undefined)
    const validTo = lootDealEnd(product)

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      listCents === undefined ||
      listCents <= priceCents ||
      seen.has(productId) ||
      !isStructuredDealActive({ capturedAt: context.capturedAt, validTo })
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: listCents,
        promotionMarker: lootPromotionId,
        scope: lootScope,
        sourceId: productId,
        validTo,
      }),
      imageUrl: lootImageUrl(product),
      priceCents,
      previousPriceCents: listCents,
      productId,
      productUrl,
      promotionId: lootPromotionId,
      retailerId: lootRetailerId,
      savingText: percentOffText(priceCents, listCents),
      scope: lootScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
      validTo,
    })
  }

  return { candidates, catalogues: [], totalCount: products.length }
}

// `link.uri` addresses Loot's web service rather than the shop, so the
// shopper-facing `shareLink` is preferred and the slug/code pair is the
// fallback. A /ws/ path is never published as a product link.
function lootProductUrl(product: unknown): string | undefined {
  const slug = textValue(product, 'slug')
  const code = textValue(product, 'code')
  const paths = [
    textValue(recordValue(product, 'shareLink'), 'uri'),
    slug && code ? `/product/${slug}/${code}` : '',
    textValue(recordValue(product, 'link'), 'uri'),
  ]

  for (const path of paths) {
    if (!path || path.startsWith('/ws/')) {
      continue
    }

    const url = officialUrl(path, LOOT_ORIGIN, LOOT_HOSTS)
    if (url) {
      return url
    }
  }

  return undefined
}

// Thumbnails are protocol-relative ("//media.loot.co.za/..."), which
// officialUrl resolves to https.
function lootImageUrl(product: unknown): string | undefined {
  for (const key of ['thumbnail', 'largeThumbnail', 'smallThumbnail']) {
    const url = officialUrl(
      textValue(recordValue(product, key), 'url'),
      LOOT_ORIGIN,
      LOOT_IMAGE_HOSTS,
    )

    if (url) {
      return url
    }
  }

  return undefined
}

// Deal countdowns arrive as epoch milliseconds. They are kept as an exact
// instant rather than a calendar date so no timezone is guessed.
function lootDealEnd(product: unknown): string | undefined {
  const value = Number(isRecord(product) ? product.dealEndDate : undefined)

  if (!Number.isFinite(value) || value <= 0) {
    return undefined
  }

  try {
    return new Date(value).toISOString()
  } catch {
    return undefined
  }
}

function nestedRecord(value: unknown, path: readonly string[]) {
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
