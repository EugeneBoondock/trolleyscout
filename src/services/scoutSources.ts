import type { RetailerId, StoreLeaflet } from '../types'

export interface ExternalRetailerTarget {
  retailerId: RetailerId
  retailerName: string
  sourceUrl: string
  // Some retailers publish ONLY catalogue PDFs on the target page (branch
  // catalogues named by store, no "specials" keyword). Trust every PDF there.
  trustAllPdfs?: boolean
}

export const externalRetailerTargets: ExternalRetailerTarget[] = [
  {
    retailerId: 'kit-kat',
    retailerName: 'Kit Kat Cash & Carry',
    sourceUrl: 'https://kitkatgroup.com/promotions.php',
  },
  {
    retailerId: 'roots-butchery',
    retailerName: 'Roots Butchery',
    sourceUrl: 'https://rootsbutchery.co.za/specials/',
  },
  {
    retailerId: 'president-hyper',
    retailerName: 'President Hyper',
    sourceUrl: 'https://www.presidenthyper.co.za/weekly-specials/',
  },
  {
    retailerId: 'frontline',
    retailerName: 'Frontline Hyper',
    sourceUrl: 'https://frontlinesa.co.za/',
    trustAllPdfs: true,
  },
]

export function extractRetailerLeafletsFromHtml(
  target: ExternalRetailerTarget,
  html: string,
  capturedAt: string,
  limit = 8,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const linkPattern = /href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(html)) !== null && leaflets.length < limit) {
    const rawPath = decodeHtml(match[1])
    const documentUrl = absoluteHttpUrl(rawPath, target.sourceUrl)
    const context = html.slice(Math.max(0, match.index - 1200), Math.min(html.length, match.index + 400))
    const searchable = `${rawPath} ${stripHtml(context)}`.toLowerCase()

    const looksPromotional = /special|promotion|deal|catalog|leaflet|weekly|citizen/.test(searchable)

    if (
      !documentUrl ||
      seen.has(documentUrl) ||
      /privacy|policy|terms|paia|manual/.test(rawPath.toLowerCase()) ||
      (!target.trustAllPdfs && !looksPromotional)
    ) {
      continue
    }

    const name = nearestHeading(context) || documentName(documentUrl)
    const imageUrl = nearestImage(context, target.sourceUrl)
    seen.add(documentUrl)
    leaflets.push({
      capturedAt,
      documentUrl,
      id: `${target.retailerId}-${hashString(documentUrl)}`,
      imageUrl,
      name,
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url: target.sourceUrl,
    })
  }

  return leaflets
}

function nearestHeading(context: string) {
  const matches = Array.from(context.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi))
  return cleanText(matches.at(-1)?.[1] ?? '')
}

function nearestImage(context: string, baseUrl: string) {
  const matches = Array.from(context.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi))
  return absoluteHttpUrl(decodeHtml(matches.at(-1)?.[1] ?? ''), baseUrl)
}

function documentName(url: string) {
  try {
    const filename = decodeURIComponent(new URL(url).pathname.split('/').at(-1) ?? '')
    return cleanText(filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ')) || 'Promotional catalogue'
  } catch {
    return 'Promotional catalogue'
  }
}

function absoluteHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function stripHtml(value: string) {
  return cleanText(value.replace(/<[^>]+>/g, ' '))
}

function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim().slice(0, 180)
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '’')
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}
