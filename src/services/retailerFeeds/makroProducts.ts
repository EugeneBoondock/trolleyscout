import {
  buildRetailerEvidence,
  retailerSlug,
} from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import { isRecord, officialUrl } from './values'

// Makro South Africa runs on Flipkart's commerce platform, so its catalogue is
// nowhere in the page — the storefront is a 15KB shell that assembles itself in
// the browser, which is why the shop appeared to have thirty-four leaflets and
// nothing else while it was in fact running thousands of markdowns.
//
// The catalogue comes from one POST, and the only thing standing in front of it
// is a header. Without `x-user-agent` the endpoint answers 403; with the
// platform's own value it answers in full.
//
// One trap, and it is a bad one to miss: every price is labelled INR. Flipkart
// hardcodes its home currency and Makro never overrode it. The amounts are
// rands — R7,289 against R9,999 on the laptop this was read from — so the
// currency field is deliberately ignored rather than believed.

export const MAKRO_ORIGIN = 'https://www.makro.co.za'
export const MAKRO_PAGE_FETCH_URL = `${MAKRO_ORIGIN}/fccng/api/4/page/fetch`

/// The platform refuses any client that does not name itself this way.
export const MAKRO_CLIENT_HEADER = 'Mozilla/5.0 FKUA/website/42/website/Desktop'

// Makro's own department pages. Each is one request and carries its slice of
// the catalogue, so they are swept side by side rather than one per sweep.
// Taken from Makro's own navigation and each verified to answer with priced
// products. Guessed paths answer 200 with an empty page rather than a 404, so
// a plausible-looking department that returns nothing is indistinguishable
// from a working one until you count what came back.
//
// Between them these carried 776 products with 406 markdowns when read.
export const MAKRO_DEPARTMENTS = [
  '/weekly-deals-store',
  '/more4less-store',
  '/load-up-store',
  '/pantry-store',
  '/liquor-store',
  '/televisions-store',
  '/laptops-printers-store',
  '/fridges-freezers-store',
  '/washers-dryers-store',
  '/cellular-store',
  '/baby-kids-store',
  '/best-of-electronics-store',
] as const

const MAKRO_HOSTS = ['makro.co.za', 'www.makro.co.za']
const makroRetailerId = retailerSlug('makro')
const makroScope = { type: 'online' } as const
const MAX_MAKRO_DEALS = 300

export function buildMakroPageRequest(pageUri: string): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify({ pageUri }),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-user-agent': MAKRO_CLIENT_HEADER,
    },
  }
}

export function parseMakroProductFeed(
  payload: unknown,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (!isRecord(payload) || !isRecord(payload.RESPONSE)) {
    throw new TypeError('Invalid Makro feed payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  // Products sit under a widget's renderable components, and the platform moves
  // that nesting about between page types. Walking for the shape rather than a
  // fixed path means a rearranged page still yields its catalogue.
  for (const product of collectPricedProducts(payload.RESPONSE)) {
    if (candidates.length >= MAX_MAKRO_DEALS) {
      break
    }

    const pricing = isRecord(product.pricing) ? product.pricing : undefined
    const priceCents = decimalToCents(recordField(pricing, 'finalPrice', 'decimalValue'))
    const mrpCents = decimalToCents(recordField(pricing, 'mrp', 'decimalValue'))
    const title = firstString(recordValue(product, 'titles'), 'title')
    const productId = firstString(product, 'id')
    const productUrl = officialUrl(
      // The platform hands these out over plain http; the shop itself is https.
      String(firstString(product, 'smartUrl') ?? '').replace(/^http:\/\//i, 'https://'),
      MAKRO_ORIGIN,
      MAKRO_HOSTS,
    )

    if (
      !title ||
      !productId ||
      !productUrl ||
      priceCents === undefined ||
      seen.has(productId)
    ) {
      continue
    }

    seen.add(productId)

    const previousPriceCents = mrpCents !== undefined && mrpCents > priceCents ? mrpCents : undefined

    // Only a stated out-of-stock counts. Anything else the platform might say
    // is left unread rather than guessed into a badge.
    const soldOut =
      firstString(recordValue(product, 'availability'), 'displayState') === 'OUT_OF_STOCK'

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: 'makro-catalogue',
        scope: makroScope,
        sourceId: productId,
      }),
      imageUrl: makroImage(product),
      priceCents,
      previousPriceCents,
      productId,
      productUrl,
      promotionId: 'makro-catalogue',
      retailerId: makroRetailerId,
      scope: makroScope,
      ...(soldOut ? { soldOut: true } : {}),
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [] }
}

function collectPricedProducts(root: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const queue: unknown[] = [root]
  let visited = 0

  while (queue.length > 0 && visited < 200_000 && found.length < MAX_MAKRO_DEALS) {
    const node = queue.shift()
    visited += 1

    if (Array.isArray(node)) {
      queue.push(...node)
      continue
    }

    if (!isRecord(node)) {
      continue
    }

    if (isRecord(node.pricing) && isRecord(node.pricing.finalPrice)) {
      found.push(node)
      continue
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        queue.push(value)
      }
    }
  }

  return found
}

// Image URLs arrive as templates: the platform leaves {@width}, {@height} and
// {@quality} for its own client to fill in, and a URL still carrying them is
// not an image anybody can load.
function makroImage(product: Record<string, unknown>): string | undefined {
  const media = recordValue(product, 'media')
  const images = media && Array.isArray(media.images) ? media.images : []
  const raw = images.length > 0 ? firstString(images[0], 'url') : undefined

  if (!raw) {
    return undefined
  }

  const filled = raw
    .replace(/\{@width\}/g, '832')
    .replace(/\{@height\}/g, '832')
    .replace(/\{@quality\}/g, '70')

  return officialUrl(filled, MAKRO_ORIGIN, MAKRO_HOSTS)
}

function decimalToCents(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined
  }

  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function recordValue(node: unknown, key: string): Record<string, unknown> | undefined {
  const value = isRecord(node) ? node[key] : undefined
  return isRecord(value) ? value : undefined
}

function recordField(node: unknown, key: string, field: string): unknown {
  return recordValue(node, key)?.[field]
}

function firstString(node: unknown, key: string): string | undefined {
  const value = isRecord(node) ? node[key] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
