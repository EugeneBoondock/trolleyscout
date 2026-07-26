import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerSlug,
} from './types'
import { officialUrl, percentOffText, randToCents } from './values'

// Cape Union Mart and Old Khaki run on Salesforce Commerce Cloud, and neither
// had any way in: no products.json, no GraphQL, and a front page that assembles
// itself. Both showed zero deals for as long as the app has existed.
//
// The way in is the grid endpoint the site's own "load more" button calls —
// `Search-UpdateGrid` — which answers a plain GET with the product tiles as
// HTML, paginated, no session and no token. Watching the page make the request
// was the only way to find it; it appears nowhere in the markup.
//
// A tile carries its own facts in a `data-gtm-impression` attribute — id, name,
// brand, price — which is read instead of the surrounding markup, because that
// attribute is what their analytics depends on and so it changes far less often
// than the presentation around it.
//
// The was-price is the one thing not in that attribute. It sits in a
// `strike-through` span, and the trap is that the span is always present: on a
// full-price item it contains the literal text "null". Two thirds of the deals
// aisle is that — bundle offers rather than markdowns — so reading the span's
// presence as a saving would have invented one on thirty-two items in forty-eight.

export interface DemandwareShop {
  /// The shop's own deal aisles, taken from its navigation.
  categoryIds: readonly string[]
  host: string
  name: string
  retailerId: RetailerSlug
  siteId: string
}

export const DEMANDWARE_PAGE_SIZE = 48
const MAX_TILES_PER_PAGE = 96

export const DEMANDWARE_SHOPS: readonly DemandwareShop[] = [
  {
    // This is the parent aisle used by the site’s own “Everyone” tab. The
    // men’s and women’s routes repeat products from it and would create three
    // requests for the same catalogue.
    categoryIds: ['deals-everyone'],
    host: 'www.capeunionmart.co.za',
    name: 'Cape Union Mart',
    retailerId: retailerSlug('cape-union-mart'),
    siteId: 'CUM',
  },
  {
    categoryIds: ['deals-offers'],
    host: 'www.oldkhaki.co.za',
    name: 'Old Khaki',
    retailerId: retailerSlug('old-khaki'),
    siteId: 'OK',
  },
]

export function buildDemandwareGridUrl(
  shop: DemandwareShop,
  categoryId: string,
  start = 0,
): string {
  const params = new URLSearchParams({
    cgid: categoryId,
    start: String(Math.max(0, Math.trunc(start) || 0)),
    sz: String(DEMANDWARE_PAGE_SIZE),
  })

  return `https://${shop.host}/on/demandware.store/Sites-${shop.siteId}-Site/en_ZA/` +
    `Search-UpdateGrid?${params.toString()}`
}

export function parseDemandwareGrid(
  html: string,
  context: RetailerFeedContext,
  shop: DemandwareShop,
  categoryId: string,
): RetailerFeedPage {
  if (typeof html !== 'string') {
    throw new TypeError('Invalid Demandware grid payload')
  }

  if (html.trim() === '') {
    return { candidates: [], catalogues: [], totalCount: 0 }
  }

  if (!html.includes('data-pid=')) {
    throw new TypeError('Invalid Demandware grid payload')
  }

  const origin = `https://${shop.host}`
  const hosts = [shop.host, shop.host.replace(/^www\./, '')]
  const promotionId = `demandware-${categoryId}`
  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  const tiles = splitTiles(html)
  const productIds = new Set<string>()

  for (const tile of tiles) {
    if (candidates.length >= MAX_TILES_PER_PAGE) {
      break
    }

    const facts = tileFacts(tile)
    const productId = facts?.id || tileProductId(tile)
    const title = facts?.name

    if (productId) {
      productIds.add(productId)
    }

    if (!productId || !title || seen.has(productId)) {
      continue
    }

    const priceCents = randToCents(
      /class="sales">\s*<span class="value"[^>]*content="([\d.]+)"/.exec(tile)?.[1] ??
        facts?.price,
    )
    const previousPriceCents = strikeThroughCents(tile)

    // No markdown, no deal. Two thirds of this aisle is bundle offers at the
    // ordinary shelf price, and publishing those as savings would be a lie.
    if (
      priceCents === undefined ||
      previousPriceCents === undefined ||
      previousPriceCents <= priceCents
    ) {
      continue
    }

    const productUrl = officialUrl(
      /<a[^>]+href="(\/products\/[^"]+)"/.exec(tile)?.[1] ?? '',
      origin,
      hosts,
    )

    if (!productUrl) {
      continue
    }

    seen.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents,
        previousPriceCents,
        promotionMarker: promotionId,
        scope: { type: 'online' },
        sourceId: productId,
      }),
      imageUrl: tileImage(tile),
      priceCents,
      previousPriceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: shop.retailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: { type: 'online' },
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: productIds.size }
}

function splitTiles(html: string): string[] {
  // Each tile starts at its own data-pid and runs to the next one; the last
  // runs to the end of the fragment.
  const starts: number[] = []
  const pattern = /<div\b(?=[^>]*\bdata-pid=")[^>]*>/gi
  let match = pattern.exec(html)

  while (match && starts.length <= MAX_TILES_PER_PAGE * 2) {
    starts.push(match.index)
    match = pattern.exec(html)
  }

  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length))
}

function tileProductId(tile: string): string {
  return /\bdata-pid="([^"]+)"/i.exec(tile)?.[1]?.trim() ?? ''
}

interface TileFacts {
  id: string
  name: string
  price?: string
}

/// The tile's own analytics payload, which their tracking depends on and so
/// outlives any amount of redesign around it.
function tileFacts(tile: string): TileFacts | undefined {
  const raw = /data-gtm-impression="([^"]+)"/.exec(tile)?.[1]

  if (!raw) {
    return undefined
  }

  try {
    const parsed: unknown = JSON.parse(decodeAttribute(raw))

    if (typeof parsed !== 'object' || parsed === null) {
      return undefined
    }

    const record = parsed as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id.trim() : ''
    // The impression name is lower-cased for analytics; the anchor carries the
    // name as a shopper reads it.
    const anchorName = /<a[^>]+href="\/products\/[^"]*"[^>]*>\s*([^<]{3,120}?)\s*<\/a>/
      .exec(tile)?.[1]
    const name = (anchorName ?? (typeof record.name === 'string' ? record.name : '')).trim()

    return id && name
      ? { id, name, price: typeof record.price === 'string' ? record.price : undefined }
      : undefined
  } catch {
    return undefined
  }
}

/// The struck-through price, and only when it is one. The span is present on
/// every tile; on a full-price item it holds the word "null".
function strikeThroughCents(tile: string): number | undefined {
  const raw = /class="value strike-through"[^>]*>\s*([^<]*?)\s*<\/span>/.exec(tile)?.[1]

  if (!raw || /^null$/i.test(raw.trim())) {
    return undefined
  }

  return randToCents(raw)
}

function tileImage(tile: string): string | undefined {
  const raw = /data-src="(https:\/\/media\.[^"]+)"/.exec(tile)?.[1]

  if (!raw) {
    return undefined
  }

  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}
