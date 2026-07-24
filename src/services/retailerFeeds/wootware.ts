import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import {
  balancedLiteralEnd,
  brandedTitle,
  firstText,
  isRecord,
  officialUrl,
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

const WOOTWARE_HOSTS = ['wootware.co.za', 'www.wootware.co.za']
const WOOTWARE_IMAGE_HOSTS = ['media.wootware.co.za', ...WOOTWARE_HOSTS]
const MAX_HTML_BYTES = 6 * 1024 * 1024
const ITEMS_KEY = '"items"'

const wootwareRetailerId = retailerSlug('wootware')
const wootwareScope = { type: 'online' } as const
const wootwarePromotionId = 'open-box-specials'

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

  return { items }
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

  return { candidates, catalogues: [], totalCount: payload.items.length }
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
