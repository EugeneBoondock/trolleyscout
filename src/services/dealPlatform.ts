// Generic deal-platform detection. Many South African stores — not just the
// big chains — run their product search on the same hosted platforms (Klevu,
// Constructor.io, Algolia). If we can spot the platform and its public key in a
// store's own page HTML, we can query its deals API the exact same way we do
// for Dis-Chem (Klevu) and Woolworths (Constructor.io), even for an
// independent store we have never seen before.

export interface KlevuDetection {
  platform: 'klevu'
  // Often absent from the page HTML (it lives in Klevu's external bootstrap
  // JS). Resolve with buildKlevuBootstrapUrl + extractKlevuSearchDomain.
  searchDomain?: string
  apiKey: string
}

export interface ConstructorDetection {
  platform: 'constructor'
  apiKey: string
  // The store's own cnstrc.com host (e.g. "abc123-zone.cnstrc.com") when the
  // page HTML names one; falls back to the shared "ac.cnstrc.com" cluster.
  host?: string
}

export interface AlgoliaDetection {
  platform: 'algolia'
  appId: string
  apiKey: string
  index?: string
}

export type DealPlatformDetection = KlevuDetection | ConstructorDetection | AlgoliaDetection

// A single promoted product, platform-agnostic, ready to become a promotion.
export interface PlatformDeal {
  title: string
  priceCents: number
  previousPriceCents?: number
  imageUrl?: string
  productUrl?: string
  promoLabel?: string
}

const KLEVU_KEY = /klevu[-_]?apiKey\s*[:=]\s*["'](klevu-[0-9a-z]+)["']/i
const KLEVU_KEY_ALT = /["'](klevu-\d{10,})["']/
// Matches klevu_userSearchDomain / klevu_cmsSearchDomain / searchingUrl etc.
const KLEVU_SEARCH_DOMAIN =
  /[a-z0-9_]*search[a-z0-9_]*(?:domain|url)\s*[:=]\s*["'](?:https?:\/\/)?([a-z0-9.-]*ksearchnet\.com)["']/i

const CONSTRUCTOR_KEY = /["'](key_[A-Za-z0-9]{12,})["']/
const CONSTRUCTOR_HOST = /([a-z0-9-]+)\.cnstrc\.com/i

const ALGOLIA_APP = /(?:algolia[_-]?)?app(?:lication)?[_-]?id["'\s:=]+["']([A-Z0-9]{8,})["']/i
const ALGOLIA_KEY = /(?:algolia[_-]?)?(?:search[_-]?)?api[_-]?key["'\s:=]+["']([a-f0-9]{20,})["']/i
const ALGOLIA_SIGNATURE = /algolia(?:net\.com|\.net|search)/i

// Returns the first deal platform whose signature and public key are present.
export function detectDealPlatform(html: string): DealPlatformDetection | undefined {
  const klevu = detectKlevu(html)
  if (klevu) {
    return klevu
  }

  const constructor = detectConstructor(html)
  if (constructor) {
    return constructor
  }

  return detectAlgolia(html)
}

export function detectKlevu(html: string): KlevuDetection | undefined {
  if (!/ksearchnet\.com|klevu/i.test(html)) {
    return undefined
  }

  const apiKey = KLEVU_KEY.exec(html)?.[1] ?? KLEVU_KEY_ALT.exec(html)?.[1]

  if (!apiKey) {
    return undefined
  }

  // Domain is optional here — resolvable from the bootstrap JS.
  const searchDomain = KLEVU_SEARCH_DOMAIN.exec(html)?.[1]
  return { apiKey, platform: 'klevu', ...(searchDomain ? { searchDomain } : {}) }
}

// Klevu publishes each store's config at a deterministic URL keyed by API key.
export function buildKlevuBootstrapUrl(apiKey: string): string {
  return `https://js.klevu.com/klevu-js-v1/klevu-js-api/${apiKey}.js`
}

export function extractKlevuSearchDomain(js: string): string | undefined {
  return KLEVU_SEARCH_DOMAIN.exec(js)?.[1]
}

export function detectConstructor(html: string): ConstructorDetection | undefined {
  const hostMatch = CONSTRUCTOR_HOST.exec(html)
  if (!hostMatch) {
    return undefined
  }

  const apiKey = CONSTRUCTOR_KEY.exec(html)?.[1]
  const host = `${hostMatch[1]}.cnstrc.com`.toLowerCase()
  return apiKey ? { apiKey, host, platform: 'constructor' } : undefined
}

export function detectAlgolia(html: string): AlgoliaDetection | undefined {
  if (!ALGOLIA_SIGNATURE.test(html)) {
    return undefined
  }

  const appId = ALGOLIA_APP.exec(html)?.[1]
  const apiKey = ALGOLIA_KEY.exec(html)?.[1]

  if (!appId || !apiKey) {
    return undefined
  }

  const index = /["']([a-z0-9_]*prod[a-z0-9_]*products?[a-z0-9_]*)["']/i.exec(html)?.[1]
  return { apiKey, appId, index, platform: 'algolia' }
}

// Klevu: query its uniform search API for a wildcard term; every Klevu store
// exposes the same fields. We keep only items that are genuinely cheaper than
// their base/old price (i.e. on promotion).
export function buildKlevuDealsUrl(detection: KlevuDetection, offset = 0, pageSize = 50): string {
  const params = new URLSearchParams({
    enableFilters: 'false',
    noOfResults: String(pageSize),
    paginationStartsFrom: String(offset),
    responseType: 'json',
    showOutOfStockProducts: 'false',
    term: '*',
    ticket: detection.apiKey,
  })

  return `https://${detection.searchDomain}/cloud-search/n-search/search?${params.toString()}`
}

export function parseKlevuDeals(payload: unknown, storeHost?: string): PlatformDeal[] {
  const rows = isRecord(payload) && Array.isArray(payload.result) ? payload.result : []
  const deals: PlatformDeal[] = []

  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }

    const title = textValue(row.name)
    const priceCents = moneyToCents(textValue(row.salePrice) || textValue(row.price))

    if (!title || priceCents === undefined) {
      continue
    }

    const oldCents = moneyToCents(textValue(row.oldPrice))
    const baseCents = moneyToCents(textValue(row.basePrice) || textValue(row.startPrice))
    const previousPriceCents =
      oldCents !== undefined && oldCents > priceCents
        ? oldCents
        : baseCents !== undefined && baseCents > priceCents
          ? baseCents
          : undefined

    // Only surface real promotions from a generic store — a cheaper-than-base
    // price, or an explicit discount field.
    const hasDiscount = previousPriceCents !== undefined || Boolean(textValue(row.discount))
    if (!hasDiscount) {
      continue
    }

    deals.push({
      imageUrl: absoluteUrl(textValue(row.imageUrl) || textValue(row.image), storeHost),
      previousPriceCents,
      priceCents,
      productUrl: absoluteUrl(textValue(row.url), storeHost),
      promoLabel:
        previousPriceCents !== undefined
          ? `Save R${((previousPriceCents - priceCents) / 100).toFixed(2)}`
          : 'On promotion',
      title,
    })
  }

  return deals
}

// Constructor.io: every store exposes the same public search API keyed by the
// key_... token in its client JS. We search a promo-ish term and keep only
// items whose sale price beats their regular price.
export function buildConstructorDealsUrl(
  detection: ConstructorDetection,
  term = 'special',
  pageSize = 50,
): string {
  const host = detection.host ?? 'ac.cnstrc.com'
  const params = new URLSearchParams({
    c: 'ciojs-client-2.62.2',
    key: detection.apiKey,
    num_results_per_page: String(pageSize),
    page: '1',
  })

  return `https://${host}/search/${encodeURIComponent(term)}?${params.toString()}`
}

const SALE_PRICE_KEYS = [
  'sale_price',
  'salePrice',
  'special_price',
  'specialPrice',
  'promo_price',
  'promoPrice',
]
const REGULAR_PRICE_KEYS = [
  'list_price',
  'listPrice',
  'regular_price',
  'regularPrice',
  'original_price',
  'originalPrice',
  'was_price',
  'wasPrice',
  'compare_at_price',
  'rrp',
]

export function parseConstructorDeals(payload: unknown, storeHost?: string): PlatformDeal[] {
  const response = isRecord(payload) && isRecord(payload.response) ? payload.response : undefined
  const rows = response && Array.isArray(response.results) ? response.results : []
  const deals: PlatformDeal[] = []

  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }

    const data = isRecord(row.data) ? row.data : {}
    const title = textValue(row.value) || textValue(data.name)
    const deal = discountedDeal(title, data, storeHost, {
      imageKeys: ['image_url', 'imageUrl', 'image'],
      urlKeys: ['url', 'link'],
    })

    if (deal) {
      deals.push(deal)
    }
  }

  return deals
}

// Algolia: needs the app id, a public search key, and an index name from the
// page HTML. Queryable only when all three surfaced.
export function buildAlgoliaDealsRequest(
  detection: AlgoliaDetection,
  hitsPerPage = 50,
): { url: string; init: { body: string; headers: Record<string, string>; method: 'POST' } } | undefined {
  if (!detection.index) {
    return undefined
  }

  return {
    init: {
      body: JSON.stringify({ params: `query=&hitsPerPage=${hitsPerPage}` }),
      headers: {
        'content-type': 'application/json',
        'x-algolia-api-key': detection.apiKey,
        'x-algolia-application-id': detection.appId,
      },
      method: 'POST',
    },
    url: `https://${detection.appId.toLowerCase()}-dsn.algolia.net/1/indexes/${encodeURIComponent(detection.index)}/query`,
  }
}

export function parseAlgoliaDeals(payload: unknown, storeHost?: string): PlatformDeal[] {
  const rows = isRecord(payload) && Array.isArray(payload.hits) ? payload.hits : []
  const deals: PlatformDeal[] = []

  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }

    const title = textValue(row.name) || textValue(row.title)
    const deal = discountedDeal(title, row, storeHost, {
      imageKeys: ['image_url', 'imageUrl', 'image', 'thumbnail'],
      urlKeys: ['url', 'link', 'product_url'],
    })

    if (deal) {
      deals.push(deal)
    }
  }

  return deals
}

// Shared promotion filter: a record is a deal only when a sale-price field
// undercuts a regular-price field — generic stores get no benefit of doubt.
function discountedDeal(
  title: string,
  record: Record<string, unknown>,
  storeHost: string | undefined,
  fields: { imageKeys: string[]; urlKeys: string[] },
): PlatformDeal | undefined {
  if (!title) {
    return undefined
  }

  const saleCents = firstCents(record, SALE_PRICE_KEYS)
  const regularCents = firstCents(record, REGULAR_PRICE_KEYS) ?? firstCents(record, ['price'])

  const priceCents = saleCents ?? regularCents
  if (priceCents === undefined) {
    return undefined
  }

  const previousPriceCents =
    saleCents !== undefined && regularCents !== undefined && regularCents > saleCents
      ? regularCents
      : undefined

  if (previousPriceCents === undefined) {
    return undefined
  }

  return {
    imageUrl: absoluteUrl(firstText(record, fields.imageKeys), storeHost),
    previousPriceCents,
    priceCents,
    productUrl: absoluteUrl(firstText(record, fields.urlKeys), storeHost),
    promoLabel: `Save R${((previousPriceCents - priceCents) / 100).toFixed(2)}`,
    title,
  }
}

function firstCents(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const cents = moneyToCents(textValue(record[key]))
    if (cents !== undefined) {
      return cents
    }
  }

  return undefined
}

function firstText(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = textValue(record[key])
    if (value) {
      return value
    }
  }

  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function moneyToCents(value: string): number | undefined {
  if (!value) {
    return undefined
  }

  const cleaned = value.replace(/[^\d,.]/g, '')
  const normalized = cleaned.includes('.') ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function absoluteUrl(value: string, storeHost?: string): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    if (/^https?:\/\//i.test(value)) {
      return value
    }
    if (storeHost) {
      return new URL(value, `https://${storeHost}`).toString()
    }
  } catch {
    return undefined
  }

  return undefined
}
