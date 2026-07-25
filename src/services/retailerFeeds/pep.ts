import {
  buildRetailerEvidence,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  isRecord,
  officialUrl,
  randToCents,
  textValue,
} from './values'

// PEP runs a Shopify storefront, but not one markdown: `compare_at_price` is
// "0.00" on every product in the catalogue. Its discounts live in the titles of
// collections instead — "Get 20% off Cookware", "Buy any 2 lined curtains and
// save 20%" — with the products listed at their ordinary shelf price.
//
// So a PEP deal is the promotion, not a price cut, and it is published that
// way: the real price, the offer in the shop's own words, and no was-price.
// Nothing here can say whether R199.99 is charged before or after the 20% comes
// off, and on the "buy any 2" offers it is plainly before, so inventing a
// was-price would invent a saving the shopper may not get.

export const PEP_ORIGIN = 'https://www.pepstores.com'
export const PEP_COLLECTIONS_URL = `${PEP_ORIGIN}/collections.json?limit=250`
export const PEP_MAX_PROMOTIONS = 40

// A source gets one request per sweep, and PEP has around a dozen promotions,
// so walking them one at a time would take a day and a half to show a shopper
// the whole shop. Sharding splits the promotions across several sources that
// sweep side by side, which brings that down to a few hours.
export const PEP_SHARD_COUNT = 6

const PEP_HOSTS = ['pepstores.com', 'www.pepstores.com']
const PEP_IMAGE_HOSTS = ['cdn.shopify.com', ...PEP_HOSTS]

const pepRetailerId = retailerSlug('pep')
const pepScope = { type: 'online' } as const

// A collection is only a promotion when its own title says what comes off. The
// catalogue is mostly plain aisles ("Baby Boys - Tops"), and publishing one of
// those as a deal would be a lie of omission.
const PERCENT_OFF = /(\d{1,2})\s*%\s*off/i
const SAVE_PERCENT = /save\s*(?:up\s*to\s*)?(\d{1,2})\s*%/i
const SAVE_RAND = /save\s*R\s?(\d{1,4})(?!\d)/i

export interface PepPromotion {
  handle: string
  savingText: string
  title: string
}

export function buildPepCollectionProductsUrl(handle: string): string {
  return `${PEP_ORIGIN}/collections/${encodeURIComponent(handle)}/products.json?limit=250`
}

/// Reads the offer out of a collection title, or nothing when the title only
/// names an aisle.
export function readPepSaving(title: string): string | undefined {
  const percent = PERCENT_OFF.exec(title) ?? SAVE_PERCENT.exec(title)

  if (percent) {
    return `${percent[1]}% off`
  }

  const rand = SAVE_RAND.exec(title)
  return rand ? `Save R${rand[1]}` : undefined
}

export function parsePepCollections(payload: unknown, shardIndex = 0): PepPromotion[] {
  const collections = isRecord(payload) ? payload.collections : undefined

  if (!Array.isArray(collections)) {
    throw new TypeError('Invalid PEP collections payload')
  }

  const found: PepPromotion[] = []
  const seen = new Set<string>()

  for (const collection of collections) {
    const handle = textValue(collection, 'handle')
    const title = textValue(collection, 'title')
    const savingText = title ? readPepSaving(title) : undefined

    if (!handle || !title || !savingText || seen.has(handle)) {
      continue
    }

    seen.add(handle)
    found.push({ handle, savingText, title })

    if (found.length >= PEP_MAX_PROMOTIONS) {
      break
    }
  }

  // Dealt round-robin, so every shard gets a share even when the shop is
  // running fewer promotions than there are shards.
  return found.filter((_, index) => index % PEP_SHARD_COUNT === shardIndex)
}

export function parsePepFeed(
  payload: unknown,
  context: RetailerFeedContext,
  promotion: PepPromotion,
): RetailerFeedPage {
  const products = isRecord(payload) ? payload.products : undefined

  if (!Array.isArray(products)) {
    throw new TypeError('Invalid PEP feed payload')
  }

  const promotionId = `pep-${promotion.handle}`
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const product of products) {
    const handle = textValue(product, 'handle')
    const title = textValue(product, 'title')
    const variant = firstSellableVariant(product)
    const priceCents = randToCents(isRecord(variant) ? variant.price : undefined)
    // A markdown would be welcome if PEP ever sets one, but "0.00" is how this
    // storefront writes "no previous price", so it must not become a saving.
    const previousCents = randToCents(
      isRecord(variant) ? variant.compare_at_price : undefined,
    )
    const productUrl = handle
      ? officialUrl(`/products/${handle}`, PEP_ORIGIN, PEP_HOSTS)
      : undefined
    const productId = textValue(variant, 'sku') || handle

    if (!productId || !title || !productUrl || priceCents === undefined || seen.has(productId)) {
      continue
    }

    seen.add(productId)

    const previousPriceCents =
      previousCents !== undefined && previousCents > priceCents ? previousCents : undefined

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: promotionId,
        scope: pepScope,
        sourceId: productId,
      }),
      imageUrl: pepImageUrl(product),
      priceCents,
      previousPriceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: pepRetailerId,
      savingText: promotion.savingText,
      scope: pepScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      // The shop's own wording, which carries any condition attached to the
      // offer — "buy any 2" is a very different deal from a flat 20% off.
      termsText: promotion.title,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: products.length }
}

interface PepCollectionCursor {
  index: number
  promotions: PepPromotion[]
}

export function encodePepCursor(cursor: PepCollectionCursor): string {
  return JSON.stringify({
    i: cursor.index,
    p: cursor.promotions.map((promotion) => [promotion.handle, promotion.title]),
  })
}

export function decodePepCursor(token: string): PepCollectionCursor | undefined {
  try {
    const parsed = JSON.parse(token) as unknown

    if (!isRecord(parsed) || !Array.isArray(parsed.p)) {
      return undefined
    }

    const promotions: PepPromotion[] = []

    for (const entry of parsed.p) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
        continue
      }

      const savingText = readPepSaving(entry[1])

      if (savingText) {
        promotions.push({ handle: entry[0], savingText, title: entry[1] })
      }
    }

    const index = Number(parsed.i)

    if (promotions.length === 0 || !Number.isSafeInteger(index) || index < 0) {
      return undefined
    }

    return { index, promotions }
  } catch {
    return undefined
  }
}

// Shopify keeps sold-out variants in the feed, so the first variant a shopper
// could actually buy is preferred, falling back to the first listed one so a
// whole-product sell-out still carries its price.
function firstSellableVariant(product: unknown): unknown {
  const variants = isRecord(product) ? product.variants : undefined

  if (!Array.isArray(variants) || variants.length === 0) {
    return undefined
  }

  return variants.find((variant) => isRecord(variant) && variant.available === true) ?? variants[0]
}

function pepImageUrl(product: unknown): string | undefined {
  const images = isRecord(product) ? product.images : undefined
  const source = Array.isArray(images) ? textValue(images[0], 'src') : undefined

  return source ? officialUrl(source, PEP_ORIGIN, PEP_IMAGE_HOSTS) : undefined
}
