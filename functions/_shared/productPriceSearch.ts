import { searchWeb } from './searchWeb'
import type {
  CountryOption,
  DiscoveredDeal,
  ProductComparisonResult,
  Retailer,
  RetailerProductSearchMatch,
} from '../../src/types'

export interface RetailerProductCandidate {
  priceCents: number
  productUrl: string
  title: string
}

export interface OfficialSearchCandidate {
  priceCents?: number
  productUrl: string
  title: string
}

type SearchableRetailer = Pick<Retailer, 'id' | 'name' | 'sources'>

interface WebSearchResult {
  title: string
  url: string
}

interface ProductSearchDependencies {
  currencyCode?: string
  fetcher?: typeof fetch
  searcher?: (query: string) => Promise<WebSearchResult[]>
}

export interface ProductSearchInput {
  query: string
  retailerIds: string[]
}

const WOOLWORTHS_ORIGIN = 'https://www.woolworths.co.za'
const MAX_PRODUCT_RESPONSE_BYTES = 2_000_000
const MAX_PROMOTION_FALLBACK_AGE_MS = 72 * 60 * 60 * 1_000
const MAX_RETAILERS = 16
const BROWSER_HEADERS = {
  accept: 'application/json',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
}

export interface ProductSearchRequest {
  init?: RequestInit
  url: string
}

// Shoprite Group's storefronts expose an anonymous "browse this store's shelf"
// API: no login, no cookie — a browser User-Agent is the only requirement
// (a missing UA gets a Cloudflare 403). Prices are store-specific, so we pin a
// stable Cape Town supermarket per chain for representative national pricing,
// exactly as the Pick n Pay adapter pins storeCode WC21. Store ids are stable
// and cacheable; if one ever rotates the adapter simply yields nothing and the
// catalogue fallback covers it.
const SHOPRITE_GROUP_STORES: Record<string, { host: string; storeId: string }> = {
  checkers: { host: 'www.checkers.co.za', storeId: '69e5fc74fa670d43ca761f5a' },
  shoprite: { host: 'www.shoprite.co.za', storeId: '6a2c0cf571db63b9c330f049' },
}

export function normalizeProductSearchInput(input: unknown): ProductSearchInput {
  const record = isRecord(input) ? input : {}
  const query = typeof record.query === 'string' ? record.query.trim().replace(/\s+/g, ' ') : ''
  const retailerIds = Array.isArray(record.retailerIds)
    ? [...new Set(record.retailerIds
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean))]
    : []

  if (query.length < 2 || retailerIds.length < 2) {
    throw new Error('Enter at least two characters and pick at least two stores.')
  }
  if (query.length > 80) {
    throw new Error('Keep the product search under 80 characters.')
  }
  if (retailerIds.length > MAX_RETAILERS) {
    throw new Error(`Compare no more than ${MAX_RETAILERS} stores at once.`)
  }

  return { query, retailerIds }
}

export function buildKnownProductSearchRequest(
  retailerId: string,
  query: string,
): ProductSearchRequest | undefined {
  if (retailerId === 'woolworths') {
    const params = new URLSearchParams({
      c: 'ciojs-client-2.62.2',
      key: 'key_tw9hKe0fkfgEf36D',
      num_results_per_page: '12',
      page: '1',
    })
    return {
      init: { headers: BROWSER_HEADERS },
      url: `https://wpkmgeuco-zone.cnstrc.com/search/${encodeURIComponent(query)}?${params.toString()}`,
    }
  }

  if (retailerId === 'dis-chem') {
    const url = new URL('https://eucs7.ksearchnet.com/cloud-search/n-search/search')
    url.searchParams.set('ticket', 'klevu-15264750100467933')
    url.searchParams.set('term', query)
    url.searchParams.set('responseType', 'json')
    url.searchParams.set('showOutOfStockProducts', 'false')
    url.searchParams.set('noOfResults', '12')
    url.searchParams.set('paginationStartsFrom', '0')
    url.searchParams.set('enableFilters', 'false')
    return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
  }

  if (retailerId === 'clicks') {
    const url = new URL('https://clicks.co.za/products/c/OH1/results')
    url.searchParams.set('q', query)
    url.searchParams.set('page', '0')
    return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
  }

  const shopriteGroup = SHOPRITE_GROUP_STORES[retailerId]
  if (shopriteGroup) {
    return {
      init: {
        body: JSON.stringify({
          payload: {
            filter: {
              paginationOptions: { page: 0, pageSize: 12 },
              productListSource: { search: query },
            },
            userContext: { storeIds: [shopriteGroup.storeId] },
          },
        }),
        headers: { ...BROWSER_HEADERS, 'content-type': 'application/json' },
        method: 'POST',
      },
      url: `https://${shopriteGroup.host}/api/browse-by-store/get-products-filter`,
    }
  }

  if (retailerId === 'pick-n-pay') {
    // PnP's OCC storefront search answers anonymously, but only as POST —
    // GET routes "search" as a product code and 404s.
    const url = new URL('https://www.pnp.co.za/pnphybris/v2/pnp-spa/products/search')
    url.searchParams.set(
      'fields',
      'products(code,name,price(value,formattedValue),url,stock(stockLevelStatus))',
    )
    url.searchParams.set('query', query)
    url.searchParams.set('pageSize', '12')
    url.searchParams.set('storeCode', 'WC21')
    url.searchParams.set('lang', 'en')
    url.searchParams.set('curr', 'ZAR')
    return {
      init: {
        headers: {
          ...BROWSER_HEADERS,
          'content-type': 'application/json',
          referer: 'https://www.pnp.co.za/',
        },
        method: 'POST',
      },
      url: url.toString(),
    }
  }

  if (retailerId === 'takealot') {
    // Takealot's own search API — using their ranking also ends the
    // "milk 2L returns a milk canister" class of mismatch.
    const url = new URL('https://api.takealot.com/rest/v-1-13-0/searches/products')
    url.searchParams.set('qsearch', query)
    url.searchParams.set('rows', '12')
    return { init: { headers: BROWSER_HEADERS }, url: url.toString() }
  }

  if (retailerId === 'game') {
    const url = new URL(
      'https://api-beta-game.walmart.com/occ/v2/game/channel/web/zone/G205/products/search',
    )
    url.searchParams.set('fields', 'FULL')
    url.searchParams.set('currentPage', '0')
    url.searchParams.set('pageSize', '12')
    return {
      init: {
        body: JSON.stringify({ query }),
        headers: {
          ...BROWSER_HEADERS,
          'content-type': 'application/json',
          referer: 'https://www.game.co.za/',
        },
        method: 'POST',
      },
      url: url.toString(),
    }
  }

  return undefined
}

export function parseWoolworthsProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const response = recordValue(payload, 'response')
  const rows = arrayValue(response, 'results')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const data = recordValue(row, 'data')
    const title = textValue(data, 'description')
    const path = textValue(data, 'url')
    const priceCents = firstMoney(data, ['p10', 'p30', 'p20'])
    const productUrl = absoluteHttpsUrl(path, WOOLWORTHS_ORIGIN)

    if (title && productUrl && priceCents !== undefined && matchesQuery(title, query)) {
      products.push({ priceCents, productUrl, title })
    }
  }

  return products
}

export function parseKlevuProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const rows = arrayValue(payload, 'result')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const title = textValue(row, 'name')
    const priceCents = firstMoney(row, ['salePrice', 'price'])
    const productUrl = absoluteHttpsUrl(textValue(row, 'url'))

    if (title && productUrl && priceCents !== undefined && matchesQuery(title, query)) {
      products.push({ priceCents, productUrl, title })
    }
  }

  return products
}

export function parseClicksProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const rows = arrayValue(payload, 'results')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const brand = textValue(row, 'brand')
    const name = textValue(row, 'name')
    const title = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
      ? `${brand} ${name}`
      : name
    const stock = recordValue(recordValue(row, 'stock'), 'stockLevelStatus')
    const price = recordValue(row, 'price')
    const priceCents = firstMoney(price, ['grossPriceWithPromotionApplied', 'value', 'formattedValue'])
    const productUrl = absoluteHttpsUrl(textValue(row, 'url'), 'https://clicks.co.za')

    if (
      title
      && textValue(stock, 'code') !== 'outOfStock'
      && productUrl
      && priceCents !== undefined
      && matchesQuery(title, query)
    ) {
      products.push({ priceCents, productUrl, title })
    }
  }

  return products
}

// Shoprite and Checkers share the Shoprite-Group product shape: title in
// `name`, rand price in `price` (or priceWithoutDecimal/priceFactor), and a
// product page at /product/<id>.
export function parseShopriteGroupProductResults(
  retailerId: string,
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const store = SHOPRITE_GROUP_STORES[retailerId]
  if (!store) {
    return []
  }
  const rows = arrayValue(payload, 'products')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }
    const title = textValue(row, 'name') || textValue(row, 'displayName')
    const priceCents = shopriteGroupPriceCents(row)
    const id = textValue(row, 'id')
    if (!title || priceCents === undefined || !id || !matchesQuery(title, query)) {
      continue
    }
    products.push({
      priceCents,
      productUrl: `https://${store.host}/product/${encodeURIComponent(id)}`,
      title,
    })
  }

  return products
}

function shopriteGroupPriceCents(row: Record<string, unknown>): number | undefined {
  // A live promotion price wins; otherwise the shelf price, taken from the
  // decimal `price` when present or reconstructed from the integer pair.
  const direct = firstMoney(row, ['discountedPrice', 'price'])
  if (direct !== undefined) {
    return direct
  }
  const factor = typeof row.priceFactor === 'number' && row.priceFactor > 0 ? row.priceFactor : 100
  const whole = row.priceWithoutDecimal
  return typeof whole === 'number' && whole > 0 ? Math.round((whole / factor) * 100) : undefined
}

export function parsePnpProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const rows = arrayValue(payload, 'products')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const title = textValue(row, 'name')
    const stock = recordValue(row, 'stock')
    const priceCents = firstMoney(recordValue(row, 'price'), ['value', 'formattedValue'])
    const productUrl = absoluteHttpsUrl(textValue(row, 'url'), 'https://www.pnp.co.za')

    if (
      title
      && textValue(stock, 'stockLevelStatus') !== 'outOfStock'
      && productUrl
      && priceCents !== undefined
      && matchesQuery(title, query)
    ) {
      products.push({ priceCents, productUrl, title })
    }
  }

  return products
}

export function parseTakealotProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const sections = recordValue(payload, 'sections')
  const rows = arrayValue(recordValue(sections, 'products'), 'results')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const views = recordValue(row, 'product_views')
    const core = recordValue(views, 'core')
    const title = textValue(core, 'title')
    const slug = textValue(core, 'slug')
    const plid = textValue(core, 'id')
    const buybox = recordValue(views, 'buybox_summary')
    const prices = isRecord(buybox) && Array.isArray(buybox.prices) ? buybox.prices : []
    const priceCents = moneyToCents(prices[0])
    const stock = recordValue(views, 'stock_availability_summary')
    const inStock = !isRecord(stock) || stock.is_in_stock !== false

    if (title && slug && plid && inStock && priceCents !== undefined && matchesQuery(title, query)) {
      products.push({
        priceCents,
        productUrl: `https://www.takealot.com/${slug}/PLID${plid}`,
        title,
      })
    }
  }

  return products
}

export function parseGameProductResults(
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  const rows = arrayValue(payload, 'products')
  const products: RetailerProductCandidate[] = []

  for (const row of rows) {
    const title = textValue(row, 'name')
    const priceCents = firstMoney(recordValue(row, 'price'), ['value', 'formattedValue'])
    const productUrl = absoluteHttpsUrl(textValue(row, 'url'), 'https://www.game.co.za')
    if (title && productUrl && priceCents !== undefined && matchesQuery(title, query)) {
      products.push({ priceCents, productUrl, title })
    }
  }

  return products
}

export function selectOfficialSearchCandidate(
  retailer: SearchableRetailer,
  query: string,
  results: WebSearchResult[],
  currencyCode = 'ZAR',
): OfficialSearchCandidate | undefined {
  const officialHosts = retailer.sources
    .map((source) => safeHost(source.url))
    .filter((host): host is string => Boolean(host))

  for (const result of results) {
    const url = absoluteHttpsUrl(result.url)
    if (!url) continue
    const resultHost = safeHost(url)
    if (!resultHost || !officialHosts.some((host) => sameSiteHost(resultHost, host))) continue
    const title = cleanExternalTitle(result.title)
    if (!matchesQuery(title, query)) continue
    const priceCents = extractCurrencyPrice(title, currencyCode)
    return {
      ...(priceCents !== undefined ? { priceCents } : {}),
      productUrl: url,
      title,
    }
  }

  return undefined
}

export async function searchRetailerProduct(
  retailer: SearchableRetailer,
  query: string,
  dependencies: ProductSearchDependencies = {},
): Promise<RetailerProductSearchMatch> {
  const fetcher = dependencies.fetcher ?? fetch
  const searcher = dependencies.searcher ?? ((searchQuery) => searchWeb(searchQuery))
  const request = buildKnownProductSearchRequest(retailer.id, query)

  if (request) {
    try {
      const response = await fetcher(request.url, {
        ...request.init,
        signal: request.init?.signal ?? AbortSignal.timeout(8_000),
      })
      if (response.ok) {
        const contentLength = Number(response.headers.get('content-length') ?? '0')
        if (contentLength > MAX_PRODUCT_RESPONSE_BYTES) throw new Error('Response is too large.')
        const body = await response.text()
        if (body.length > MAX_PRODUCT_RESPONSE_BYTES) throw new Error('Response is too large.')
        const payload = JSON.parse(body) as unknown
        const products = parseKnownProductResults(retailer.id, payload, query)
        // Relevance first, price second. Cheapest-wins used to pick any cheap
        // product whose title merely contained the query tokens ("eggs" →
        // "marshmallow eggs"); the closest title now wins, and the runners-up
        // ride along so the shopper can swap when word overlap fools us.
        const ranked = [...products].sort(
          (left, right) =>
            candidateRelevance(right.title, query) - candidateRelevance(left.title, query) ||
            left.priceCents - right.priceCents,
        )
        const product = ranked[0]
        if (product) {
          return {
            ...product,
            alternatives: ranked
              .slice(1, 1 + MAX_MATCH_ALTERNATIVES)
              .map(({ priceCents, productUrl, title }) => ({ priceCents, productUrl, title })),
            retailerId: retailer.id,
            retailerName: retailer.name,
            sourceKind: 'retailer-api',
            status: 'priced',
          }
        }
        // The retailer's own search answered and had no real match — that is
        // the authoritative "not stocked" signal. Falling through to a
        // generic web search from here is where junk results (a "milk
        // canister" for a milk query) used to come from.
        return {
          retailerId: retailer.id,
          retailerName: retailer.name,
          status: 'unavailable',
        }
      }
    } catch {
      // Continue to an official-site search when a retailer API is unavailable.
    }
  }

  const officialHost = retailer.sources
    .map((source) => safeHost(source.url))
    .find((host): host is string => Boolean(host))
  if (officialHost) {
    try {
      const candidate = selectOfficialSearchCandidate(
        retailer,
        query,
        await searcher(`site:${officialHost} ${retailer.name} ${query} price`),
        dependencies.currencyCode,
      )
      if (candidate) {
        const pagePriceCents = candidate.priceCents ?? await fetchOfficialProductPagePrice(
          candidate.productUrl,
          query,
          dependencies.currencyCode ?? 'ZAR',
          fetcher,
        )
        return {
          ...candidate,
          ...(pagePriceCents !== undefined ? { priceCents: pagePriceCents } : {}),
          retailerId: retailer.id,
          retailerName: retailer.name,
          sourceKind: 'official-site',
          status: pagePriceCents === undefined ? 'found' : 'priced',
        }
      }
    } catch {
      // The unavailable status is explicit and never claims the product does not exist.
    }
  }

  return {
    retailerId: retailer.id,
    retailerName: retailer.name,
    status: 'unavailable',
  }
}

async function fetchOfficialProductPagePrice(
  productUrl: string,
  query: string,
  currencyCode: string,
  fetcher: typeof fetch,
): Promise<number | undefined> {
  try {
    const response = await fetcher(productUrl, {
      headers: {
        ...BROWSER_HEADERS,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) return undefined
    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (contentLength > MAX_PRODUCT_RESPONSE_BYTES) return undefined
    const body = await response.text()
    if (body.length > MAX_PRODUCT_RESPONSE_BYTES) return undefined
    return extractOfficialProductPagePrice(body, query, currencyCode)
  } catch {
    return undefined
  }
}

export function extractOfficialProductPagePrice(
  html: string,
  query: string,
  currencyCode = 'ZAR',
): number | undefined {
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch: RegExpExecArray | null

  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    try {
      const price = priceFromStructuredData(
        JSON.parse(decodeHtmlEntities(scriptMatch[1])) as unknown,
        query,
        currencyCode,
      )
      if (price !== undefined) return price
    } catch {
      // Invalid third-party JSON-LD is ignored so another block can still win.
    }
  }

  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? []
  const priceCurrency = metaTags
    .map(parseHtmlAttributes)
    .find((attributes) => isMetaKey(attributes, ['product:price:currency', 'priceCurrency']))
    ?.content
  if (priceCurrency && priceCurrency.toUpperCase() !== currencyCode.toUpperCase()) {
    return undefined
  }

  for (const tag of metaTags) {
    const attributes = parseHtmlAttributes(tag)
    if (!isMetaKey(attributes, ['product:price:amount', 'price'])) continue
    const price = moneyToCents(attributes.content)
    if (price !== undefined) return price
  }

  return undefined
}

function priceFromStructuredData(
  value: unknown,
  query: string,
  currencyCode: string,
): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const price = priceFromStructuredData(item, query, currencyCode)
      if (price !== undefined) return price
    }
    return undefined
  }
  if (!isRecord(value)) return undefined

  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']]
  if (types.some((type) => type === 'Product')) {
    const name = typeof value.name === 'string' ? value.name : ''
    if (matchesQuery(name, query)) {
      const price = priceFromOffers(value.offers, currencyCode)
      if (price !== undefined) return price
    }
  }

  for (const nested of Object.values(value)) {
    const price = priceFromStructuredData(nested, query, currencyCode)
    if (price !== undefined) return price
  }
  return undefined
}

function priceFromOffers(value: unknown, currencyCode: string): number | undefined {
  const offers = Array.isArray(value) ? value : [value]
  for (const offer of offers) {
    if (!isRecord(offer)) continue
    const currency = typeof offer.priceCurrency === 'string'
      ? offer.priceCurrency.toUpperCase()
      : undefined
    if (currency && currency !== currencyCode.toUpperCase()) continue
    for (const candidate of [offer.price, offer.lowPrice]) {
      const price = moneyToCents(candidate)
      if (price !== undefined) return price
    }
    if (isRecord(offer.priceSpecification)) {
      const price = moneyToCents(offer.priceSpecification.price)
      if (price !== undefined) return price
    }
  }
  return undefined
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const pattern = /([:\w-]+)\s*=\s*["']([^"']*)["']/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(tag)) !== null) {
    attributes[match[1]] = decodeHtmlEntities(match[2]).trim()
  }
  return attributes
}

function isMetaKey(attributes: Record<string, string>, keys: string[]): boolean {
  const value = attributes.property ?? attributes.itemprop ?? attributes.name ?? ''
  return keys.some((key) => value.toLowerCase() === key.toLowerCase())
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function buildProductComparison(
  country: CountryOption,
  query: string,
  matches: RetailerProductSearchMatch[],
  checkedAt = new Date().toISOString(),
): ProductComparisonResult {
  const priced = matches.filter(
    (match): match is RetailerProductSearchMatch & { priceCents: number } =>
      match.status === 'priced' && match.priceCents !== undefined,
  )
  const canCompare = priced.length >= 2
  const cheapestCents = canCompare
    ? Math.min(...priced.map((match) => match.priceCents))
    : undefined
  const dearestCents = canCompare
    ? Math.max(...priced.map((match) => match.priceCents))
    : undefined
  const cheapestRetailerId = cheapestCents === undefined
    ? undefined
    : priced.find((match) => match.priceCents === cheapestCents)?.retailerId

  return {
    checkedAt,
    cheapestRetailerId,
    country,
    foundCount: matches.filter((match) => match.status !== 'unavailable').length,
    matches: matches.map((match) => ({
      ...match,
      isCheapest: cheapestCents !== undefined && match.priceCents === cheapestCents,
    })),
    pricedCount: priced.length,
    query,
    savingsCents: cheapestCents !== undefined && dearestCents !== undefined
      ? dearestCents - cheapestCents
      : 0,
    unavailableCount: matches.filter((match) => match.status === 'unavailable').length,
  }
}

export function applyPromotionFallbackPrices(
  matches: RetailerProductSearchMatch[],
  query: string,
  currencyCode: string,
  deals: DiscoveredDeal[],
  now = new Date(),
): RetailerProductSearchMatch[] {
  const nowMs = now.getTime()

  return matches.map((match) => {
    if (match.priceCents !== undefined) return match

    const candidate = deals
      .filter((deal) => {
        if (deal.retailerId !== match.retailerId || !matchesQuery(deal.title, query)) return false
        if (deal.expiresAt && Date.parse(deal.expiresAt) < nowMs) return false
        // A deal whose validity window is still open is current no matter
        // when it was captured — weekly catalogues are scanned once and
        // stay right all week. The capture-age gate only applies when no
        // validity window was published.
        const validToMs = deal.validTo ? Date.parse(deal.validTo) : Number.NaN
        const withinValidity = Number.isFinite(validToMs) && validToMs >= nowMs
        if (!withinValidity && nowMs - Date.parse(deal.capturedAt) > MAX_PROMOTION_FALLBACK_AGE_MS) {
          return false
        }
        return promotionPriceToCents(deal.priceText, currencyCode) !== undefined
      })
      .map((deal) => ({
        deal,
        priceCents: promotionPriceToCents(deal.priceText, currencyCode)!,
        score: match.title ? sharedTitleTokenScore(match.title, deal.title) : 0,
      }))
      .sort((left, right) => right.score - left.score || left.priceCents - right.priceCents)[0]

    if (!candidate) return match

    return {
      priceCents: candidate.priceCents,
      productUrl: candidate.deal.productUrl,
      retailerId: match.retailerId,
      retailerName: match.retailerName,
      sourceKind: 'promotion',
      status: 'priced',
      title: candidate.deal.title,
    }
  })
}

function promotionPriceToCents(value: string | undefined, currencyCode: string): number | undefined {
  if (!value || /\b(?:any\s+)?\d+\s+for\b/i.test(value)) return undefined
  return extractCurrencyPrice(value, currencyCode)
}

function sharedTitleTokenScore(left: string, right: string): number {
  const leftTokens = new Set(productTitleTokens(left))
  return productTitleTokens(right).reduce(
    (score, token) => score + (leftTokens.has(token) ? 1 : 0),
    0,
  )
}

function productTitleTokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1)
}

function parseKnownProductResults(
  retailerId: string,
  payload: unknown,
  query: string,
): RetailerProductCandidate[] {
  if (retailerId === 'woolworths') return parseWoolworthsProductResults(payload, query)
  if (retailerId === 'dis-chem') return parseKlevuProductResults(payload, query)
  if (retailerId === 'clicks') return parseClicksProductResults(payload, query)
  if (retailerId === 'game') return parseGameProductResults(payload, query)
  if (retailerId === 'pick-n-pay') return parsePnpProductResults(payload, query)
  if (retailerId === 'takealot') return parseTakealotProductResults(payload, query)
  if (SHOPRITE_GROUP_STORES[retailerId]) {
    return parseShopriteGroupProductResults(retailerId, payload, query)
  }
  return []
}

const MAX_MATCH_ALTERNATIVES = 3

// Words that refine a product without changing what it is. Sizes, pack
// counts, and digit-led tokens ("30s", "2l") are free; anything else costs.
const REFINING_TITLE_TOKENS = new Set([
  'assorted', 'dozen', 'extra', 'family', 'fresh', 'jumbo', 'large',
  'medium', 'mini', 'mixed', 'pack', 'small', 'tray', 'value',
])

/**
 * How closely a product title matches what the shopper typed. Higher is
 * better. The key signal is adjacency: an unmatched word DIRECTLY before a
 * matched one is usually a type-changing modifier ("Marshmallow Eggs"), while
 * front-of-title extras are usually brands ("Nulaid ... Eggs") — so adjacent
 * modifiers cost 3, other extras cost 1, sizes and counts cost nothing.
 */
export function candidateRelevance(title: string, query: string): number {
  const queryTokens = new Set(productTitleTokens(normalizeUnits(query)))
  const titleTokens = productTitleTokens(normalizeUnits(title))
  if (queryTokens.size === 0 || titleTokens.length === 0) return 0

  let score = 0
  for (let index = 0; index < titleTokens.length; index += 1) {
    const token = titleTokens[index]
    if (queryTokens.has(token)) {
      score += 10
    } else if (!/^\d/.test(token) && !REFINING_TITLE_TOKENS.has(token)) {
      const nextMatches = index + 1 < titleTokens.length &&
        queryTokens.has(titleTokens[index + 1])
      score -= nextMatches ? 3 : 1
    }
  }
  return score
}

function matchesQuery(title: string, query: string): boolean {
  const titleText = normalizeUnits(title)
  const tokens = normalizeUnits(query).split(/[^a-z0-9]+/).filter((token) => token.length > 1)
  return tokens.length > 0 && tokens.every((token) => titleText.includes(token))
}

// "2L", "2 l" and "2 Litre" are the same size to a shopper — fold unit
// spellings together so a query written one way matches titles written
// another.
function normalizeUnits(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(litres?|liters?)\b/g, 'l')
    .replace(/\b(kilograms?|kgs)\b/g, 'kg')
    .replace(/\b(grams?)\b/g, 'g')
    .replace(/\b(millilitres?|milliliters?|mls)\b/g, 'ml')
    .replace(/(\d)\s+(l|kg|g|ml)\b/g, '$1$2')
}

function firstMoney(value: unknown, keys: string[]): number | undefined {
  for (const key of keys) {
    if (!isRecord(value)) continue
    const cents = moneyToCents(value[key])
    if (cents !== undefined) return cents
  }
  return undefined
}

function moneyToCents(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value * 100)
  }
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes('.') ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.')
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined
}

function absoluteHttpsUrl(value: string, origin?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, origin)
    if (url.protocol !== 'https:') return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return undefined
  }
}

function sameSiteHost(candidate: string, official: string): boolean {
  return candidate === official
    || candidate.endsWith(`.${official}`)
    || official.endsWith(`.${candidate}`)
}

function extractCurrencyPrice(value: string, currencyCode: string): number | undefined {
  const normalizedCode = currencyCode.toUpperCase()
  const aliases: Record<string, string[]> = {
    EUR: ['EUR', '€'],
    GBP: ['GBP', '£'],
    USD: ['USD', 'US\\$', '\\$'],
    ZAR: ['ZAR', 'R'],
    ZWG: ['ZWG', 'ZiG'],
  }
  const markers = aliases[normalizedCode] ?? [normalizedCode.replace(/[^A-Z]/g, '')]
  const match = new RegExp(`(?:${markers.join('|')})\\s*(\\d+(?:[.,]\\d{1,2})?)`, 'i').exec(value)
  return match ? moneyToCents(match[1]) : undefined
}

function cleanExternalTitle(value: string): string {
  return value
    .replace(/\s*[\u2013\u2014]\s*/g, ': ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

function recordValue(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return isRecord(value[key]) ? value[key] : undefined
}

function arrayValue(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return []
  return Array.isArray(value[key]) ? value[key] : []
}

function textValue(value: unknown, key: string): string {
  if (!isRecord(value)) return ''
  const nested = value[key]
  return typeof nested === 'string' || typeof nested === 'number' ? String(nested).trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
