import { retailers } from '../data/retailers'
import type { CataloguePage, RetailerId, StoreLeaflet } from '../types'

export const CATALOGUE_SPECIALS_COUNTRY_CODE = 'ZA'
export const CATALOGUE_SPECIALS_ORIGIN = 'https://www.cataloguespecials.co.za'
export const CATALOGUE_SPECIALS_LATEST_URL =
  `${CATALOGUE_SPECIALS_ORIGIN}/latest-catalogues?page=1`

const DIRECTORY_SOURCE_LABEL = 'Catalogue Specials'
const MAX_DIRECTORY_PAGES = 40
const MAX_DIRECTORY_CARDS = 1_200

export function catalogueSpecialsDirectoryPageCount(html: string): number {
  const pages = Array.from(
    html.matchAll(/href=["']\/latest-catalogues\?page=(\d{1,3})["']/gi),
    (match) => Number(match[1]),
  ).filter((page) => Number.isSafeInteger(page) && page > 0)

  return Math.min(MAX_DIRECTORY_PAGES, Math.max(1, ...pages))
}

export function catalogueSpecialsDirectoryPageUrl(page: number): string {
  const bounded = Math.min(
    MAX_DIRECTORY_PAGES,
    Math.max(1, Math.floor(page)),
  )
  return `${CATALOGUE_SPECIALS_ORIGIN}/latest-catalogues?page=${bounded}`
}

export function extractCatalogueSpecialsLeaflets(
  html: string,
  capturedAt: string,
  countryCode = CATALOGUE_SPECIALS_COUNTRY_CODE,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const cardPattern =
    /<a\b[^>]*\bhref=["']\/stores\/([a-z0-9-]+)\/catalogues-specials["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while (
    (match = cardPattern.exec(html)) !== null &&
    leaflets.length < MAX_DIRECTORY_CARDS
  ) {
    const storeSlug = match[1].toLowerCase()
    const card = match[2]
    const flyerId = /\bdata-flyer-id=["'](\d{4,12})["']/i.exec(card)?.[1]
    const retailerName = cleanText(
      /\bdata-flyer-name=["']([^"']+)["']/i.exec(card)?.[1] ?? '',
    )
    const imageUrl = cleanCatalogueCover(
      /\bsrc=["'](https:\/\/img\.offers-cdn\.net\/assets\/uploads\/flyers\/\d+\/thumbnailFixedWidth\/[^"']+)["']/i
        .exec(card)?.[1],
      flyerId,
    )

    if (!flyerId || !retailerName || !imageUrl || seen.has(flyerId)) {
      continue
    }

    const validTo = catalogueCardEndDate(card, capturedAt)
    const url = catalogueSpecialsFlyerUrl(storeSlug, flyerId)
    const retailerId = canonicalCatalogueRetailerId(storeSlug, retailerName)
    seen.add(flyerId)
    leaflets.push({
      capturedAt,
      countryCode: countryCode.trim().toUpperCase(),
      id: `catalogue-specials-${flyerId}`,
      imageUrl,
      name: catalogueCardTitle(retailerName, imageUrl),
      pagesUrl:
        `https://trolleyscout.co.za/api/catalogue-pages?flyer=${flyerId}&store=${storeSlug}`,
      retailerId,
      retailerLogoUrl:
        `https://img.offers-cdn.net/assets/uploads/stores/za/logos/200x72_webp/${storeSlug}.webp`,
      retailerName,
      retailerUrl:
        `${CATALOGUE_SPECIALS_ORIGIN}/stores/${storeSlug}/catalogues-specials`,
      sourceId: 'catalogue-specials-za',
      sourceLabel: DIRECTORY_SOURCE_LABEL,
      url,
      validTo,
    })
  }

  return leaflets
}

export function catalogueSpecialsFlyerUrl(
  storeSlug: string,
  flyerId: string,
): string {
  return `${CATALOGUE_SPECIALS_ORIGIN}/view/specials/${storeSlug}-catalogue-${flyerId}`
}

export function extractCatalogueSpecialsPages(
  html: string,
  flyerId: string,
): CataloguePage[] {
  if (!/^\d{4,12}$/.test(flyerId)) {
    return []
  }

  const escapedFlyerId = flyerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pageImagePattern = new RegExp(
    `https:\\/\\/img\\.offers-cdn\\.net\\/assets\\/uploads\\/flyers\\/${escapedFlyerId}\\/(?:260x270WebP|260x270)\\/([^"'<>\\s]+)`,
    'gi',
  )
  const pages = new Map<number, CataloguePage>()
  let match: RegExpExecArray | null

  while ((match = pageImagePattern.exec(html)) !== null) {
    const thumbnailUrl = match[0].replace(/&amp;/gi, '&')
    const filename = match[1]
    const pageNumber = cataloguePageNumber(filename)
    if (!pageNumber || pages.has(pageNumber)) {
      continue
    }

    const largeWebpUrl = thumbnailUrl
      .replace(/\/(?:260x270WebP|260x270)\//i, '/largeWebP/')
      .replace(/\.(?:jpe?g|png)$/i, '.webp')
    pages.set(pageNumber, {
      fallbacks: [thumbnailUrl],
      height: 2_000,
      imageUrl: largeWebpUrl,
      pageNumber,
      width: 1_410,
    })
  }

  return Array.from(pages.values()).sort(
    (left, right) => left.pageNumber - right.pageNumber,
  )
}

export function isCatalogueSpecialsLeaflet(leaflet: StoreLeaflet): boolean {
  return leaflet.sourceLabel === DIRECTORY_SOURCE_LABEL
}

export function canonicalCatalogueRetailerId(
  storeSlug: string,
  retailerName: string,
): RetailerId {
  const aliases: Record<string, string> = {
    babiesrus: 'babies-r-us',
    'builders-warehouse': 'builders',
    dischem: 'dis-chem',
    'food-lover-s-market': 'food-lovers',
    'h-m': 'h-and-m',
    'je-cash-and-carry': 'j-and-e-cash-and-carry',
    'kitkat-cash-and-carry': 'kit-kat',
    mrp: 'mr-price',
    toysrus: 'toys-r-us',
  }
  const aliased = aliases[storeSlug]
  if (aliased) {
    return aliased
  }

  const exact = retailers.find((retailer) => retailer.id === storeSlug)
  if (exact) {
    return exact.id
  }
  const nameKey = identityKey(retailerName)
  const named = retailers.find((retailer) => identityKey(retailer.name) === nameKey)
  return named?.id ?? storeSlug
}

function catalogueCardEndDate(card: string, capturedAt: string): string | undefined {
  const match = /\bvalid until\s+(\d{1,2})-(\d{1,2})\b/i.exec(card)
  if (!match) {
    return undefined
  }

  const captured = new Date(capturedAt)
  if (Number.isNaN(captured.getTime())) {
    return undefined
  }
  const day = Number(match[1])
  const month = Number(match[2])
  let year = captured.getUTCFullYear()
  if (month < captured.getUTCMonth() + 1 - 6) {
    year += 1
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function catalogueCardTitle(retailerName: string, imageUrl: string): string {
  let filename = ''
  try {
    filename = decodeURIComponent(new URL(imageUrl).pathname.split('/').at(-1) ?? '')
  } catch {
    return `${retailerName} catalogue`
  }
  const base = filename
    .replace(/-h400webp-[a-f0-9]+\.webp$/i, '')
    .replace(/\.(?:avif|jpe?g|png|webp)$/i, '')
  const catalogueIndex = base.toLowerCase().indexOf('-catalogue')
  if (catalogueIndex < 0) {
    return `${retailerName} catalogue`
  }
  const suffix = base
    .slice(catalogueIndex + '-catalogue'.length)
    .replace(/^-+/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return suffix
    ? `${retailerName} catalogue ${suffix}`
    : `${retailerName} catalogue`
}

function cataloguePageNumber(filename: string): number | undefined {
  const match = /(?:^|-)(\d{1,3})(?:-\d+)?-[a-f0-9]+\.(?:jpe?g|png|webp)$/i.exec(
    filename,
  )
  const page = Number(match?.[1])
  return Number.isSafeInteger(page) && page > 0 && page <= 500
    ? page
    : undefined
}

function cleanCatalogueCover(
  value: string | undefined,
  flyerId: string | undefined,
): string | undefined {
  if (!value || !flyerId) {
    return undefined
  }
  try {
    const url = new URL(value.replace(/&amp;/gi, '&'))
    return (
      url.protocol === 'https:' &&
      url.hostname === 'img.offers-cdn.net' &&
      url.pathname.startsWith(`/assets/uploads/flyers/${flyerId}/thumbnailFixedWidth/`) &&
      /\.(?:avif|jpe?g|png|webp)$/i.test(url.pathname)
    )
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '“')
    .replace(/&#39;|&apos;/gi, '’')
    .replace(/&eacute;/gi, 'é')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function identityKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}
