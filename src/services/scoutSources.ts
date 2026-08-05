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
  {
    // Walmart's SA stores (via Massmart) publish a dated catalogue PDF here.
    retailerId: 'walmart',
    retailerName: 'Walmart',
    sourceUrl: 'https://www.massmart.co.za/walmart-announces-stores-in-south-africa',
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
  const linkPattern = /(href|src)=["']([^"']+)["']/gi
  let match: RegExpExecArray | null

  while ((match = linkPattern.exec(html)) !== null && leaflets.length < limit) {
    const attribute = match[1].toLowerCase()
    const rawPath = decodeHtml(match[2])
    const documentUrl = absoluteHttpUrl(rawPath, target.sourceUrl)
    const isPdf = /\.pdf(?:$|\?)/i.test(rawPath)
    const isImageDocument = attribute === 'href' &&
      /\.(?:avif|jpe?g|png|webp)(?:$|\?)/i.test(rawPath)
    const isHostedCatalogue = documentUrl ? isTrustedCatalogueUrl(documentUrl) : false
    if (!isPdf && !isImageDocument && !isHostedCatalogue) continue

    const context = html.slice(Math.max(0, match.index - 2400), Math.min(html.length, match.index + 400))
    const searchable = `${rawPath} ${stripHtml(context)}`.toLowerCase()
    const looksPromotional = isImageDocument
      ? looksLikePromotionSignal(rawPath)
      : looksLikePromotionSignal(searchable)

    if (
      !documentUrl ||
      seen.has(documentUrl) ||
      /privacy|policy|terms|paia|manual/.test(rawPath.toLowerCase()) ||
      (!target.trustAllPdfs && !looksPromotional)
    ) {
      continue
    }

    const name = isImageDocument
      ? nearestHeading(context) || documentName(documentUrl)
      : leafletName(target.retailerName, html, match.index, context, documentUrl)
    const imageUrl = isImageDocument
      ? documentUrl
      : nearestImage(context, target.sourceUrl)
    seen.add(documentUrl)
    leaflets.push({
      capturedAt,
      documentUrl,
      id: `${target.retailerId}-${hashString(documentUrl)}`,
      imageUrl,
      name,
      pages: isImageDocument
        ? [{ height: 1_350, imageUrl: documentUrl, pageNumber: 1, width: 1_080 }]
        : undefined,
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url: target.sourceUrl,
      validTo: promotionEndDate(
        html.slice(Math.max(0, match.index - 2400), match.index),
      ),
    })
  }

  const imagePattern = /<img\b([^>]*)>/gi
  while ((match = imagePattern.exec(html)) !== null && leaflets.length < limit) {
    const attributes = match[1] ?? ''
    const rawPath = attributeValue(attributes, 'src') ?? attributeValue(attributes, 'data-src')
    if (!rawPath || !/\.(?:avif|jpe?g|png|webp)(?:$|\?)/i.test(rawPath)) continue

    const imageUrl = absoluteHttpUrl(decodeHtml(rawPath), target.sourceUrl)
    if (
      !imageUrl ||
      seen.has(imageUrl) ||
      leaflets.some((leaflet) => leaflet.imageUrl === imageUrl) ||
      /(?:favicon|icon|logo|placeholder|spinner)/i.test(rawPath)
    ) continue

    const context = html.slice(
      Math.max(0, match.index - 2400),
      Math.min(html.length, match.index + 400),
    )
    const alt = attributeValue(attributes, 'alt') ?? ''
    if (!looksLikePromotionSignal(`${rawPath} ${alt} ${stripHtml(context)}`)) continue

    seen.add(imageUrl)
    leaflets.push({
      capturedAt,
      documentUrl: imageUrl,
      id: `${target.retailerId}-${hashString(imageUrl)}`,
      imageUrl,
      name:
        nearestHeading(context) ||
        cleanText(alt) ||
        documentName(imageUrl),
      pages: [{ height: 1_350, imageUrl, pageNumber: 1, width: 1_080 }],
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url: target.sourceUrl,
      validTo: promotionEndDate(
        html.slice(Math.max(0, match.index - 2400), match.index),
      ),
    })
  }

  return leaflets
}

function promotionEndDate(value: string): string | undefined {
  const monthNumbers: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  }
  const dates = Array.from(
    stripHtml(value).matchAll(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/gi,
    ),
    (match) => {
      const day = Number(match[1])
      const month = monthNumbers[match[2].toLowerCase()]
      const year = Number(match[3])
      const parsed = new Date(Date.UTC(year, month - 1, day))
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      )
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : undefined
    },
  ).filter((date): date is string => Boolean(date))
  return dates.at(-1)
}

const CATALOGUE_HOSTS = [
  'fliphtml5.com',
  'flipsnack.com',
  'issuu.com',
  'publitas.com',
]

export function isTrustedCatalogueUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '')
    return CATALOGUE_HOSTS.some((catalogueHost) => (
      host === catalogueHost || host.endsWith(`.${catalogueHost}`)
    ))
  } catch {
    return false
  }
}

export function looksLikePromotionSignal(value: string): boolean {
  const normalized = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  return /special|promot|promoco|deal|offers?|catalog|leaflet|posters?|weekly|citizen|offre|oferta|folheto|punguzo|rabais|solde|desconto|month[\s_-]*end/.test(normalized)
}

function attributeValue(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}=["']([^"']+)["']`, 'i').exec(attributes)
  return match?.[1]
}

// Sitebuilder pages (e.g. Frontline's 1-grid site) name their leaflet links in
// the anchor text with no nearby heading, and their PDF filenames are UUIDs —
// so prefer anchor text, then a heading, and never surface a UUID as a name.
function leafletName(
  retailerName: string,
  html: string,
  matchIndex: number,
  context: string,
  documentUrl: string,
) {
  const candidate =
    anchorText(html, matchIndex) || nearestHeading(context) || documentName(documentUrl)
  const uuidLike = /^[0-9a-f]{6,}(?:[\s-]+[0-9a-f]+)*$/i.test(candidate)
  return uuidLike ? `${retailerName} promotions leaflet` : candidate
}

const GENERIC_LINK_CHROME =
  /^(view|download|open|read more|click here|here|pdf(?:\s*(?:-|–)\s*download)?|leaflet)$/i

function anchorText(html: string, matchIndex: number) {
  const closing = html.indexOf('</a>', matchIndex)
  if (closing < 0 || closing - matchIndex > 500) {
    return ''
  }
  const opening = html.indexOf('>', matchIndex)
  if (opening < 0 || opening >= closing) {
    return ''
  }
  const text = cleanText(html.slice(opening + 1, closing))
  return GENERIC_LINK_CHROME.test(text) ? '' : text
}

function nearestHeading(context: string) {
  const matches = Array.from(context.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi))
  return cleanText(matches.at(-1)?.[1] ?? '')
}

function nearestImage(context: string, baseUrl: string) {
  const matches = Array.from(context.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi))
  const rawPath = decodeHtml(matches.at(-1)?.[1] ?? '').trim()
  return rawPath ? absoluteHttpUrl(rawPath, baseUrl) : undefined
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
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim().slice(0, 180)
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;|&#8211;|&mdash;|&#8212;/g, '–')
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
