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
  percentOffText,
  randToCents,
  textValue,
} from './values'

// Evetech is a Next.js App Router storefront: the specials listing ships no
// product markup, only the React Server Component payload streamed through
// `self.__next_f.push([1, "<chunk>"])` calls. Each call carries a JSON string
// fragment; concatenating them in document order rebuilds the payload, which
// embeds the same `products` array the client renders from.
//
// OldPrice is Evetech's own was-price, so it is the only source of a strike
// through here. Items where it is missing or not above the selling price are
// full price and are dropped.

export const EVETECH_ORIGIN = 'https://www.evetech.co.za'
export const EVETECH_SPECIALS_URL = `${EVETECH_ORIGIN}/amd-laptops-on-special/l/682`

const EVETECH_HOSTS = ['evetech.co.za', 'www.evetech.co.za']
const EVETECH_IMAGE_HOSTS = ['img.evetech.co.za', ...EVETECH_HOSTS]
const MAX_HTML_BYTES = 6 * 1024 * 1024
const RSC_CHUNK_PATTERN = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g
const PRODUCTS_KEY = '"products":'

const evetechRetailerId = retailerSlug('evetech')
const evetechScope = { type: 'online' } as const
const evetechPromotionId = 'evetech-specials'

/** Rebuilds the RSC payload and lifts every `products` array out of it. */
export function decodeEvetechProducts(body: string): unknown {
  if (body.length > MAX_HTML_BYTES) {
    throw new RangeError('Evetech response exceeded the decoder limit')
  }

  const chunks: string[] = []
  for (const match of body.matchAll(RSC_CHUNK_PATTERN)) {
    try {
      chunks.push(JSON.parse(match[1]) as string)
    } catch {
      // A chunk that will not unescape cannot contribute a product.
    }
  }

  const payload = chunks.join('')
  const products: unknown[] = []
  let index = payload.indexOf(PRODUCTS_KEY)

  while (index >= 0) {
    const arrayStart = payload.indexOf('[', index + PRODUCTS_KEY.length)
    const arrayEnd = arrayStart < 0 ? -1 : balancedLiteralEnd(payload, arrayStart)

    if (arrayEnd > 0) {
      try {
        const parsed: unknown = JSON.parse(payload.slice(arrayStart, arrayEnd + 1))
        if (Array.isArray(parsed)) {
          products.push(...parsed)
        }
      } catch {
        // Streamed payloads can cut an array in half; skip that fragment.
      }
    }

    index = payload.indexOf(PRODUCTS_KEY, index + PRODUCTS_KEY.length)
  }

  if (products.length === 0) {
    throw new TypeError('Invalid Evetech server-component response')
  }

  return { products }
}

export function parseEvetechFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.products)) {
    throw new TypeError('Invalid Evetech feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const product of payload.products) {
    const productId = firstText(product, ['ProductId', 'objectID', 'ProductCode'])
    const title = brandedTitle(
      firstText(product, ['Manufacture', 'Brand']),
      firstText(product, ['Name', 'shortName']),
    )
    const productUrl = officialUrl(textValue(product, 'Url'), EVETECH_ORIGIN, EVETECH_HOSTS)
    const priceCents = randToCents(isRecord(product) ? product.PriceIncVat : undefined) ??
      randToCents(isRecord(product) ? product.AppPrice : undefined)
    const oldCents = randToCents(isRecord(product) ? product.OldPrice : undefined)

    if (
      !productId ||
      !title ||
      !productUrl ||
      priceCents === undefined ||
      oldCents === undefined ||
      oldCents <= priceCents ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents: oldCents,
        promotionMarker: evetechPromotionId,
        scope: evetechScope,
        sourceId: productId,
      }),
      imageUrl: officialUrl(
        textValue(product, 'ProductImage'),
        EVETECH_ORIGIN,
        EVETECH_IMAGE_HOSTS,
      ),
      priceCents,
      previousPriceCents: oldCents,
      productId,
      productUrl,
      promotionId: evetechPromotionId,
      retailerId: evetechRetailerId,
      savingText: percentOffText(priceCents, oldCents),
      scope: evetechScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: payload.products.length }
}
