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
  firstText,
  isRecord,
  officialUrl,
  percentOffText,
  randToCents,
  recordValue,
  textValue,
} from './values'

// Bob Shop's home page embeds one `<script type="application/json">` block per
// product card, each a complete listing record. The page carries Shopify-style
// image URLs from its sellers, which makes it look like a Shopify storefront;
// it is not, and none of the Shopify JSON endpoints answer. These embedded
// blocks are the real feed.
//
// `amount` is what the card charges and `recommendedRetailPrice` is the
// seller's stated RRP. Most listings carry no RRP at all, and
// `discountPercentage` is frequently 0 even where an RRP is present, so a
// listing only becomes a deal when the RRP is genuinely above the price.

export const BOBSHOP_ORIGIN = 'https://www.bobshop.co.za'
export const BOBSHOP_HOME_URL = `${BOBSHOP_ORIGIN}/`

const BOBSHOP_HOSTS = ['bobshop.co.za', 'www.bobshop.co.za']
const BOBSHOP_IMAGE_HOSTS = ['img.bobshop.co.za', ...BOBSHOP_HOSTS]
const MAX_HTML_BYTES = 6 * 1024 * 1024
const JSON_SCRIPT_PATTERN =
  /<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
const PRODUCT_PATH_ID = /\/p\/(\d{1,20})(?:$|[/?#])/

const bobshopRetailerId = retailerSlug('bobshop')
const bobshopScope = { type: 'online' } as const
const bobshopPromotionId = 'bobshop-featured'

const listingTypeLabels: Record<string, string> = {
  BUY_NOW: 'Buy Now',
  CLASSIFIED: 'Classified',
  ENGLISH_AUCTION: 'Auction',
  FIXED_PRICE: 'Buy Now',
}

export function decodeBobshopProductCards(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Bob Shop response exceeded the decoder limit')
  }

  const cards: unknown[] = []

  for (const match of body.matchAll(JSON_SCRIPT_PATTERN)) {
    try {
      const parsed: unknown = JSON.parse(match[1])
      if (isRecord(parsed) && 'amount' in parsed) {
        cards.push(parsed)
      }
    } catch {
      // Not every embedded JSON block on the page is a product card.
    }
  }

  if (cards.length === 0) {
    throw new TypeError('Invalid Bob Shop card response')
  }

  return { cards }
}

export function parseBobshopFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.cards)) {
    throw new TypeError('Invalid Bob Shop feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const card of payload.cards) {
    const productUrl = officialUrl(textValue(card, 'url'), BOBSHOP_ORIGIN, BOBSHOP_HOSTS)
    const productId = textValue(card, 'tradeId') ||
      PRODUCT_PATH_ID.exec(productUrl ?? '')?.[1] ||
      ''
    const title = textValue(card, 'title')
    const priceCents = randToCents(isRecord(card) ? card.amount : undefined)
    const retailCents = randToCents(
      isRecord(card) ? card.recommendedRetailPrice : undefined,
    )
    const validFrom = bobshopInstant(card, 'openTime')
    const validTo = bobshopInstant(card, 'closeTime')

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      // Without an RRP above the asking price there is no saving to show.
      retailCents === undefined ||
      retailCents <= priceCents ||
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
        previousPriceCents: retailCents,
        promotionMarker: bobshopPromotionId,
        scope: bobshopScope,
        sourceId: productId,
        validFrom,
        validTo,
      }),
      imageUrl: bobshopImageUrl(card),
      priceCents,
      previousPriceCents: retailCents,
      productId,
      productUrl,
      promotionId: bobshopPromotionId,
      retailerId: bobshopRetailerId,
      savingText: percentOffText(priceCents, retailCents, quotedPercent(card)),
      scope: bobshopScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      termsText: listingTerms(card),
      title,
      validFrom,
      validTo,
    })
  }

  return { candidates, catalogues: [], totalCount: payload.cards.length }
}

function quotedPercent(card: unknown): number | undefined {
  const percent = Number(isRecord(card) ? card.discountPercentage : undefined)
  return Number.isFinite(percent) && percent > 0 ? percent : undefined
}

// Bob Shop is a marketplace, so who is selling and whether the listing is an
// auction changes what the price actually means to a shopper.
function listingTerms(card: unknown): string | undefined {
  const listingType = textValue(card, 'type').toLocaleUpperCase()
  const label = listingTypeLabels[listingType] ?? 'Marketplace'
  const seller = textValue(recordValue(card, 'seller'), 'userAlias') ||
    textValue(card, 'userAlias')

  return seller ? `${label} listing from ${seller}` : `${label} listing`
}

function bobshopImageUrl(card: unknown): string | undefined {
  for (const image of arrayValue(card, 'images')) {
    const url = officialUrl(
      firstText(image, ['image', 'thumbnail_medium', 'thumbnail']),
      BOBSHOP_ORIGIN,
      BOBSHOP_IMAGE_HOSTS,
    )

    if (url) {
      return url
    }
  }

  return undefined
}

// Listing windows arrive as "2026-07-26T23:45:00+02:00".
function bobshopInstant(card: unknown, key: string): string | undefined {
  const value = textValue(card, key)

  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    return undefined
  }

  return value
}
