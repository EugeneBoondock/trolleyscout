import type { CataloguePage, StoreLeaflet } from '../types'
import { canonicalCatalogueRetailerId } from './catalogueDirectory'

export type CatalogueDirectoryProvider =
  | 'catalogue-specials'
  | 'guzzle'
  | 'latest-specials'
  | 'my-catalogue'

export const GUZZLE_LATEST_URL =
  'https://www.guzzle.co.za/specials/latest-online-catalogues/'
export const LATEST_SPECIALS_RSS_URL =
  'https://www.latestspecials.co.za/rss/'
export const LATEST_SPECIALS_CATEGORY_URLS = [
  'https://www.latestspecials.co.za/groceries/',
  'https://www.latestspecials.co.za/electronics/',
  'https://www.latestspecials.co.za/home-garden/',
  'https://www.latestspecials.co.za/clothing-footwear-sport/',
  'https://www.latestspecials.co.za/health-beauty/',
  'https://www.latestspecials.co.za/miscellaneous/',
] as const
export const MY_CATALOGUE_LATEST_URL = 'https://my-catalogue.co.za/'

const COUNTRY_CODE = 'ZA'
const MAX_DIRECTORY_ROWS = 1_200

export function catalogueDirectoryProvider(
  pageUrl: string,
): CatalogueDirectoryProvider | undefined {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'cataloguespecials.co.za') return 'catalogue-specials'
    if (host === 'guzzle.co.za') return 'guzzle'
    if (host === 'latestspecials.co.za') return 'latest-specials'
    if (host === 'my-catalogue.co.za') return 'my-catalogue'
  } catch {
    return undefined
  }
  return undefined
}

export function extractGuzzleLeaflets(
  html: string,
  capturedAt: string,
  countryCode = COUNTRY_CODE,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const linkPattern =
    /href=["']\/specials\/catalogue\/(\d{2,12})\/([a-z0-9-]+)\/?["']/gi
  let match: RegExpExecArray | null

  while (
    (match = linkPattern.exec(html)) !== null &&
    leaflets.length < MAX_DIRECTORY_ROWS
  ) {
    const catalogueId = match[1]
    const storeSlug = match[2].toLowerCase()
    if (seen.has(catalogueId)) continue

    const cardStart = Math.max(
      0,
      html.lastIndexOf('catalogue-wrap', match.index) - 120,
    )
    const nextCard = html.indexOf('catalogue-wrap', match.index + match[0].length)
    const cardEnd = nextCard < 0
      ? Math.min(html.length, match.index + 5_000)
      : Math.min(html.length, nextCard)
    const card = html.slice(cardStart, cardEnd)
    const rawName = htmlAttribute(card, 'meta', 'itemprop', 'name', 'content')
    const imageUrl = highQualityGuzzleImage(
      /\b(?:src|data-src)=["']((?:https?:)?\/\/guzzle\.akamaized\.net\/media\/thumbnails\/[^"']+)["']/i
        .exec(card)?.[1],
    )
    if (!rawName || !imageUrl) continue

    const cleanName = cleanText(rawName).replace(/\s+-\s+Merchant\s*$/i, '')
    const retailerName =
      cleanText(cleanName.split(/\s+:\s+/)[0] ?? '') ||
      readableSlug(storeSlug)
    const sourceUrl =
      `https://www.guzzle.co.za/specials/catalogue/${catalogueId}/${storeSlug}/`
    const logoUrl = absoluteHttpsUrl(
      /\b(?:src|data-src)=["']((?:https?:)?\/\/guzzle\.akamaized\.net\/media\/suppliers\/[^"']+)["']/i
        .exec(card)?.[1],
    )

    seen.add(catalogueId)
    leaflets.push({
      capturedAt,
      countryCode: normalizeCountryCode(countryCode),
      id: `guzzle-${catalogueId}`,
      imageUrl,
      name: cleanName,
      pagesUrl:
        `https://trolleyscout.co.za/api/catalogue-pages?source=guzzle&catalogue=${catalogueId}&store=${storeSlug}`,
      retailerId: canonicalCatalogueRetailerId(storeSlug, retailerName),
      retailerLogoUrl: logoUrl,
      retailerName,
      retailerUrl: `https://www.guzzle.co.za/${storeSlug}/`,
      sourceId: 'guzzle-za',
      sourceLabel: 'Guzzle',
      url: sourceUrl,
      validFrom: schemaDate(
        htmlAttribute(card, 'meta', 'itemprop', 'startDate', 'content'),
      ),
      validTo: schemaDate(
        htmlAttribute(card, 'meta', 'itemprop', 'endDate', 'content'),
      ),
    })
  }

  return leaflets
}

export function extractGuzzlePages(html: string): CataloguePage[] {
  const urls = Array.from(
    html.matchAll(
      /(?:https?:)?\/\/guzzle\.akamaized\.net\/[^"'<> \s]+\.900x10000_q\d+\.jpg\.webp/gi,
    ),
    (match) => absoluteHttpsUrl(match[0]),
  ).filter((url): url is string => Boolean(url))

  return uniquePageUrls(urls, 900, 1_200)
}

export function extractLatestSpecialsLeaflets(
  xml: string,
  capturedAt: string,
  countryCode = COUNTRY_CODE,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null

  while (
    (match = itemPattern.exec(xml)) !== null &&
    leaflets.length < MAX_DIRECTORY_ROWS
  ) {
    const item = match[1]
    const guid = xmlTagText(item, 'guid')
    const flyerMatch = /^flyer:([a-z0-9-]+):(\d{2,12})$/i.exec(guid)
    const flyerId = flyerMatch?.[2]
    const storeSlug = flyerMatch?.[1].toLowerCase()
    const sourceUrl = safeLatestSpecialsUrl(xmlTagText(item, 'link'))
    const imageTag = /<media:content\b([^>]*)\/?>/i.exec(item)?.[1] ?? ''
    const imageUrl = safeLatestSpecialsImage(
      /\burl=["']([^"']+)["']/i.exec(imageTag)?.[1],
      flyerId,
    )
    if (!flyerId || !storeSlug || !sourceUrl || !imageUrl || seen.has(flyerId)) {
      continue
    }

    const categories = Array.from(
      item.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi),
      (category) => cleanXmlText(category[1]),
    ).filter(Boolean)
    const retailerName = categories.at(-1) ?? readableSlug(storeSlug)
    const description = cleanXmlText(xmlTagRaw(item, 'description'))
    const validity = slashDateRange(description)
    const title = cleanLatestSpecialsTitle(
      cleanXmlText(xmlTagRaw(item, 'title')),
      retailerName,
    )
    const path = new URL(sourceUrl).pathname

    seen.add(flyerId)
    leaflets.push({
      capturedAt,
      countryCode: normalizeCountryCode(countryCode),
      id: `latest-specials-${flyerId}`,
      imageUrl,
      name: title,
      pagesUrl:
        `https://trolleyscout.co.za/api/catalogue-pages?source=latest-specials&flyer=${flyerId}&path=${encodeURIComponent(path)}`,
      retailerId: canonicalCatalogueRetailerId(storeSlug, retailerName),
      retailerName,
      retailerUrl: `https://www.latestspecials.co.za/${storeSlug}/`,
      sourceId: 'latest-specials-za',
      sourceLabel: 'Latest Specials',
      url: sourceUrl,
      validFrom: validity.validFrom,
      validTo: validity.validTo,
    })
  }

  return leaflets
}

export function latestSpecialsPageCount(html: string): number {
  const pages = Array.from(
    html.matchAll(/[?&]page=(\d{1,3})(?=["'&#])/gi),
    (match) => Number(match[1]),
  ).filter((page) => Number.isSafeInteger(page) && page > 0 && page <= 80)
  return Math.max(1, ...pages)
}

export function extractLatestSpecialsHtmlLeaflets(
  html: string,
  capturedAt: string,
  countryCode = COUNTRY_CODE,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const cardPattern =
    /<div\b[^>]*class=["'][^"']*brochure-thumb[^"']*["'][^>]*\bdata-brochure-id=["'](\d{2,12})["'][^>]*>([\s\S]*?)<\/article>/gi
  let match: RegExpExecArray | null

  while (
    (match = cardPattern.exec(html)) !== null &&
    leaflets.length < MAX_DIRECTORY_ROWS
  ) {
    const flyerId = match[1]
    const card = match[2]
    if (seen.has(flyerId)) continue
    const detailPath =
      /\bhref=["'](\/([a-z0-9-]+)\/[a-z0-9-]+-\d{2,12}\/)["']/i
        .exec(card)
    const path = detailPath?.[1]
    const storeSlug = detailPath?.[2]
    const imageUrl = safeLatestSpecialsImage(
      /\b(?:src|data-src)=["']([^"']*\/co\.za\/data\/\d+\/\d{2,12}\/0\.jpg[^"']*)["']/i
        .exec(card)?.[1],
      flyerId,
    )
    if (!path || !storeSlug || !imageUrl || !path.endsWith(`-${flyerId}/`)) {
      continue
    }
    const retailerName = cleanText(
      /<span\b[^>]*class=["'][^"']*shop-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(card)?.[1] ?? readableSlug(storeSlug),
    )
    const title = cleanText(
      /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(card)?.[1] ??
        `${retailerName} catalogue`,
    )
    const validity = slashDateRange(cleanText(
      /<span\b[^>]*class=["'][^"']*hidden-sm[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(card)?.[1] ?? '',
    ))
    const logoUrl = safeLatestSpecialsLogo(
      /\b(?:src|data-src)=["']([^"']*\/co\.za\/data\/\d+\/logo\.png[^"']*)["']/i
        .exec(card)?.[1],
    )
    const sourceUrl = `https://www.latestspecials.co.za${path}`

    seen.add(flyerId)
    leaflets.push({
      capturedAt,
      countryCode: normalizeCountryCode(countryCode),
      id: `latest-specials-${flyerId}`,
      imageUrl,
      name: title,
      pagesUrl:
        `https://trolleyscout.co.za/api/catalogue-pages?source=latest-specials&flyer=${flyerId}&path=${encodeURIComponent(path)}`,
      retailerId: canonicalCatalogueRetailerId(storeSlug, retailerName),
      retailerLogoUrl: logoUrl,
      retailerName,
      retailerUrl: `https://www.latestspecials.co.za/${storeSlug}/`,
      sourceId: 'latest-specials-za',
      sourceLabel: 'Latest Specials',
      url: sourceUrl,
      validFrom: validity.validFrom,
      validTo: validity.validTo,
    })
  }

  return leaflets
}

export function extractLatestSpecialsPage(
  html: string,
  flyerId: string,
  pageNumber: number,
): CataloguePage | undefined {
  if (!/^\d{2,12}$/.test(flyerId) || pageNumber < 1 || pageNumber > 80) {
    return undefined
  }
  const escaped = flyerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expectedIndex = pageNumber - 1
  const imagePattern = new RegExp(
    `<img\\b[^>]*(?:id=["']pageZoom["']|class=["'][^"']*lazyloadBrochure[^"']*["'])[^>]*(?:data-src|src)=["']([^"']*\\/co\\.za\\/data\\/\\d+\\/${escaped}\\/${expectedIndex}\\.jpg[^"']*)["'][^>]*>`,
    'i',
  )
  const reversePattern = new RegExp(
    `<img\\b[^>]*(?:data-src|src)=["']([^"']*\\/co\\.za\\/data\\/\\d+\\/${escaped}\\/${expectedIndex}\\.jpg[^"']*)["'][^>]*(?:id=["']pageZoom["']|class=["'][^"']*lazyloadBrochure[^"']*["'])[^>]*>`,
    'i',
  )
  const match = imagePattern.exec(html) ?? reversePattern.exec(html)
  if (!match) return undefined

  const tag = match[0]
  const imageUrl = safeLatestSpecialsImage(match[1], flyerId)
  if (!imageUrl) return undefined
  return {
    height: boundedDimension(/\bheight=["'](\d{2,5})["']/i.exec(tag)?.[1], 2_000),
    imageUrl,
    pageNumber,
    width: boundedDimension(/\bwidth=["'](\d{2,5})["']/i.exec(tag)?.[1], 1_550),
  }
}

export function extractMyCatalogueLeaflets(
  html: string,
  capturedAt: string,
  countryCode = COUNTRY_CODE,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const linkPattern =
    /<a\b[^>]*\bhref=["']\/([a-z0-9-]+)-specials["'][^>]*\btitle=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while (
    (match = linkPattern.exec(html)) !== null &&
    leaflets.length < MAX_DIRECTORY_ROWS
  ) {
    const storeSlug = match[1].toLowerCase()
    if (seen.has(storeSlug)) continue
    const context = html.slice(
      Math.max(0, match.index - 300),
      Math.min(html.length, match.index + 1_800),
    )
    const title = cleanText(match[2])
    const retailerName =
      title.replace(/\s+(?:catalogue|specials?)\s*$/i, '').trim() ||
      readableSlug(storeSlug)
    const cover = absoluteMyCatalogueUrl(
      /\b(?:src|data-src)=["'](\/public\/gimg\/[^"']+\.(?:avif|jpe?g|png|webp))["']/i
        .exec(context)?.[1],
    )
    const validityText = cleanText(
      /<small\b[^>]*class=["'][^"']*name-mobile[^"']*["'][^>]*>([\s\S]*?)<\/small>/i
        .exec(context)?.[1] ?? '',
    )
    const validity = myCatalogueDateRange(validityText, capturedAt)
    if (!cover) continue

    const sourceUrl = `https://my-catalogue.co.za/${storeSlug}-specials`
    seen.add(storeSlug)
    leaflets.push({
      capturedAt,
      countryCode: normalizeCountryCode(countryCode),
      id: `my-catalogue-${storeSlug}-${validity.validTo ?? 'current'}`,
      imageUrl: cover,
      name: title || `${retailerName} catalogue`,
      pagesUrl:
        `https://trolleyscout.co.za/api/catalogue-pages?source=my-catalogue&store=${storeSlug}`,
      retailerId: canonicalCatalogueRetailerId(storeSlug, retailerName),
      retailerName,
      retailerUrl: sourceUrl,
      sourceId: 'my-catalogue-za',
      sourceLabel: 'My Catalogue',
      url: sourceUrl,
      validFrom: validity.validFrom,
      validTo: validity.validTo,
    })
  }

  return leaflets
}

export function extractMyCatalogueDetailPath(
  html: string,
  storeSlug: string,
): string | undefined {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(storeSlug)) {
    return undefined
  }
  const escaped = storeSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `href=["'](?:https:\\/\\/my-catalogue\\.co\\.za)?(\\/${escaped}-specials\\/[a-z0-9-]+)["']`,
    'i',
  ).exec(html)?.[1]
}

export function extractMyCataloguePages(html: string): CataloguePage[] {
  const tags = Array.from(
    html.matchAll(/<img\b[^>]*(?:\bid=["']page_\d+["']|\bclass=["'][^"']*leaflet-pages[^"']*["'])[^>]*>/gi),
    (match) => match[0],
  )
  const pages: CataloguePage[] = []
  const seen = new Set<string>()

  for (const tag of tags) {
    const imageUrl = absoluteMyCatalogueUrl(
      /\b(?:src|data-src)=["']([^"']+)["']/i.exec(tag)?.[1],
    )
    if (!imageUrl || seen.has(imageUrl)) continue
    const explicitPage = Number(/\bid=["']page_(\d{1,3})["']/i.exec(tag)?.[1])
    const pageNumber = Number.isSafeInteger(explicitPage) && explicitPage > 0
      ? explicitPage
      : pages.length + 1
    seen.add(imageUrl)
    pages.push({
      height: boundedDimension(/\bheight=["'](\d{2,5})["']/i.exec(tag)?.[1], 1_773),
      imageUrl: imageUrl.replace(/-\d{2,4}-\d{3,6}\.(jpg|webp)$/i, '-900-100000.$1'),
      pageNumber,
      width: boundedDimension(/\bwidth=["'](\d{2,5})["']/i.exec(tag)?.[1], 900),
    })
  }

  return pages.sort((left, right) => left.pageNumber - right.pageNumber)
}

function highQualityGuzzleImage(value: string | undefined): string | undefined {
  const url = absoluteHttpsUrl(value)
  return url?.replace(/\.218x284_q\d+\.jpg\.webp(?:$|[?#])/i, '.900x10000_q76.jpg.webp')
}

function cleanLatestSpecialsTitle(value: string, retailerName: string): string {
  const cleaned = value
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, ' ')
    .replace(/\uFE0F/g, ' ')
    .replace(/\s*[–-]\s*The best deals are just a click away!?\s*/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || `${retailerName} catalogue`
}

function xmlTagText(value: string, tag: string): string {
  return cleanXmlText(xmlTagRaw(value, tag))
}

function xmlTagRaw(value: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i')
    .exec(value)?.[1] ?? ''
}

function cleanXmlText(value: string): string {
  return cleanText(value.replace(/^<!\[CDATA\[|\]\]>$/g, ''))
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '“')
    .replace(/&#39;|&apos;|&#039;/gi, '’')
    .replace(/&ndash;/gi, '–')
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const parsed = Number(code)
      return Number.isSafeInteger(parsed) ? String.fromCodePoint(parsed) : ''
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function htmlAttribute(
  html: string,
  tagName: string,
  key: string,
  expectedValue: string,
  wanted: string,
): string | undefined {
  const tag = new RegExp(
    `<${tagName}\\b[^>]*\\b${key}=["']${expectedValue}["'][^>]*>`,
    'i',
  ).exec(html)?.[0]
  if (!tag) return undefined
  return new RegExp(`\\b${wanted}=["']([^"']+)["']`, 'i').exec(tag)?.[1]
}

function slashDateRange(value: string): {
  validFrom?: string
  validTo?: string
} {
  const match =
    /(\d{1,2})\/(\d{1,2})\/(20\d{2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/
      .exec(value)
  return match
    ? {
        validFrom: isoDate(Number(match[3]), Number(match[2]), Number(match[1])),
        validTo: isoDate(Number(match[6]), Number(match[5]), Number(match[4])),
      }
    : {}
}

function myCatalogueDateRange(
  value: string,
  capturedAt: string,
): { validFrom?: string; validTo?: string } {
  const match =
    /(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/
      .exec(value)
  if (match) {
    let startYear = Number(match[5])
    const startMonth = Number(match[2])
    const endMonth = Number(match[4])
    if (startMonth > endMonth) startYear -= 1
    return {
      validFrom: isoDate(startYear, startMonth, Number(match[1])),
      validTo: isoDate(Number(match[5]), endMonth, Number(match[3])),
    }
  }
  const short =
    /(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})/.exec(value)
  const capturedYear = new Date(capturedAt).getUTCFullYear()
  if (!short || !Number.isSafeInteger(capturedYear)) return {}
  let startYear = capturedYear
  let endYear = capturedYear
  if (Number(short[2]) > Number(short[4])) endYear += 1
  return {
    validFrom: isoDate(startYear, Number(short[2]), Number(short[1])),
    validTo: isoDate(endYear, Number(short[4]), Number(short[3])),
  }
}

function schemaDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? undefined
    : isoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

function isoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : undefined
}

function safeLatestSpecialsUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      url.hostname === 'www.latestspecials.co.za' &&
      /^\/[a-z0-9-]+\/[a-z0-9-]+-\d{2,12}\/$/i.test(url.pathname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function safeLatestSpecialsImage(
  value: string | undefined,
  flyerId: string | undefined,
): string | undefined {
  if (!value || !flyerId) return undefined
  try {
    const url = new URL(value.replace(/&amp;/gi, '&'))
    return url.protocol === 'https:' &&
      url.hostname === 'eu.leafletscdn.com' &&
      new RegExp(`/co\\.za/data/\\d+/${flyerId}/\\d+\\.jpg$`, 'i')
        .test(url.pathname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function safeLatestSpecialsLogo(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.replace(/&amp;/gi, '&'))
    return url.protocol === 'https:' &&
      url.hostname === 'eu.leafletscdn.com' &&
      /\/co\.za\/data\/\d+\/logo\.png$/i.test(url.pathname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function absoluteMyCatalogueUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, 'https://my-catalogue.co.za/')
    return url.protocol === 'https:' &&
      url.hostname === 'my-catalogue.co.za' &&
      /^\/public\/gimg\//.test(url.pathname)
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function absoluteHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function uniquePageUrls(
  urls: string[],
  width: number,
  height: number,
): CataloguePage[] {
  const seen = new Set<string>()
  return urls
    .filter((url) => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    })
    .map((imageUrl, index) => ({
      height,
      imageUrl,
      pageNumber: index + 1,
      width,
    }))
}

function boundedDimension(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 100 && parsed <= 20_000
    ? parsed
    : fallback
}

function normalizeCountryCode(value: string): string {
  const code = value.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : COUNTRY_CODE
}

function readableSlug(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}
