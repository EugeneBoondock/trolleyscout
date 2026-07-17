import type { RetailerId, StoreLeaflet } from '../types'

// Big grocers that publish specials as digital leaflets rather than
// per-product API rows. We surface the catalogue name, valid dates, and the
// official leaflet link — genuinely useful, and honest about what it is.

export interface LeafletTarget {
  retailerId: RetailerId
  retailerName: string
  kind: 'sixty60-api' | 'html-list' | 'html-pdf'
  // For sixty60-api: the leaflet API base + a representative national store id.
  apiBase?: string
  storeId?: string
  // For html-list / html-pdf: the specials page to parse and its origin.
  pageUrl?: string
  origin?: string
}

export const leafletTargets: LeafletTarget[] = [
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
  limit = 1,
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

function pdfLeafletName(retailerName: string, path: string): string {
  const month = path
    .toLowerCase()
    .split('/')
    .map((segment) => MONTHS[segment])
    .find(Boolean)

  return month ? `${retailerName} specials: ${month}` : `${retailerName} specials leaflet`
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
