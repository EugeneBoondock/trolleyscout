import type { RetailerId, StoreLeaflet } from '../types'

// Big grocers that publish specials as digital leaflets rather than
// per-product API rows. We surface the catalogue name, valid dates, and the
// official leaflet link — genuinely useful, and honest about what it is.

export interface LeafletTarget {
  retailerId: RetailerId
  retailerName: string
  kind: 'sixty60-api' | 'html-list' | 'html-pdf' | 'sitebuilder-pdf' | 'pnp-cms'
  // For sixty60-api: the leaflet API base + a representative national store id.
  apiBase?: string
  storeId?: string
  // For html-list / html-pdf: the specials page to parse and its origin.
  pageUrl?: string
  origin?: string
  // For sitebuilder-pdf: every page that may link a leaflet PDF (a chain's
  // home page plus each branch page). Results are deduped by document URL.
  pageUrls?: string[]
}

export const leafletTargets: LeafletTarget[] = [
  {
    kind: 'pnp-cms',
    pageUrl:
      'https://www.pnp.co.za/pnphybris/v2/pnp-spa/cms/pages?pageType=ContentPage&pageLabelOrId=%2Fcatalogues&baseStore=WC21&lang=en&curr=ZAR',
    retailerId: 'pick-n-pay',
    retailerName: 'Pick n Pay',
  },
  {
    apiBase: 'https://www.shoprite.co.za',
    kind: 'sixty60-api',
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    storeId: '1080',
  },
  {
    apiBase: 'https://www.checkers.co.za',
    kind: 'sixty60-api',
    retailerId: 'checkers',
    retailerName: 'Checkers',
    storeId: '168228',
  },
  {
    kind: 'html-list',
    pageUrl: 'https://www.boxer.co.za/promotions',
    retailerId: 'boxer',
    retailerName: 'Boxer',
  },
  {
    kind: 'html-pdf',
    origin: 'https://www.usave.co.za',
    pageUrl: 'https://www.usave.co.za/specials.html',
    retailerId: 'usave',
    retailerName: 'Usave',
  },
  {
    kind: 'html-pdf',
    origin: 'https://www.okfoods.co.za',
    pageUrl: 'https://www.okfoods.co.za/specials.html',
    retailerId: 'ok-foods',
    retailerName: 'OK Foods',
  },
  {
    // Frontline Hyper runs a 1-grid sitebuilder site: its weekly leaflet is a
    // PDF linked as "Promotions" in the nav, and each branch page repeats or
    // adds its own. Fetch the home page and every branch page, then dedupe.
    kind: 'sitebuilder-pdf',
    origin: 'https://frontlinesa.co.za',
    pageUrls: ['https://frontlinesa.co.za/', 'https://frontlinesa.co.za/springs'],
    retailerId: 'frontline',
    retailerName: 'Frontline Hyper',
  },
]

const MONTHS: Record<string, string> = {
  january: 'January',
  february: 'February',
  march: 'March',
  april: 'April',
  may: 'May',
  june: 'June',
  july: 'July',
  august: 'August',
  september: 'September',
  october: 'October',
  november: 'November',
  december: 'December',
}

const PNP_PROVINCES: Record<string, string> = {
  'eastern cape': 'Eastern Cape',
  'free state': 'Free State',
  gauteng: 'Gauteng',
  'kwa zulu natal': 'KwaZulu-Natal',
  'kwazulu natal': 'KwaZulu-Natal',
  kwazulunatal: 'KwaZulu-Natal',
  kzn: 'KwaZulu-Natal',
  limpopo: 'Limpopo',
  mpumalanga: 'Mpumalanga',
  'north west': 'North West',
  'northern cape': 'Northern Cape',
  'western cape': 'Western Cape',
}

interface PnpCmsBanner {
  content?: unknown
  media?: { url?: unknown }
  name?: unknown
  typeCode?: unknown
  uid?: unknown
}

export function extractPnpCmsLeaflets(
  target: LeafletTarget,
  payload: unknown,
  capturedAt: string,
  limit = 48,
): StoreLeaflet[] {
  const banners: PnpCmsBanner[] = []
  collectPnpBannerComponents(payload, banners, 64)
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()

  for (const banner of banners) {
    if (leaflets.length >= limit) {
      break
    }
    if (typeof banner.content !== 'string') {
      continue
    }

    const content = banner.content
    const headingMatch = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(content)
    const title = cleanText(headingMatch?.[1] ?? (typeof banner.name === 'string' ? banner.name : ''))
    const imageUrl = absoluteHttpUrl(banner.media?.url, 'https://www.pnp.co.za')
    const validity = pnpValidityDates(content, capturedAt)
    const viewers = pnpViewerScopes(content)

    for (const [url, scopeNames] of viewers) {
      if (leaflets.length >= limit || seen.has(url)) {
        continue
      }
      seen.add(url)
      const national = scopeNames.includes('National')
      const regions = scopeNames.filter((scope) => scope !== 'National')
      const scopeLabel = national ? 'National' : regions.join(', ')
      const priceScope: StoreLeaflet['priceScope'] = national
        ? { type: 'national' }
        : regions.length > 0
          ? { regionIds: [regions[0], ...regions.slice(1)], type: 'province' }
          : undefined

      leaflets.push({
        capturedAt,
        id: leafletId(target.retailerId, url),
        imageUrl,
        name: `${title || target.retailerName + ' specials'} (${scopeLabel})`,
        priceScope,
        retailerId: target.retailerId,
        retailerName: target.retailerName,
        url,
        validFrom: validity.validFrom,
        validTo: validity.validTo,
      })
    }
  }

  return leaflets
}

function collectPnpBannerComponents(
  value: unknown,
  banners: PnpCmsBanner[],
  limit: number,
): void {
  if (banners.length >= limit || value === null || typeof value !== 'object') {
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPnpBannerComponents(item, banners, limit)
    }
    return
  }

  const record = value as Record<string, unknown>
  if (record.typeCode === 'BannerComponent') {
    banners.push(record as PnpCmsBanner)
    return
  }
  for (const child of Object.values(record)) {
    collectPnpBannerComponents(child, banners, limit)
  }
}

function pnpViewerScopes(content: string): Map<string, string[]> {
  const viewers = new Map<string, string[]>()
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = anchorPattern.exec(content)) !== null) {
    const url = trustedPnpViewerUrl(match[2].replace(/&amp;/gi, '&'))
    const label = cleanText(match[3])
    const normalized = label.toLowerCase().replace(/[^a-z]+/g, ' ').trim()
    const scope = normalized === 'national' ? 'National' : PNP_PROVINCES[normalized]
    if (!url || !scope) {
      continue
    }
    const scopes = viewers.get(url) ?? []
    if (!scopes.includes(scope)) {
      scopes.push(scope)
    }
    viewers.set(url, scopes)
  }

  return viewers
}

function trustedPnpViewerUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'pnpcatalogues.hflip.co' ||
      url.port ||
      !/^\/[a-z0-9]{6,64}\.html$/i.test(url.pathname)
    ) {
      return undefined
    }
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function pnpValidityDates(content: string, capturedAt: string) {
  const text = cleanText(content)
  const match = /\bValid\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/i.exec(text)
  if (!match) {
    return {} as { validFrom?: string; validTo?: string }
  }

  const capturedYear = new Date(capturedAt).getUTCFullYear()
  const startMonth = monthNumber(match[2])
  const endMonth = monthNumber(match[5])
  if (!startMonth || !endMonth || !Number.isFinite(capturedYear)) {
    return {} as { validFrom?: string; validTo?: string }
  }

  let startYear = Number(match[3] || match[6] || capturedYear)
  let endYear = Number(match[6] || match[3] || capturedYear)
  if (!match[3] && match[6] && startMonth > endMonth) {
    startYear -= 1
  } else if (!match[6] && startMonth > endMonth) {
    endYear += 1
  }

  return {
    validFrom: isoCalendarDate(startYear, startMonth, Number(match[1])),
    validTo: isoCalendarDate(endYear, endMonth, Number(match[4])),
  }
}

function monthNumber(value: string): number | undefined {
  const index = Object.keys(MONTHS).indexOf(value.toLowerCase())
  return index >= 0 ? index + 1 : undefined
}

function isoCalendarDate(year: number, month: number, day: number): string | undefined {
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

export function buildLeafletApiUrl(apiBase: string): string {
  return `${apiBase}/api/stores/get-store-leaflets`
}

interface SixtyLeafletRow {
  imageUrl?: unknown
  name?: unknown
  metaPdfUrl?: unknown
  url?: unknown
  startDate?: unknown
  endDate?: unknown
}

export function extractSixtyLeaflets(
  target: LeafletTarget,
  payload: unknown,
  capturedAt: string,
  limit = 8,
): StoreLeaflet[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()

  for (const row of payload as SixtyLeafletRow[]) {
    if (leaflets.length >= limit) {
      break
    }

    const name = cleanText(typeof row.name === 'string' ? row.name : '')
    const url = typeof row.url === 'string' ? row.url : ''
    const imageUrl = absoluteHttpUrl(row.imageUrl, target.apiBase)
    const documentUrl = absoluteHttpUrl(row.metaPdfUrl, target.apiBase)

    if (!name || !url.startsWith('http') || seen.has(url)) {
      continue
    }

    seen.add(url)
    leaflets.push({
      capturedAt,
      documentUrl,
      id: leafletId(target.retailerId, url),
      imageUrl,
      name,
      priceScope: target.storeId
        ? { storeIds: [target.storeId], type: 'store' }
        : undefined,
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url,
      validFrom: isoDateOrUndefined(row.startDate),
      validTo: isoDateOrUndefined(row.endDate),
    })
  }

  return leaflets
}

// Boxer lists each promotion as a "View Leaflet" link with a name and a
// "Valid: dd/mm/yyyy - dd/mm/yyyy" line in the surrounding markup.
export function extractBoxerLeaflets(
  target: LeafletTarget,
  html: string,
  capturedAt: string,
  limit = 8,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const linkPattern = /href="(\/post\/promotion_details\/[^"]+)"/gi
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(html)) !== null && leaflets.length < limit) {
    const path = match[1]

    if (seen.has(path)) {
      continue
    }

    seen.add(path)

    // Look just before the link for the promotion name and valid dates.
    const context = html.slice(Math.max(0, match.index - 900), match.index)
    const text = context.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const dateMatch = /Valid:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/.exec(text)
    const name = boxerLeafletName(text, path)

    if (!name) {
      continue
    }

    leaflets.push({
      capturedAt,
      id: leafletId(target.retailerId, path),
      name,
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url: absoluteBoxerUrl(path),
      validFrom: dateMatch ? toIsoDate(dateMatch[1]) : undefined,
      validTo: dateMatch ? toIsoDate(dateMatch[2]) : undefined,
    })
  }

  return leaflets
}

// Usave and OK Foods publish their specials as leaflet PDFs whose path
// carries the month and a region/section code. We surface each current
// leaflet with a readable name derived from that path.
export function extractPdfLeaflets(
  target: LeafletTarget,
  html: string,
  capturedAt: string,
  limit = 6,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const pdfPattern = /\/content\/dam\/[^"']*?\.pdf/gi
  let match: RegExpExecArray | null

  while ((match = pdfPattern.exec(html)) !== null && leaflets.length < limit) {
    const path = match[0]
    const lower = path.toLowerCase()

    // Only current specials/leaflet PDFs — skip terms, PAIA manuals, etc.
    if (!/special|leaflet/.test(lower) || seen.has(path)) {
      continue
    }

    seen.add(path)
    const url = target.origin ? `${target.origin}${path}` : path

    leaflets.push({
      capturedAt,
      // The link IS the leaflet PDF, so record it as the document too: readers
      // open documentUrl, and without it these leaflets cannot be viewed.
      documentUrl: url,
      id: leafletId(target.retailerId, path),
      name: pdfLeafletName(target.retailerName, path),
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url,
      validFrom: undefined,
      validTo: undefined,
    })
  }

  return leaflets
}

// Filename codes on OK Foods/Usave leaflet PDFs: region prefix + section,
// e.g. "WC-urban.pdf" or "CEN-Foods.pdf".
const LEAFLET_REGIONS: Record<string, string> = {
  cen: 'Central',
  ec: 'Eastern Cape',
  fs: 'Free State',
  gn: 'Gauteng',
  kzn: 'KwaZulu-Natal',
  lim: 'Limpopo',
  mp: 'Mpumalanga',
  nc: 'Northern Cape',
  nor: 'North',
  rsa: 'National',
  wc: 'Western Cape',
}

const LEAFLET_SECTIONS: Record<string, string> = {
  foods: 'Foods',
  grocer: 'Grocer',
  liquor: 'Liquor',
  urban: '',
}

// Boxer's promotion pages embed a hosted FlippingBook viewer rather than a
// PDF. Its /index.html exposes the same files/assets/pager.js manifest as the
// self-hosted viewers, so pointing the leaflet there makes the catalogue both
// readable in-app and scannable into deals.
export function extractFlippingBookViewerUrl(html: string): string | undefined {
  const match = /https?:\/\/online\.flippingbook\.com\/view\/(\d+)\/?/i.exec(html)

  return match ? `https://online.flippingbook.com/view/${match[1]}/index.html` : undefined
}

// The hosted viewer serves its page images from signed URLs we cannot read,
// but it does publish a public cover. Surface that so the catalogue shows a
// real cover rather than a blank card.
export function extractViewerCoverImage(html: string): string | undefined {
  const cover = /https?:\/\/[a-z0-9.-]*cloudfront\.net\/[A-Za-z0-9/]+\/cover\d*\.jpg/i.exec(html)

  if (cover) {
    return cover[0]
  }

  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)
  return ogImage ? ogImage[1].replace(/&amp;/g, '&') : undefined
}

function pdfLeafletName(retailerName: string, path: string): string {
  const month = path
    .toLowerCase()
    .split('/')
    .map((segment) => MONTHS[segment])
    .find(Boolean)

  const filename = path.toLowerCase().split('/').pop() ?? ''
  const fileMatch = /^([a-z]+)-([a-z]+)\.pdf$/.exec(filename)
  const region = fileMatch ? LEAFLET_REGIONS[fileMatch[1]] : undefined
  const section = fileMatch ? LEAFLET_SECTIONS[fileMatch[2]] : undefined

  const parts = [region, section].filter(Boolean).join(' ')
  const scope = parts ? `: ${parts}` : ''
  const when = month ? ` (${month})` : ''

  if (scope || when) {
    return `${retailerName} specials${scope}${when}`
  }

  return `${retailerName} specials leaflet`
}

function boxerLeafletName(text: string, path: string): string {
  // The visible name sits between "View Leaflet"/"Download" chrome and the
  // "Valid:" line. Fall back to a readable slug from the URL.
  const beforeValid = text.split(/Valid:/i)[0] ?? ''
  const cleaned = cleanText(
    beforeValid
      .replace(/View Leaflet/gi, ' ')
      .replace(/Download/gi, ' ')
      .replace(/Read more/gi, ' '),
  )
  const tail = cleaned.split(' ').slice(-6).join(' ').trim()

  if (tail.length >= 4) {
    return tail
  }

  const slug = path.split('/').pop() ?? ''
  return cleanText(slug.replace(/[._]/g, ' ')) || 'Boxer promotion'
}

function absoluteBoxerUrl(path: string): string {
  try {
    return new URL(path, 'https://www.boxer.co.za/').toString()
  } catch {
    return 'https://www.boxer.co.za/promotions'
  }
}

function absoluteHttpUrl(value: unknown, baseUrl: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || !baseUrl) {
    return undefined
  }

  try {
    const url = new URL(value, baseUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function leafletId(retailerId: string, url: string): string {
  return `${retailerId}-${hashString(url)}`
}

function hashString(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

function isoDateOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length < 10) {
    return undefined
  }

  return value.slice(0, 10)
}

function toIsoDate(ddmmyyyy: string): string | undefined {
  const parts = ddmmyyyy.split('/')

  if (parts.length !== 3) {
    return undefined
  }

  const [day, month, year] = parts
  return `${year}-${month}-${day}`
}

function cleanText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
