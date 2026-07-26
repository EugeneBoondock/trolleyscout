import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import { officialUrl, percentOffText, randToCents } from './values'

export const COTTON_ON_ORIGIN = 'https://cottonon.com'
export const COTTON_ON_SALE_URL = `${COTTON_ON_ORIGIN}/ZA/sale/`
export const COTTON_ON_PAGE_SIZE = 48
export const MAX_COTTON_ON_PAGES = 24

const COTTON_ON_HOSTS = ['cottonon.com', 'www.cottonon.com']
const MAX_TILES_PER_PAGE = 96
const cottonOnRetailerId = retailerSlug('cotton-on')
const cottonOnScope = { type: 'online' } as const
const cottonOnPromotionId = 'cotton-on-sale'

export function buildCottonOnGridUrl(start = 0): string {
  const url = new URL(COTTON_ON_SALE_URL)
  url.searchParams.set('start', String(Math.max(0, Math.trunc(start) || 0)))
  url.searchParams.set('sz', String(COTTON_ON_PAGE_SIZE))
  return url.toString()
}

export function parseCottonOnGrid(
  html: string,
  context: RetailerFeedContext,
): RetailerFeedPage {
  if (typeof html !== 'string') {
    throw new TypeError('Invalid Cotton On grid payload')
  }

  if (html.trim() === '') {
    return { candidates: [], catalogues: [], totalCount: 0 }
  }

  const tiles = splitProductTiles(html)

  if (tiles.length === 0) {
    throw new TypeError('Invalid Cotton On grid payload')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const tile of tiles) {
    const productId = attribute(tile, 'data-itemid') || attribute(tile, 'data-pid')
    const title = decodeAttribute(
      /<a\b[^>]*\bclass="[^"]*\bthumb-link\b[^"]*"[^>]*\btitle="([^"]+)"/i
        .exec(tile)?.[1] ?? '',
    ).trim()
    const priceCents = randToCents(
      /\bclass="[^"]*\bproduct-sales-price\b[^"]*"[^>]*\bdata-standardprice="([^"]+)"/i
        .exec(tile)?.[1],
    )
    const previousPriceCents = randToCents(
      /\bclass="[^"]*\bproduct-standard-price\b[^"]*"[^>]*\bdata-salesprice="([^"]+)"/i
        .exec(tile)?.[1],
    )
    const productUrl = officialUrl(
      decodeAttribute(
        /<a\b[^>]*\bclass="[^"]*\bthumb-link\b[^"]*"[^>]*\bhref="([^"]+)"/i
          .exec(tile)?.[1] ?? '',
      ),
      COTTON_ON_ORIGIN,
      COTTON_ON_HOSTS,
    )

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
        promotionMarker: cottonOnPromotionId,
        scope: cottonOnScope,
        sourceId: productId,
      }),
      imageUrl: cottonOnImage(tile),
      previousPriceCents,
      priceCents,
      productId,
      productUrl,
      promotionId: cottonOnPromotionId,
      retailerId: cottonOnRetailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: cottonOnScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const totalCount = new Set(
    tiles.map((tile) => attribute(tile, 'data-itemid') || attribute(tile, 'data-pid'))
      .filter(Boolean),
  ).size

  return { candidates, catalogues: [], totalCount }
}

function splitProductTiles(html: string): string[] {
  const starts: number[] = []
  const pattern =
    /<div\b(?=[^>]*\bclass="[^"]*\bproduct-tile\b[^"]*")[^>]*>/gi
  let match = pattern.exec(html)

  while (match && starts.length < MAX_TILES_PER_PAGE) {
    starts.push(match.index)
    match = pattern.exec(html)
  }

  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length))
}

function cottonOnImage(tile: string): string | undefined {
  const raw = decodeAttribute(
    /<img\b[^>]*\b(?:src|data-src)="([^"]+)"/i.exec(tile)?.[1] ?? '',
  )
  return officialUrl(raw, COTTON_ON_ORIGIN, COTTON_ON_HOSTS)
}

function attribute(tile: string, name: string): string {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return decodeAttribute(
    new RegExp(`\\b${safeName}="([^"]+)"`, 'i').exec(tile)?.[1] ?? '',
  ).trim()
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}
