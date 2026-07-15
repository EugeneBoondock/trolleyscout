import type { RetailerId, StoreLeaflet } from '../types'

// Big grocers that publish specials as digital leaflets rather than
// per-product API rows. We surface the catalogue name, valid dates, and the
// official leaflet link — genuinely useful, and honest about what it is.

export interface LeafletTarget {
  retailerId: RetailerId
  retailerName: string
  kind: 'sixty60-api' | 'html-list'
  // For sixty60-api: the leaflet API base + a representative national store id.
  apiBase?: string
  storeId?: string
  // For html-list: the specials page to parse.
  pageUrl?: string
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
]

export function buildLeafletApiUrl(apiBase: string): string {
  return `${apiBase}/api/stores/get-store-leaflets`
}

interface SixtyLeafletRow {
  name?: unknown
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

    if (!name || !url.startsWith('http') || seen.has(url)) {
      continue
    }

    seen.add(url)
    leaflets.push({
      capturedAt,
      id: leafletId(target.retailerId, url),
      name,
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
