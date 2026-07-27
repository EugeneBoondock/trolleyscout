import { buildRetailerEvidence, retailerSlug } from './types'
import type {
  FeedCursor,
  RetailerDealCandidate,
  RetailerFeedContext,
  RetailerFeedPage,
} from './types'
import { officialUrl, percentOffText, randToCents } from './values'

export const ASICS_ORIGIN = 'https://www.asics.com'
export const ASICS_CATALOGUE_URL = `${ASICS_ORIGIN}/za/en-za/sports`
export const ASICS_PAGE_SIZE = 120
export const MAX_ASICS_PAGES = 5

const asicsRetailerId = retailerSlug('asics')
const asicsScope = { type: 'national' } as const

export function buildAsicsCatalogueUrl(page = 1): string {
  const safePage = Math.max(1, Math.min(MAX_ASICS_PAGES, Math.trunc(page) || 1))
  const url = new URL(ASICS_CATALOGUE_URL)
  url.searchParams.set('page', String(safePage))
  url.searchParams.set('perpage', String(ASICS_PAGE_SIZE))
  return url.toString()
}

export function parseAsicsCatalogue(
  html: string,
  context: RetailerFeedContext,
  page = 1,
): RetailerFeedPage {
  if (typeof html !== 'string') {
    throw new TypeError('Invalid ASICS catalogue response')
  }

  const tiles = html
    .split(/<li\b[^>]*class=["'][^"']*\bproduct-item\b[^"']*["'][^>]*>/i)
    .slice(1)
    .map((tile) => tile.split(/<\/li>/i)[0])

  if (tiles.length === 0) {
    throw new TypeError('Invalid ASICS catalogue response')
  }

  const candidates: RetailerDealCandidate[] = []
  const seen = new Set<string>()

  for (const tile of tiles) {
    const linkTag = /<a\b(?=[^>]*class=["'][^"']*\bproductMainLink\b)[^>]*>/i
      .exec(tile)?.[0]
    const href = linkTag ? attribute(linkTag, 'href') : ''
    const title = decodeHtml(linkTag ? attribute(linkTag, 'title') : '')
    const productUrl = officialUrl(
      href,
      ASICS_ORIGIN,
      ['www.asics.com', 'asics.com'],
    )
    const productId = productIdFromUrl(productUrl)
    const prices = [...tile.matchAll(
      /<meta\b(?=[^>]*itemprop=["']price["'])[^>]*>/gi,
    )]
      .map((match) => randToCents(attribute(match[0], 'content')))
      .filter((price): price is number => price !== undefined)
    const priceCents = prices.length > 0 ? Math.min(...prices) : undefined
    const previousPriceCents = prices.length > 1 ? Math.max(...prices) : undefined

    if (
      !productId ||
      !productUrl ||
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
        promotionMarker: 'published-price-drop',
        scope: asicsScope,
        sourceId: productId,
      }),
      imageUrl: asicsImage(tile),
      previousPriceCents,
      priceCents,
      productId,
      productUrl,
      promotionId: 'published-price-drop',
      retailerId: asicsRetailerId,
      savingText: percentOffText(priceCents, previousPriceCents),
      scope: asicsScope,
      sourceKind: 'structured',
      sourceUrl: context.sourceUrl,
      title,
    })
  }

  const statedTotal = Number(
    /([\d,]+)\s+products?\s+found/i.exec(html)?.[1]?.replace(/,/g, ''),
  )
  const totalCount = Number.isSafeInteger(statedTotal) && statedTotal > 0
    ? statedTotal
    : tiles.length
  const currentPage = Math.max(1, Math.trunc(page) || 1)
  const nextCursor: FeedCursor | undefined =
    currentPage * ASICS_PAGE_SIZE < totalCount && currentPage < MAX_ASICS_PAGES
      ? { kind: 'page', page: currentPage + 1 }
      : undefined

  return { candidates, catalogues: [], nextCursor, totalCount }
}

function productIdFromUrl(value: string | undefined): string {
  if (!value) return ''
  return /\/p\/([a-z0-9-]+)/i.exec(new URL(value).pathname)?.[1] ?? ''
}

function asicsImage(tile: string): string | undefined {
  const imageTag = /<img\b(?=[^>]*class=["'][^"']*\bprimary-image\b)[^>]*>/i
    .exec(tile)?.[0]
  const value = decodeHtml(imageTag ? attribute(imageTag, 'src') : '')
  return officialUrl(value, ASICS_ORIGIN, ['images.asics.com'])
}

function attribute(tag: string, name: string): string {
  const pattern = new RegExp(`\\b${name}=["']([^"']*)["']`, 'i')
  return pattern.exec(tag)?.[1] ?? ''
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '’')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}
