/**
 * Retrieval for Mr Scout.
 *
 * Mr Scout used to be handed a fixed context — the 120 most recent promotional
 * deals plus a leaflet snapshot — and nothing the shopper typed ever reached a
 * search. Ask for a 50 inch television and no TV was ever in the context, so
 * the model correctly reported that it could not find one while the same
 * televisions sat in the marketplace the Compare tab already searches.
 *
 * This module gives the chat surface the retrieval step it never had: read the
 * question, ask the stores that plausibly stock the answer, score every
 * candidate with the shared relevance engine, and hand back real products with
 * real prices.
 */

import {
  buildKnownProductSearchRequest,
  parseKnownProductResults,
} from './productPriceSearch'
import {
  parseProductQuery,
  scoreProductCandidate,
  type ParsedProductQuery,
  type ProductCategory,
} from './productQuery'
import type { ScoutChatDealCard } from '../../src/types'

const RETAILER_TIMEOUT_MS = 7_000
const MAX_RETAILERS_PER_QUERY = 5
const MAX_RESULTS = 8
const MIN_SCORE = 40

export interface RetrievedProduct {
  imageUrl?: string
  priceCents: number
  productUrl: string
  retailerId: string
  retailerName: string
  score: number
  scoreReasons: string[]
  title: string
}

export interface RetrievalStageTiming {
  candidateCount: number
  ms: number
  retailerId: string
  status: 'empty' | 'failed' | 'ok'
}

export interface ProductRetrievalResult {
  /** Every candidate considered, best first — the reranker's working set. */
  candidates: RetrievedProduct[]
  query: ParsedProductQuery
  /** Per-retailer latency and yield, for the observability log. */
  timings: RetailerStageTiming[]
  /** Whether the message looked like a product request at all. */
  searched: boolean
}

type RetailerStageTiming = RetrievalStageTiming

const RETAILER_NAMES: Record<string, string> = {
  checkers: 'Checkers',
  clicks: 'Clicks',
  'dis-chem': 'Dis-Chem',
  game: 'Game',
  'pick-n-pay': 'Pick n Pay',
  shoprite: 'Shoprite',
  takealot: 'Takealot',
  woolworths: 'Woolworths',
}

/**
 * Which stores plausibly stock a category. Asking Dis-Chem for a television
 * wastes a request and a second of the shopper's time, and its near-miss
 * results only crowd out the real answer.
 */
const CATEGORY_RETAILERS: Record<ProductCategory, readonly string[]> = {
  appliance: ['takealot', 'game', 'pick-n-pay', 'checkers', 'shoprite'],
  electronics: ['takealot', 'game', 'woolworths', 'pick-n-pay', 'checkers'],
  furniture: ['takealot', 'game'],
  grocery: ['pick-n-pay', 'checkers', 'shoprite', 'woolworths', 'game'],
  homeware: ['takealot', 'game', 'woolworths', 'pick-n-pay', 'checkers'],
  outdoor: ['takealot', 'game', 'checkers', 'shoprite'],
  'personal-care': ['clicks', 'dis-chem', 'woolworths', 'pick-n-pay', 'checkers'],
  tools: ['takealot', 'game', 'checkers', 'shoprite'],
  toys: ['takealot', 'game', 'checkers', 'shoprite'],
  unknown: ['takealot', 'pick-n-pay', 'checkers', 'game', 'woolworths'],
}

/** Phrases that are conversation, not a shopping request. */
const NON_PRODUCT_PATTERNS = [
  /^(hi|hello|hey|howzit|sawubona|molo|dumela)\b/i,
  /^(thanks|thank you|cheers|ok|okay|cool|nice)\b/i,
  /^(who|what|why|how) (are|is) (you|this|that)\b/i,
]

export function looksLikeProductRequest(message: string): boolean {
  const text = message.trim()
  if (text.length < 2) return false
  if (NON_PRODUCT_PATTERNS.some((pattern) => pattern.test(text))) return false
  return parseProductQuery(text).headTerms.length > 0
}

export async function retrieveProducts(
  message: string,
  options: {
    fetcher?: typeof fetch
    retailerIds?: readonly string[]
  } = {},
): Promise<ProductRetrievalResult> {
  const query = parseProductQuery(message)
  if (!looksLikeProductRequest(message)) {
    return { candidates: [], query, searched: false, timings: [] }
  }

  const fetcher = options.fetcher ?? fetch
  const retailerIds = (options.retailerIds ?? CATEGORY_RETAILERS[query.category])
    .slice(0, MAX_RETAILERS_PER_QUERY)

  const timings: RetailerStageTiming[] = []
  const settled = await Promise.all(retailerIds.map(async (retailerId) => {
    const startedAt = Date.now()
    try {
      const candidates = await fetchRetailerCandidates(retailerId, query, fetcher)
      timings.push({
        candidateCount: candidates.length,
        ms: Date.now() - startedAt,
        retailerId,
        status: candidates.length > 0 ? 'ok' : 'empty',
      })
      return candidates
    } catch {
      timings.push({
        candidateCount: 0,
        ms: Date.now() - startedAt,
        retailerId,
        status: 'failed',
      })
      return []
    }
  }))

  return {
    candidates: rankAndDeduplicate(settled.flat(), query),
    query,
    searched: true,
    timings,
  }
}

async function fetchRetailerCandidates(
  retailerId: string,
  query: ParsedProductQuery,
  fetcher: typeof fetch,
): Promise<RetrievedProduct[]> {
  const request = buildKnownProductSearchRequest(retailerId, query.storefrontQuery)
  if (!request) return []

  const response = await fetcher(request.url, {
    ...request.init,
    signal: AbortSignal.timeout(RETAILER_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Retailer search failed: ${response.status}`)

  const payload = JSON.parse(await response.text()) as unknown
  const products = parseKnownProductResults(retailerId, payload, query.storefrontQuery)

  return products.flatMap((product) => {
    const score = scoreProductCandidate(product.title, query, product.priceCents)
    if (score.rejected || score.score < MIN_SCORE) return []
    return [{
      priceCents: product.priceCents,
      productUrl: product.productUrl,
      retailerId,
      retailerName: RETAILER_NAMES[retailerId] ?? retailerId,
      score: score.score,
      scoreReasons: score.reasons,
      title: product.title,
    }]
  })
}

/**
 * Best answer per store, then best stores first. Showing one shopper five
 * near-identical listings from a single retailer is worse than showing the
 * same product priced at five different shops, which is the whole point of
 * Trolley Scout.
 */
function rankAndDeduplicate(
  products: readonly RetrievedProduct[],
  query: ParsedProductQuery,
): RetrievedProduct[] {
  const ordered = [...products].sort((left, right) =>
    right.score - left.score ||
    (query.sortCheapest ? left.priceCents - right.priceCents : 0))

  const perRetailer = new Map<string, number>()
  const picked: RetrievedProduct[] = []
  const seenUrls = new Set<string>()

  // Two passes: everyone's best answer first, then fill remaining slots.
  for (const limit of [1, 3]) {
    for (const product of ordered) {
      if (picked.length >= MAX_RESULTS) break
      if (seenUrls.has(product.productUrl)) continue
      const used = perRetailer.get(product.retailerId) ?? 0
      if (used >= limit) continue
      perRetailer.set(product.retailerId, used + 1)
      seenUrls.add(product.productUrl)
      picked.push(product)
    }
  }

  return picked
}

export function toScoutDealCards(
  products: readonly RetrievedProduct[],
  currencyCode: string,
): ScoutChatDealCard[] {
  return products.map((product, index) => ({
    id: `live:${index}:${product.retailerId}`,
    imageUrl: product.imageUrl,
    priceText: formatMoney(product.priceCents, currencyCode),
    productUrl: product.productUrl,
    retailerName: product.retailerName,
    title: product.title,
  }))
}

function formatMoney(cents: number, currencyCode: string): string {
  const currency = /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : 'ZAR'
  if (currency === 'ZAR') return `R${(cents / 100).toFixed(2)}`
  return new Intl.NumberFormat('en', {
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(cents / 100)
}
