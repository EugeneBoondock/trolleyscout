import type { RetailerId, StoreLeaflet } from '../types'

// Big grocers that publish specials as digital leaflets rather than
// per-product API rows. We surface the catalogue name, valid dates, and the
// official leaflet link — genuinely useful, and honest about what it is.

export interface LeafletTarget {
  retailerId: RetailerId
  retailerName: string
  kind:
    | 'catalogue-directory'
    | 'official-html-index'
    | 'sixty60-api'
    | 'html-list'
    | 'html-pdf'
    | 'official-pdf-index'
    | 'sitebuilder-pdf'
    | 'pnp-cms'
    | 'tmpnp-catalogue'
  countryCode?: string
  sourceId?: string
  // For sixty60-api: the leaflet API base + a representative national store id.
  apiBase?: string
  storeId?: string
  // Resolve the retailer's current public branch code before reading leaflets.
  // The fixed id remains a fallback if the anonymous locator is unavailable.
  locator?: { latitude: number; longitude: number }
  // For html-list / html-pdf: the specials page to parse and its origin.
  pageUrl?: string
  origin?: string
  // For sitebuilder-pdf: every page that may link a leaflet PDF (a chain's
  // home page plus each branch page). Results are deduped by document URL.
  pageUrls?: string[]
  // Verified same-site documents used when an official index blocks edge
  // readers. The index is still checked so newly published files are found.
  documents?: Array<{ name: string; url: string }>
}

export const leafletTargets: LeafletTarget[] = [
  {
    apiBase: 'https://api.tmpnponline.co.zw/api/v1/catalog',
    countryCode: 'ZW',
    kind: 'tmpnp-catalogue',
    pageUrl: 'https://tmpnponline.co.zw/catalog',
    retailerId: 'pick-n-pay',
    retailerName: 'TM Pick n Pay',
    sourceId: 'tm-pick-n-pay-zw',
  },
  {
    countryCode: 'ZW',
    kind: 'official-pdf-index',
    origin: 'https://edgarsstores.co.zw',
    pageUrl: 'https://edgarsstores.co.zw/',
    documents: [{
      name: 'Edgars 2026 Winter Catalogue',
      url: 'https://edgarsstores.co.zw/images/Edgars%202026%20Winter%20Catalogue_web.pdf',
    }],
    retailerId: 'edgars-zimbabwe',
    retailerName: 'Edgars Zimbabwe',
    sourceId: 'edgars-zimbabwe',
  },
  {
    countryCode: 'ZW',
    kind: 'official-pdf-index',
    origin: 'https://techafrica.co.zw',
    pageUrl: 'https://techafrica.co.zw/',
    documents: [
      {
        name: 'Tech Africa Product Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Tech-Africa-Product-Catalogue.pdf',
      },
      {
        name: 'Tech Africa Generators Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Tech-Africa-Generators-Catalogue.pdf',
      },
      {
        name: 'Sterling AC Submersible Water Pumps Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Sterling-AC-Submersible-Water-Pumps-Catalogue.pdf',
      },
      {
        name: 'Sterling Solar DC Submersible Water Pumps Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Sterling-Solar-DC-Submersible-Water-Pumps-Catalogue.pdf',
      },
      {
        name: 'Tech Africa Water Pumps Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Tech-Africa-Water-Pumps-Catalogue.pdf',
      },
      {
        name: 'TechAir Compressors Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/TechAir-Compressors-Catalogue.pdf',
      },
      {
        name: 'Tech Africa Construction Equipment Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/02/Tech-Africa-Construction-Equipment-Catalogue.pdf',
      },
      {
        name: 'Sterling Booster Dewatering Swimming Pool Pumps Catalogue',
        url: 'https://techafrica.co.zw/wp-content/uploads/2025/03/Sterling-Booster-Dewatering-Swimming-Pool-Pumps-Catalogue.pdf',
      },
    ],
    retailerId: 'tech-africa-zimbabwe',
    retailerName: 'Tech Africa',
    sourceId: 'tech-africa-zimbabwe',
  },
  {
    countryCode: 'ZW',
    documents: [{
      name: 'College Press Zimbabwe Catalogue',
      url: 'https://www.collegepress.co.zw/files/Zimbabwe%20Catalogue%20%28005%29.pdf',
    }],
    kind: 'official-pdf-index',
    origin: 'https://www.collegepress.co.zw',
    pageUrl: 'https://www.collegepress.co.zw/catalogues-and-brochures',
    retailerId: 'college-press-zimbabwe',
    retailerName: 'College Press Zimbabwe',
    sourceId: 'college-press-zimbabwe',
  },
  {
    countryCode: 'ZA',
    kind: 'catalogue-directory',
    pageUrl: 'https://www.latestspecials.co.za/rss/',
    retailerId: 'latest-specials-za',
    retailerName: 'Latest Specials South Africa',
    sourceId: 'latest-specials-za',
  },
  {
    countryCode: 'ZA',
    kind: 'catalogue-directory',
    pageUrl: 'https://www.guzzle.co.za/specials/latest-online-catalogues/',
    retailerId: 'guzzle-za',
    retailerName: 'Guzzle South Africa',
    sourceId: 'guzzle-za',
  },
  {
    countryCode: 'ZA',
    kind: 'catalogue-directory',
    pageUrl: 'https://my-catalogue.co.za/',
    retailerId: 'my-catalogue-za',
    retailerName: 'My Catalogue South Africa',
    sourceId: 'my-catalogue-za',
  },
  {
    countryCode: 'ZA',
    kind: 'catalogue-directory',
    pageUrl: 'https://www.cataloguespecials.co.za/latest-catalogues',
    retailerId: 'catalogue-specials-za',
    retailerName: 'South African catalogue directory',
    sourceId: 'catalogue-specials-za',
  },
  {
    countryCode: 'ZA',
    kind: 'official-html-index',
    pageUrl: 'https://kitkatgroup.com/promotions.php',
    retailerId: 'kit-kat',
    retailerName: 'KIT KAT Cash & Carry',
  },
  {
    countryCode: 'ZA',
    kind: 'official-html-index',
    pageUrl: 'https://rootsbutchery.co.za/specials/',
    retailerId: 'roots-butchery',
    retailerName: 'Roots Butchery',
  },
  {
    countryCode: 'ZA',
    kind: 'official-html-index',
    pageUrl: 'https://obc.co.za/',
    retailerId: 'obc-better-butchery',
    retailerName: 'OBC Better Butchery',
  },
  {
    countryCode: 'ZA',
    kind: 'official-html-index',
    pageUrl: 'https://prestonsliquors.co.za/specials-brochure/',
    retailerId: 'prestons-liquors',
    retailerName: 'Prestons Liquors',
  },
  {
    countryCode: 'ZA',
    kind: 'sitebuilder-pdf',
    origin: 'https://www.presidenthyper.co.za',
    pageUrls: [
      'https://www.presidenthyper.co.za/weekly-specials-fochville/',
      'https://www.presidenthyper.co.za/weekly-specials-krugersdorp/',
      'https://www.presidenthyper.co.za/weekly-specials-vaal/',
      'https://www.presidenthyper.co.za/weekly-specials-rustenburg/',
    ],
    retailerId: 'president-hyper',
    retailerName: 'President Hyper',
  },
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
    locator: { latitude: -26.2041, longitude: 28.0473 },
    retailerId: 'shoprite',
    retailerName: 'Shoprite',
    storeId: '1080',
  },
  {
    apiBase: 'https://www.checkers.co.za',
    kind: 'sixty60-api',
    locator: { latitude: -26.2041, longitude: 28.0473 },
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

const TMPNP_CATALOGUE_HOST = 'cdn-s7m8bx8sebjz.vultrcdn.com'
const TMPNP_CATALOGUE_PAGE_SIZE = { height: 1280, width: 905 } as const

// TM Pick n Pay publishes one current leaflet as a set of full-resolution
// page images. Its storefront redirects datacentre requests, so the discovery
// worker reads the public Jina rendering and rebuilds the leaflet as one
// multi-page catalogue instead of five unrelated single-page cards.
export function extractTmpnpCatalogues(
  target: LeafletTarget,
  content: string,
  capturedAt: string,
): StoreLeaflet[] {
  const title = /^####\s+(.+?)\s*$/im.exec(content)?.[1]?.trim()
  const validFromMatch =
    /\bValid:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i.exec(content)
  const validToMatch =
    /\bDeadline:\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/i.exec(content)
  if (!title || !validFromMatch || !validToMatch) {
    return []
  }

  const validFrom = longDateToIso(
    validFromMatch[1],
    validFromMatch[2],
    validFromMatch[3],
  )
  const validTo = longDateToIso(
    validToMatch[1],
    validToMatch[2],
    validToMatch[3],
  )
  if (!validFrom || !validTo || validTo < capturedAt.slice(0, 10)) {
    return []
  }

  const pages = Array.from(
    content.matchAll(/\[Page\s+(\d+)\]\((https?:\/\/[^)\s]+)\)/gi),
  )
    .map((match) => ({
      imageUrl: trustedTmpnpCatalogueImage(match[2], 'catalog_downloads'),
      pageNumber: Number(match[1]),
    }))
    .filter(
      (page): page is { imageUrl: string; pageNumber: number } =>
        Boolean(page.imageUrl) &&
        Number.isSafeInteger(page.pageNumber) &&
        page.pageNumber > 0,
    )
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => ({
      ...TMPNP_CATALOGUE_PAGE_SIZE,
      imageUrl: page.imageUrl,
      pageNumber: page.pageNumber,
    }))

  if (pages.length < 2) {
    return []
  }

  const cover = Array.from(
    content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi),
  )
    .map((match) => trustedTmpnpCatalogueImage(match[1], 'catalog_images'))
    .find(Boolean)

  return [{
    capturedAt,
    countryCode: target.countryCode ?? 'ZW',
    id: leafletId(target.retailerId, `${validFrom}:${pages[0].imageUrl}`),
    imageUrl: cover ?? pages[0].imageUrl,
    name: title,
    pages,
    priceScope: { type: 'national' },
    retailerId: target.retailerId,
    retailerName: target.retailerName,
    retailerUrl: target.pageUrl,
    sourceId: target.sourceId,
    sourceLabel: 'Official TM Pick n Pay catalogue',
    url: target.pageUrl ?? pages[0].imageUrl,
    validFrom,
    validTo,
  }]
}

interface TmpnpApiCatalogue {
  expiry_date?: unknown
  formatted_expiry_date?: unknown
  formatted_start_date?: unknown
  id?: unknown
  image_path?: unknown
  locations?: unknown
  start_date?: unknown
  title?: unknown
}

interface TmpnpApiPage {
  file_path?: unknown
  location_name?: unknown
}

export function extractTmpnpApiCatalogues(
  target: LeafletTarget,
  payload: unknown,
  capturedAt: string,
): StoreLeaflet[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((value): StoreLeaflet[] => {
    if (!value || typeof value !== 'object') {
      return []
    }
    const row = value as TmpnpApiCatalogue
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const validFrom = apiDateToIso(row.start_date) ??
      apiLongDateToIso(row.formatted_start_date)
    const validTo = apiDateToIso(row.expiry_date) ??
      apiLongDateToIso(row.formatted_expiry_date)
    if (!title || !validFrom || !validTo || validTo < capturedAt.slice(0, 10)) {
      return []
    }

    const pages = (Array.isArray(row.locations) ? row.locations : [])
      .flatMap((value): Array<{ imageUrl: string; pageNumber: number }> => {
        if (!value || typeof value !== 'object') {
          return []
        }
        const page = value as TmpnpApiPage
        const pageNumber = typeof page.location_name === 'string'
          ? Number(/\bPage\s+(\d+)\b/i.exec(page.location_name)?.[1])
          : Number.NaN
        const imageUrl = trustedTmpnpCatalogueImage(
          typeof page.file_path === 'string' ? page.file_path : undefined,
          'catalog_downloads',
        )
        return imageUrl && Number.isSafeInteger(pageNumber) && pageNumber > 0
          ? [{ imageUrl, pageNumber }]
          : []
      })
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page) => ({ ...TMPNP_CATALOGUE_PAGE_SIZE, ...page }))

    if (pages.length < 2) {
      return []
    }

    const cover = trustedTmpnpCatalogueImage(
      typeof row.image_path === 'string' ? row.image_path : undefined,
      'catalog_images',
    )
    const identity = `${String(row.id ?? '')}:${validFrom}:${pages[0].imageUrl}`
    return [{
      capturedAt,
      countryCode: target.countryCode ?? 'ZW',
      id: leafletId(target.retailerId, identity),
      imageUrl: cover ?? pages[0].imageUrl,
      name: title,
      pages,
      priceScope: { type: 'national' },
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      retailerUrl: target.pageUrl,
      sourceId: target.sourceId,
      sourceLabel: 'Official TM Pick n Pay catalogue',
      url: target.pageUrl ?? pages[0].imageUrl,
      validFrom,
      validTo,
    }]
  })
}

function apiDateToIso(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return /^(\d{4}-\d{2}-\d{2})(?:\s|T|$)/.exec(value.trim())?.[1]
}

function apiLongDateToIso(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(value.trim())
  return match ? longDateToIso(match[1], match[2], match[3]) : undefined
}

function trustedTmpnpCatalogueImage(
  value: string | undefined,
  directory: 'catalog_downloads' | 'catalog_images',
): string | undefined {
  try {
    const url = new URL(value ?? '')
    return (
      url.protocol === 'https:' &&
      url.hostname === TMPNP_CATALOGUE_HOST &&
      !url.port &&
      !url.username &&
      !url.password &&
      new RegExp(`^/${directory}/[A-Za-z0-9_-]+\\.jpe?g$`, 'i').test(url.pathname)
    )
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

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
  limit = 16,
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
    const documentUrl = target.origin ? `${target.origin}${path}` : path
    const details = pdfLeafletDetails(target, html, match.index)

    leaflets.push({
      capturedAt,
      // The link IS the leaflet PDF, so record it as the document too: readers
      // open documentUrl, and without it these leaflets cannot be viewed.
      documentUrl,
      id: leafletId(target.retailerId, path),
      imageUrl: details.imageUrl,
      name: pdfLeafletName(target.retailerName, path),
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      url: details.viewerUrl ?? documentUrl,
      validFrom: details.validFrom,
      validTo: details.validTo,
    })
  }

  return leaflets
}

// Some Zimbabwe retailers publish real multi-page PDF catalogues from their
// own home page. Keep only same-site PDF links labelled as catalogues, and
// drop documents whose title names a year older than the current one.
export function extractOfficialPdfIndexLeaflets(
  target: LeafletTarget,
  html: string,
  capturedAt: string,
  limit = 24,
): StoreLeaflet[] {
  const leaflets: StoreLeaflet[] = []
  const seen = new Set<string>()
  const currentYear = Number(capturedAt.slice(0, 4))
  const links = [
    ...Array.from(
      html.matchAll(
        /<a\b[^>]*\bhref=["']([^"']+?\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi,
      ),
      (match) => ({ href: match[1], label: match[2] }),
    ),
    ...Array.from(
      html.matchAll(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+?\.pdf(?:\?[^)\s]*)?)\)/gi,
      ),
      (match) => ({ href: match[2], label: match[1] }),
    ).filter((link) => !link.label.trim().startsWith('![')),
  ]

  for (const link of links) {
    if (leaflets.length >= limit) {
      break
    }
    const documentUrl = trustedSameOriginPdf(
      link.href,
      target.origin ?? target.pageUrl,
    )
    if (!documentUrl || seen.has(documentUrl)) {
      continue
    }

    const linkText = cleanText(link.label)
    const filename = decodeURIComponent(new URL(documentUrl).pathname.split('/').pop() ?? '')
    const descriptor = `${linkText} ${filename}`.trim()
    if (!/\b(?:catalogue|catalog|lookbook|brochure|specials?|promotions?|deals?|offers?)\b/i.test(descriptor)) {
      continue
    }

    const namedYear = /\b(20\d{2})\b/.exec(`${linkText} ${filename}`)?.[1]
    if (
      namedYear &&
      Number.isSafeInteger(currentYear) &&
      Number(namedYear) < currentYear
    ) {
      continue
    }

    seen.add(documentUrl)
    const name = linkText || cleanPdfCatalogueName(filename, target.retailerName)
    leaflets.push({
      capturedAt,
      countryCode: target.countryCode,
      documentUrl,
      id: leafletId(target.retailerId, documentUrl),
      name,
      priceScope: { type: 'national' },
      retailerId: target.retailerId,
      retailerName: target.retailerName,
      retailerUrl: target.pageUrl,
      sourceId: target.sourceId,
      sourceLabel: `Official ${target.retailerName} catalogue`,
      url: documentUrl,
    })
  }

  return leaflets
}

function trustedSameOriginPdf(
  value: string | undefined,
  origin: string | undefined,
): string | undefined {
  try {
    const base = new URL(origin ?? '')
    const url = new URL(value ?? '', base)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.origin === base.origin &&
      /\.pdf$/i.test(url.pathname) &&
      !url.username &&
      !url.password
    )
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function cleanPdfCatalogueName(filename: string, retailerName: string): string {
  const cleaned = filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || `${retailerName} catalogue`
}

function pdfLeafletDetails(
  target: LeafletTarget,
  html: string,
  matchIndex: number,
): {
  imageUrl?: string
  validFrom?: string
  validTo?: string
  viewerUrl?: string
} {
  const context = html.slice(matchIndex, matchIndex + 2_000)
  const rendition = /^\/content\/dam\/[^"'<> ]+?\.pdf\/_jcr_content\/renditions\/[^"'<> ]+\.(?:jpe?g|png|webp)/i
    .exec(context)?.[0]
  const imageUrl = rendition && target.origin
    ? absoluteHttpUrl(rendition, target.origin)
    : undefined
  const dateRange =
    /\bValid\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/i.exec(context)
  const validUntil =
    /\bValid\s+until[\s\S]{0,180}?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(context)
  const validUntilTimestamp =
    /\bdata-valid-until-timestamp=["'](\d{12,13})["']/i.exec(context)
  const viewerMatch =
    /\bdata-leaflet-external-url=["'](https:\/\/specials\.shoprite\.co\.za\/deals\/[a-z0-9/-]+\/index\.html)["']/i.exec(context)

  return {
    imageUrl,
    validFrom: dateRange ? toIsoDate(dateRange[1]) : undefined,
    validTo: dateRange
      ? toIsoDate(dateRange[2])
      : validUntil
        ? longDateToIso(validUntil[1], validUntil[2], validUntil[3])
        : epochMillisecondsToIsoDate(validUntilTimestamp?.[1]),
    viewerUrl: trustedShopriteSpecialsUrl(viewerMatch?.[1]),
  }
}

function trustedShopriteSpecialsUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? '')
    return (
      url.protocol === 'https:' &&
      url.hostname === 'specials.shoprite.co.za' &&
      /^\/deals\/[a-z0-9/-]+\/index\.html$/i.test(url.pathname)
    )
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function longDateToIso(day: string, month: string, year: string): string | undefined {
  const monthIndex = Object.keys(MONTHS).indexOf(month.toLowerCase())
  return monthIndex < 0
    ? undefined
    : isoCalendarDate(Number(year), monthIndex + 1, Number(day))
}

function epochMillisecondsToIsoDate(value: string | undefined): string | undefined {
  const timestamp = Number(value)

  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    return undefined
  }

  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10)
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
