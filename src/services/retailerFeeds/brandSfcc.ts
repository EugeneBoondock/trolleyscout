import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
  RetailerSlug,
} from './types'
import { officialUrl, percentOffText, randToCents } from './values'

type BrandSfccLayout = 'adidas' | 'new-balance'

export interface BrandSfccShop {
  categoryId: string
  host: string
  imageHosts: readonly string[]
  layout: BrandSfccLayout
  name: string
  pageSize: number
  retailerId: RetailerSlug
  siteId: string
  sourcePath: string
}

const sfccScope = { type: 'online' } as const
const MAX_TILES_PER_PAGE = 120

export const BRAND_SFCC_SHOPS: readonly BrandSfccShop[] = [
  {
    categoryId: 'sale',
    host: 'www.adidas.co.za',
    imageHosts: ['assets.adidas.com', 'www.adidas.co.za'],
    layout: 'adidas',
    name: 'adidas',
    pageSize: 48,
    retailerId: retailerSlug('adidas'),
    siteId: 'adidas-ZA',
    sourcePath: '/sale',
  },
  {
    categoryId: 'Clearance',
    host: 'www.newbalance.co.za',
    imageHosts: ['nb.scene7.com', 'www.newbalance.co.za'],
    layout: 'new-balance',
    name: 'New Balance',
    pageSize: 18,
    retailerId: retailerSlug('new-balance'),
    siteId: 'NBZA',
    sourcePath: '/Sale-3/',
  },
]

export function buildBrandSfccGridUrl(
  shop: BrandSfccShop,
  start = 0,
): string {
  const params = new URLSearchParams({
    cgid: shop.categoryId,
    start: String(Math.max(0, Math.trunc(start) || 0)),
    sz: String(shop.pageSize),
  })

  return `https://${shop.host}/on/demandware.store/` +
    `Sites-${shop.siteId}-Site/en_ZA/Search-UpdateGrid?${params.toString()}`
}

export function parseBrandSfccGrid(
  html: string,
  context: RetailerFeedContext,
  shop: BrandSfccShop,
): RetailerFeedPage {
  if (typeof html !== 'string') {
    throw new TypeError(`Invalid ${shop.name} grid payload`)
  }

  if (html.trim() === '') {
    return { candidates: [], catalogues: [], totalCount: 0 }
  }

  const tiles = splitProductTiles(html)

  if (tiles.length === 0) {
    throw new TypeError(`Invalid ${shop.name} grid payload`)
  }

  const candidates: RetailerDealCandidate[] = []
  const counted = new Set<string>()
  const published = new Set<string>()
  const origin = `https://${shop.host}`
  const hosts = [shop.host, shop.host.replace(/^www\./, '')]
  const promotionId = `${shop.layout}-sale`

  for (const tile of tiles) {
    const productId = attribute(tile, 'data-pid')

    if (!productId || counted.has(productId)) {
      continue
    }

    counted.add(productId)

    const title = decodeAttribute(
      attribute(tile, 'aria-label') ||
      attribute(tile, 'title') ||
      /<a\b[^>]*\b(?:aria-label|title)="([^"]+)"/i.exec(tile)?.[1] ||
      '',
    ).trim()
    const markdown = shop.layout === 'new-balance'
      ? newBalanceMarkdown(tile)
      : adidasMarkdown(tile)
    const productUrl = officialUrl(
      decodeAttribute(/href="([^"]+\.html(?:\?[^"]*)?)"/i.exec(tile)?.[1] ?? ''),
      origin,
      hosts,
    )

    if (
      !title ||
      !markdown ||
      !productUrl ||
      published.has(productId)
    ) {
      continue
    }

    published.add(productId)

    candidates.push({
      capturedAt: context.capturedAt,
      evidenceText: buildRetailerEvidence({
        priceCents: markdown.priceCents,
        previousPriceCents: markdown.previousPriceCents,
        promotionMarker: promotionId,
        scope: sfccScope,
        sourceId: productId,
      }),
      imageUrl: tileImage(tile, origin, shop.imageHosts),
      previousPriceCents: markdown.previousPriceCents,
      priceCents: markdown.priceCents,
      productId,
      productUrl,
      promotionId,
      retailerId: shop.retailerId,
      savingText: percentOffText(
        markdown.priceCents,
        markdown.previousPriceCents,
        markdown.quotedPercent,
      ),
      scope: sfccScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  return { candidates, catalogues: [], totalCount: counted.size }
}

interface BrandMarkdown {
  previousPriceCents: number
  priceCents: number
  quotedPercent?: number
}

function adidasMarkdown(tile: string): BrandMarkdown | undefined {
  const priceCents = decimalAttributeToCents(
    /class="[^"]*\bsales\b[^"]*"[\s\S]*?class="[^"]*\bvalue\b[^"]*"[^>]*\bcontent="([^"]+)"/i
      .exec(tile)?.[1],
  )
  const previousPriceCents = decimalAttributeToCents(
    /class="[^"]*(?:\bstrike-through\b|\blist\b)[^"]*"[\s\S]*?class="[^"]*\bvalue\b[^"]*"[^>]*\bcontent="([^"]+)"/i
      .exec(tile)?.[1],
  )

  return validMarkdown(priceCents, previousPriceCents)
}

function decimalAttributeToCents(value: string | undefined): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) {
    return undefined
  }

  return randToCents(Number(value))
}

function newBalanceMarkdown(tile: string): BrandMarkdown | undefined {
  const raw = decodeAttribute(attribute(tile, 'data-style-price'))

  if (!raw) {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as {
      list?: { percentage?: unknown; value?: unknown }
      sales?: { value?: unknown }
    }
    const markdown = validMarkdown(
      randToCents(parsed.sales?.value),
      randToCents(parsed.list?.value),
    )

    return markdown
      ? { ...markdown, quotedPercent: Number(parsed.list?.percentage) }
      : undefined
  } catch {
    return undefined
  }
}

function validMarkdown(
  priceCents: number | undefined,
  previousPriceCents: number | undefined,
): BrandMarkdown | undefined {
  return priceCents !== undefined &&
    previousPriceCents !== undefined &&
    previousPriceCents > priceCents
    ? { previousPriceCents, priceCents }
    : undefined
}

function splitProductTiles(html: string): string[] {
  const starts: number[] = []
  const pattern =
    /<(?:div|a)\b(?=[^>]*\bclass="[^"]*\bproduct\b[^"]*")(?=[^>]*\bdata-pid=")[^>]*>/gi
  let match = pattern.exec(html)

  while (match && starts.length < MAX_TILES_PER_PAGE) {
    starts.push(match.index)
    match = pattern.exec(html)
  }

  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length))
}

function tileImage(
  tile: string,
  origin: string,
  imageHosts: readonly string[],
): string | undefined {
  const pattern = /<img\b[^>]*\b(?:data-src|src)="([^"]+)"/gi
  let match = pattern.exec(tile)

  while (match) {
    const url = officialUrl(decodeAttribute(match[1]), origin, imageHosts)

    if (url) {
      return url
    }

    match = pattern.exec(tile)
  }

  return undefined
}

function attribute(tile: string, name: string): string {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${safeName}="([^"]+)"`, 'i').exec(tile)?.[1]?.trim() ?? ''
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}
