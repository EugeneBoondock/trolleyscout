import type { CataloguePage, StoreLeaflet } from '../types'

const PDF_PATTERN = /\.pdf(?:$|[?#])/i
const IMAGE_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i
const PROMOTION_PATTERN =
  /\b(?:ads?|adverts?|booklets?|brochures?|catalog(?:ue|o)s?|circulars?|deals?|flyers?|leaflets?|offers?|prices?|promos?|promotions?|sales?|savings?|specials?|weekly|weekend)\b/i
const CATALOGUE_PATTERN =
  /\b(?:booklet|brochure|catalog(?:ue|o)|circular|flyer|leaflet)\b/i
const INFORMATION_PATTERN =
  /\b(?:application form|consumer information|coverage map|factsheet|fact sheet|financial statement|manual|policy|privacy|regulations?|reports?|terms(?: and conditions)?|user guide)\b/i
const TRUSTED_VIEWER_HOSTS = new Set([
  'anyflip.com',
  'cdnc.heyzine.com',
  'cdn.heyzine.com',
  'fliphtml5.com',
  'issuu.com',
  'online.flippingbook.com',
  'publitas.com',
])
const MAX_UNDATED_ASSET_AGE_DAYS = 70

interface CatalogueCandidate {
  assetDate?: number
  item: StoreLeaflet
  score: number
}

export function selectCurrentCatalogues(
  leaflets: StoreLeaflet[],
  now = new Date(),
): StoreLeaflet[] {
  const candidates = leaflets
    .map((leaflet) => cleanCatalogue(leaflet, now))
    .filter((candidate): candidate is CatalogueCandidate => candidate != null)
    .sort(compareCandidates)
  const seenAssets = new Set<string>()
  const seenCampaigns = new Set<string>()
  const selected: StoreLeaflet[] = []

  for (const candidate of candidates) {
    const assetKey = catalogueAssetKey(candidate.item)
    const campaignKey = catalogueCampaignKey(candidate.item)
    if (
      (assetKey && seenAssets.has(assetKey)) ||
      (campaignKey && seenCampaigns.has(campaignKey))
    ) {
      continue
    }
    if (assetKey) seenAssets.add(assetKey)
    if (campaignKey) seenCampaigns.add(campaignKey)
    selected.push(candidate.item)
  }

  return selected
}

function cleanCatalogue(
  leaflet: StoreLeaflet,
  now: Date,
): CatalogueCandidate | undefined {
  if (!isHttpUrl(leaflet.url)) {
    return undefined
  }

  const pages = cleanPages(leaflet.pages)
  const suppliedPagesUrl = isHttpUrl(leaflet.pagesUrl)
    ? leaflet.pagesUrl
    : undefined
  const suppliedDocumentUrl = isHttpUrl(leaflet.documentUrl)
    ? leaflet.documentUrl
    : undefined
  const pagesUrl = suppliedPagesUrl ??
    (pages.length <= 1 && !suppliedDocumentUrl
      ? flippingBookPagesUrl(leaflet.url)
      : undefined)
  const documentUrl = suppliedDocumentUrl ??
    (pages.length <= 1 && !pagesUrl
      ? heyzineDocumentUrl(leaflet.url)
      : undefined)
  const primaryUrl = documentUrl ?? leaflet.url
  const isPdf = isPdfUrl(primaryUrl)
  const isViewer = isTrustedViewerUrl(primaryUrl)
  const cleanedName = cleanCatalogueName(leaflet.name, leaflet.retailerName)
  const validTo = leaflet.validTo ?? inferNamedEndDate(cleanedName)
  if (isExpired(validTo, now)) {
    return undefined
  }
  const evidence = `${cleanedName} ${urlText(primaryUrl)} ${urlText(leaflet.url)}`
  const hasPromotionEvidence = PROMOTION_PATTERN.test(evidence)
  const hasCatalogueEvidence = CATALOGUE_PATTERN.test(evidence)
  const hasValidity = Boolean(leaflet.validFrom || validTo)

  if (INFORMATION_PATTERN.test(evidence) && !hasValidity) {
    return undefined
  }

  const readable =
    pages.length > 0 ||
    Boolean(pagesUrl) ||
    isPdf ||
    isViewer
  if (!readable) {
    return undefined
  }

  if (!hasPromotionEvidence && !hasValidity && pages.length < 2) {
    return undefined
  }

  if (
    pages.length === 1 &&
    !isPdf &&
    !isViewer &&
    !hasValidity &&
    !hasCatalogueEvidence
  ) {
    return undefined
  }

  const assetDate = inferAssetDate(primaryUrl, now)
  if (
    !hasValidity &&
    assetDate != null &&
    now.getTime() - assetDate > MAX_UNDATED_ASSET_AGE_DAYS * 86_400_000
  ) {
    return undefined
  }

  const imageUrl = cleanCoverUrl(leaflet.imageUrl) ?? pages[0]?.imageUrl
  const item: StoreLeaflet = { ...leaflet, name: cleanedName }
  if (documentUrl) item.documentUrl = documentUrl
  else delete item.documentUrl
  if (imageUrl) item.imageUrl = imageUrl
  else delete item.imageUrl
  if (pages.length > 0) item.pages = pages
  else delete item.pages
  if (pagesUrl) item.pagesUrl = pagesUrl
  else delete item.pagesUrl
  if (validTo) item.validTo = validTo

  return {
    assetDate,
    item,
    score:
      (pages.length > 1 ? 60 + Math.min(pages.length, 40) : pages.length * 12) +
      (pagesUrl ? 45 : 0) +
      (isPdf ? 50 : 0) +
      (isViewer ? 35 : 0) +
      (hasValidity ? 20 : 0) +
      (imageUrl ? 5 : 0) +
      sourceQualityBonus(leaflet.sourceLabel),
  }
}

function cleanPages(pages: CataloguePage[] | undefined): CataloguePage[] {
  const seen = new Set<string>()
  return [...(pages ?? [])]
    .filter((page) =>
      Number.isFinite(page.pageNumber) &&
      page.pageNumber > 0 &&
      isHttpUrl(page.imageUrl) &&
      !isPdfUrl(page.imageUrl))
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .filter((page) => {
      const key = canonicalUrl(page.imageUrl)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function cleanCoverUrl(value: string | undefined): string | undefined {
  if (!isHttpUrl(value)) return undefined
  return IMAGE_PATTERN.test(safeUrlPath(value)) ? value : undefined
}

function cleanCatalogueName(value: string, retailerName: string): string {
  let decoded = decodeHtml(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\bPDF\s+(?:download|switch to see)\.?\s*/gi, '')
    .replace(/^PDF\s+/i, '')
    .replace(/^[\s>|:;-]+/, '')
    .replace(/\s+-\s+[a-z0-9.-]+\.(?:co\.)?[a-z]{2,}\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const retailerSuffix = ` - ${retailerName}`
  if (decoded.toLowerCase().endsWith(retailerSuffix.toLowerCase())) {
    decoded = decoded.slice(0, -retailerSuffix.length).trim()
  }
  if (
    !decoded ||
    /^(?:catalogue|promotions?|specials?)$/i.test(decoded) ||
    decoded.length > 120
  ) {
    return `${retailerName} catalogue`
  }
  return decoded
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '“')
    .replace(/&#39;|&apos;/gi, '’')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => {
      const value = Number(code)
      return Number.isFinite(value) ? String.fromCodePoint(value) : ''
    })
}

function isExpired(validTo: string | undefined, now: Date): boolean {
  if (!validTo) return false
  const end = Date.parse(`${validTo}T23:59:59.999Z`)
  return Number.isFinite(end) && end < now.getTime()
}

function inferNamedEndDate(value: string): string | undefined {
  const monthNames = new Map<string, number>([
    ['jan', 1],
    ['january', 1],
    ['feb', 2],
    ['february', 2],
    ['mar', 3],
    ['march', 3],
    ['apr', 4],
    ['april', 4],
    ['may', 5],
    ['jun', 6],
    ['june', 6],
    ['jul', 7],
    ['july', 7],
    ['aug', 8],
    ['august', 8],
    ['sep', 9],
    ['sept', 9],
    ['september', 9],
    ['oct', 10],
    ['october', 10],
    ['nov', 11],
    ['november', 11],
    ['dec', 12],
    ['december', 12],
  ])
  const dates = Array.from(value.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi,
  ))
  const last = dates.at(-1)
  if (!last) return undefined
  const month = monthNames.get(last[2].toLowerCase())
  const year = Number(last[3] ?? value.match(/\b20\d{2}\b/g)?.at(-1))
  const day = Number(last[1])
  if (!month || !Number.isSafeInteger(year) || !Number.isSafeInteger(day)) {
    return undefined
  }
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function inferAssetDate(value: string, now: Date): number | undefined {
  const path = decodeURIComponent(safeUrlPath(value)).toLowerCase()
  const compact = /(?:^|[_/-])([0-3]\d)([01]\d)(2\d)(?=[_.\-/]|$)/.exec(path)
  if (compact) {
    const first = Number(compact[1])
    const month = Number(compact[2])
    const last = Number(compact[3])
    const yearFirst = first >= 20
    const day = yearFirst ? last : first
    const year = 2000 + (yearFirst ? first : last)
    const date = Date.UTC(year, month - 1, day)
    const parsed = new Date(date)
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return date
    }
  }

  const yearMonth = /(?:^|[^\d])(20\d{2})[/_-](0?[1-9]|1[0-2])(?:[^\d]|$)/.exec(path)
  if (yearMonth) {
    return Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1)
  }

  const monthNames = [
    'jan(?:uary)?',
    'feb(?:ruary)?',
    'mar(?:ch)?',
    'apr(?:il)?',
    'may',
    'jun(?:e)?',
    'jul(?:y)?',
    'aug(?:ust)?',
    'sep(?:t(?:ember)?)?',
    'oct(?:ober)?',
    'nov(?:ember)?',
    'dec(?:ember)?',
  ]
  const monthMatch = new RegExp(`(?:^|[^a-z])(${monthNames.join('|')})(?:[^a-z]|$)`, 'i').exec(path)
  if (!monthMatch) return undefined
  const month = monthNames.findIndex((pattern) => new RegExp(`^${pattern}$`, 'i').test(monthMatch[1]))
  if (month < 0) return undefined
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth()
  const forwardMonths = (month - currentMonth + 12) % 12
  const year = forwardMonths <= 1
    ? currentYear + (month < currentMonth ? 1 : 0)
    : currentYear - (month > currentMonth ? 1 : 0)
  return Date.UTC(year, month, 1)
}

function compareCandidates(left: CatalogueCandidate, right: CatalogueCandidate): number {
  if (left.score !== right.score) return right.score - left.score
  const leftValidFrom = dateTime(left.item.validFrom)
  const rightValidFrom = dateTime(right.item.validFrom)
  if (leftValidFrom !== rightValidFrom) return rightValidFrom - leftValidFrom
  const leftAssetDate = left.assetDate ?? Number.NEGATIVE_INFINITY
  const rightAssetDate = right.assetDate ?? Number.NEGATIVE_INFINITY
  if (leftAssetDate !== rightAssetDate) return rightAssetDate - leftAssetDate
  const leftCaptured = dateTime(left.item.capturedAt)
  const rightCaptured = dateTime(right.item.capturedAt)
  if (leftCaptured !== rightCaptured) return rightCaptured - leftCaptured
  return left.item.name.localeCompare(right.item.name)
}

function catalogueAssetKey(leaflet: StoreLeaflet): string | undefined {
  return canonicalUrl(leaflet.documentUrl ?? leaflet.url)
}

function catalogueCampaignKey(leaflet: StoreLeaflet): string | undefined {
  const name = leaflet.name
    .toLowerCase()
    .replace(leaflet.retailerName.toLowerCase(), ' ')
    .replace(/\b(?:catalogue|deals?|flyer|merchant|promotions?|specials?)\b/g, ' ')
    .replace(/\b(?:from|valid)\s+\d{1,2}[/-]\d{1,2}(?:[/-]20\d{2})?\b/g, ' ')
    .replace(/\b\d{1,2}\s+[a-z]+\s*[-–]\s*\d{1,2}\s+[a-z]+\s+20\d{2}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
  const dates = `${leaflet.validFrom ?? ''}|${leaflet.validTo ?? ''}`
  if (!name && !dates) {
    return `${leaflet.retailerId}|current-undated-catalogue`
  }
  return `${leaflet.retailerId}|${dates}|${name || 'catalogue'}`
}

function sourceQualityBonus(sourceLabel: string | undefined): number {
  if (sourceLabel === 'Latest Specials') return 32
  if (sourceLabel === 'Catalogue Specials') return 26
  if (sourceLabel === 'My Catalogue') return 20
  if (sourceLabel === 'Guzzle') return 18
  return 0
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.hash = ''
    const hasFunctionalQuery = [
      'catalogue',
      'file',
      'flyer',
      'id',
      'page',
      'publication',
      'source',
      'url',
      'viewer',
    ].some((key) => url.searchParams.has(key))
    if (!hasFunctionalQuery) {
      url.search = ''
    }
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return undefined
  }
}

function isPdfUrl(value: string): boolean {
  return PDF_PATTERN.test(safeUrlPath(value))
}

function isTrustedViewerUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    return TRUSTED_VIEWER_HOSTS.has(host) || host.endsWith('.hflip.co')
  } catch {
    return false
  }
}

function flippingBookPagesUrl(value: string): string | undefined {
  try {
    const viewer = new URL(value)
    if (
      viewer.protocol !== 'https:' ||
      viewer.hostname.toLowerCase() !== 'online.flippingbook.com' ||
      viewer.port ||
      viewer.username ||
      viewer.password ||
      viewer.search ||
      viewer.hash ||
      !/^\/view\/\d{4,12}\/index\.html$/.test(viewer.pathname)
    ) {
      return undefined
    }
    return 'https://trolleyscout.co.za/api/catalogue-pages' +
      `?source=flippingbook&viewer=${encodeURIComponent(viewer.toString())}`
  } catch {
    return undefined
  }
}

function heyzineDocumentUrl(value: string): string | undefined {
  try {
    const viewer = new URL(value)
    const hostname = viewer.hostname.toLowerCase()
    const path = /^\/([a-f0-9]{10})\.html$/i.exec(viewer.pathname)
    if (
      viewer.protocol !== 'https:' ||
      (hostname !== 'hflip.co' && !hostname.endsWith('.hflip.co')) ||
      viewer.port ||
      viewer.username ||
      viewer.password ||
      viewer.search ||
      viewer.hash ||
      !path
    ) {
      return undefined
    }
    return 'https://trolleyscout.co.za/api/catalogue-document.pdf' +
      `?source=heyzine&book=${path[1].toLowerCase()}`
  } catch {
    return undefined
  }
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function safeUrlPath(value: string): string {
  try {
    const url = new URL(value)
    return `${url.pathname}${url.search}`
  } catch {
    return ''
  }
}

function urlText(value: string): string {
  try {
    const url = new URL(value)
    return decodeURIComponent(`${url.pathname} ${url.search}`)
      .replace(/[-_./?=&]+/g, ' ')
  } catch {
    return value
  }
}

function dateTime(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}
