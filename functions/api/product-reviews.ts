import { json, methodNotAllowed } from '../_shared/respond'

// Reviews come from whichever storefront the deal already lives on. Only
// retailers whose sites answer anonymously are adapted; everything else says
// so honestly instead of pretending to have data.

const REQUEST_TIMEOUT_MS = 6_000
const MAX_REVIEWS = 5
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export interface ProductReview {
  author: string
  body: string
  date: string
  rating: number
  title: string
}

export interface ProductReviewSummary {
  available: boolean
  rating: number | null
  reviewCount: number
  reviews: ProductReview[]
  source: string | null
}

export type ReviewFetcher = (input: string, init?: RequestInit) => Promise<Response>

const EMPTY: ProductReviewSummary = {
  available: false,
  rating: null,
  reviewCount: 0,
  reviews: [],
  source: null,
}

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') return methodNotAllowed(request.method)
  const productUrl = (new URL(request.url).searchParams.get('url') ?? '').trim()
  const summary = await fetchProductReviews(productUrl)
  return json(summary, {
    headers: {
      'access-control-allow-origin': '*',
      // Ratings shift slowly; a day of caching keeps us polite guests on the
      // retailers' own frontend APIs.
      'cache-control': 'public, max-age=21600, s-maxage=86400',
    },
  })
}

export async function fetchProductReviews(
  productUrl: string,
  fetcher: ReviewFetcher = fetch,
): Promise<ProductReviewSummary> {
  let parsed: URL
  try {
    parsed = new URL(productUrl)
  } catch {
    return EMPTY
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return EMPTY
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')

  try {
    if (host.endsWith('takealot.com')) {
      return await takealotReviews(parsed, fetcher)
    }
    if (host.endsWith('clicks.co.za')) {
      return await clicksReviews(parsed, fetcher)
    }
    return await wooCommerceReviews(parsed, fetcher)
  } catch {
    return EMPTY
  }
}

/** Takealot's own frontend API: summary from product-details, comments from
 * product-reviews. Both refuse bare user agents, so we knock as a browser. */
async function takealotReviews(
  productUrl: URL,
  fetcher: ReviewFetcher,
): Promise<ProductReviewSummary> {
  const plid = productUrl.href.match(/PLID(\d+)/i)?.[1]
  if (!plid) return EMPTY
  const init: RequestInit = {
    headers: { 'user-agent': BROWSER_UA },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
  const details = await fetcher(
    `https://api.takealot.com/rest/v-1-13-0/product-details/PLID${plid}?platform=desktop`,
    init,
  )
  if (!details.ok) return EMPTY
  const payload = await details.json() as {
    core?: { reviews?: unknown; star_rating?: unknown }
  }
  const rating = toNumber(payload.core?.star_rating)
  const reviewCount = toNumber(payload.core?.reviews) ?? 0
  if (rating === null && reviewCount === 0) return EMPTY

  let reviews: ProductReview[] = []
  if (reviewCount > 0) {
    const listing = await fetcher(
      `https://api.takealot.com/rest/v-1-13-0/product-reviews/plid/${plid}?platform=desktop&page_size=${MAX_REVIEWS}&sort=Newest`,
      init,
    ).catch(() => null)
    if (listing?.ok) {
      const body = await listing.json() as { items?: unknown[] }
      reviews = (body.items ?? [])
        .map((item) => parseTakealotReview(item))
        .filter((review): review is ProductReview => review !== null)
        .slice(0, MAX_REVIEWS)
    }
  }
  return {
    available: true,
    rating,
    reviewCount,
    reviews,
    source: 'takealot',
  }
}

function parseTakealotReview(item: unknown): ProductReview | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const body = typeof record.review === 'string' ? record.review : ''
  const rating = toNumber(record.star_rating)
  if (!body && rating === null) return null
  return {
    author: typeof record.customer_name === 'string' ? record.customer_name : '',
    body,
    date: typeof record.date === 'string' ? record.date : '',
    rating: rating ?? 0,
    title: typeof record.title === 'string' ? record.title : '',
  }
}

/** Clicks renders reviews as a server-side HTML fragment. */
async function clicksReviews(
  productUrl: URL,
  fetcher: ReviewFetcher,
): Promise<ProductReviewSummary> {
  const code = productUrl.pathname.match(/\/p\/([^/]+)/)?.[1]
  if (!code) return EMPTY
  const base = productUrl.pathname.replace(/\/p\/([^/]+).*$/, `/p/$1`)
  const response = await fetcher(
    `https://clicks.co.za${base}/reviewhtml/all`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  )
  if (!response.ok) return EMPTY
  const html = await response.text()
  const reviews: ProductReview[] = []
  const blockPattern =
    /itemprop="ratingValue"[^>]*>([\d.]+)<[\s\S]*?itemprop="name"[^>]*>([\s\S]*?)<[\s\S]*?itemprop="reviewBody"[^>]*>([\s\S]*?)</g
  let match: RegExpExecArray | null
  while ((match = blockPattern.exec(html)) !== null && reviews.length < MAX_REVIEWS) {
    reviews.push({
      author: '',
      body: decodeEntities(match[3].trim()),
      date: '',
      rating: Number(match[1]) || 0,
      title: decodeEntities(match[2].trim()),
    })
  }
  if (reviews.length === 0) return EMPTY
  const rating =
    reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
  return {
    available: true,
    rating: Math.round(rating * 10) / 10,
    reviewCount: reviews.length,
    reviews,
    source: 'clicks',
  }
}

/** WooCommerce's public Store API carries ratings on the product and full
 * comments on a sibling endpoint — free coverage for the ZW storefronts. */
async function wooCommerceReviews(
  productUrl: URL,
  fetcher: ReviewFetcher,
): Promise<ProductReviewSummary> {
  const slug = productUrl.pathname
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean)
    .pop()
  if (!slug) return EMPTY
  const origin = `${productUrl.protocol}//${productUrl.host}`
  const init: RequestInit = { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
  const lookup = await fetcher(
    `${origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`,
    init,
  )
  if (!lookup.ok) return EMPTY
  const products = await lookup.json() as Array<{
    average_rating?: unknown
    id?: unknown
    review_count?: unknown
  }>
  const product = Array.isArray(products) ? products[0] : undefined
  if (!product) return EMPTY
  const rating = toNumber(product.average_rating)
  const reviewCount = toNumber(product.review_count) ?? 0
  if ((rating === null || rating === 0) && reviewCount === 0) return EMPTY

  let reviews: ProductReview[] = []
  const productId = toNumber(product.id)
  if (reviewCount > 0 && productId !== null) {
    const listing = await fetcher(
      `${origin}/wp-json/wc/store/v1/products/reviews?product_id=${productId}&per_page=${MAX_REVIEWS}`,
      init,
    ).catch(() => null)
    if (listing?.ok) {
      const body = await listing.json() as unknown[]
      reviews = (Array.isArray(body) ? body : [])
        .map((item) => parseWooReview(item))
        .filter((review): review is ProductReview => review !== null)
        .slice(0, MAX_REVIEWS)
    }
  }
  return {
    available: true,
    rating,
    reviewCount,
    reviews,
    source: 'woocommerce',
  }
}

function parseWooReview(item: unknown): ProductReview | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const body = typeof record.review === 'string'
    ? decodeEntities(record.review.replace(/<[^>]+>/g, ' ').trim())
    : ''
  const rating = toNumber(record.rating)
  if (!body && rating === null) return null
  return {
    author: typeof record.reviewer === 'string' ? record.reviewer : '',
    body,
    date: typeof record.date_created === 'string' ? record.date_created : '',
    rating: rating ?? 0,
    title: '',
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
