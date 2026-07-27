import {
  CATALOGUE_SPECIALS_ORIGIN,
  catalogueSpecialsFlyerUrl,
  extractCatalogueSpecialsPages,
} from '../../src/services/catalogueDirectory'
import {
  extractGuzzlePages,
  extractLatestSpecialsPage,
  extractMyCatalogueDetailPath,
  extractMyCataloguePages,
  latestSpecialsPageCount,
} from '../../src/services/catalogueSources'
import type { CataloguePage } from '../../src/types'
import {
  buildModernFlippingBookPages,
  parseModernFlippingBookViewer,
} from '../_shared/catalogueScout'
import { json, methodNotAllowed } from '../_shared/respond'

const MAX_HTML_BYTES = 4 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const EDGE_CACHE_SECONDS = 6 * 60 * 60
const STALE_CACHE_SECONDS = 24 * 60 * 60
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const inFlightPageLoads = new Map<string, Promise<Response>>()

export interface CatalogueSpecialsRequest {
  flyerId: string
  source: 'catalogue-specials'
  storeSlug: string
  url: string
}

interface GuzzleRequest {
  catalogueId: string
  source: 'guzzle'
  storeSlug: string
  url: string
}

interface LatestSpecialsRequest {
  flyerId: string
  path: string
  source: 'latest-specials'
  url: string
}

interface MyCatalogueRequest {
  source: 'my-catalogue'
  storeSlug: string
  url: string
}

interface FlippingBookRequest {
  source: 'flippingbook'
  url: string
  viewerUrl: string
}

type CataloguePagesRequest =
  | CatalogueSpecialsRequest
  | FlippingBookRequest
  | GuzzleRequest
  | LatestSpecialsRequest
  | MyCatalogueRequest

export function resolveCatalogueSpecialsRequest(
  requestUrl: string,
): CatalogueSpecialsRequest | undefined {
  const request = resolveCataloguePagesRequest(requestUrl)
  return request?.source === 'catalogue-specials' ? request : undefined
}

export function resolveCataloguePagesRequest(
  requestUrl: string,
): CataloguePagesRequest | undefined {
  const url = new URL(requestUrl)
  const source = (url.searchParams.get('source')?.trim().toLowerCase() ||
    'catalogue-specials')

  if (source === 'catalogue-specials') {
    const flyerId = url.searchParams.get('flyer')?.trim() ?? ''
    const storeSlug = safeSlug(url.searchParams.get('store'))
    if (!/^\d{4,12}$/.test(flyerId) || !storeSlug) return undefined
    return {
      flyerId,
      source,
      storeSlug,
      url: catalogueSpecialsFlyerUrl(storeSlug, flyerId),
    }
  }

  if (source === 'guzzle') {
    const catalogueId = url.searchParams.get('catalogue')?.trim() ?? ''
    const storeSlug = safeSlug(url.searchParams.get('store'))
    if (!/^\d{2,12}$/.test(catalogueId) || !storeSlug) return undefined
    return {
      catalogueId,
      source,
      storeSlug,
      url:
        `https://www.guzzle.co.za/specials/catalogue/${catalogueId}/${storeSlug}/`,
    }
  }

  if (source === 'latest-specials') {
    const flyerId = url.searchParams.get('flyer')?.trim() ?? ''
    const path = url.searchParams.get('path')?.trim() ?? ''
    if (
      !/^\d{2,12}$/.test(flyerId) ||
      !new RegExp(
        `^/[a-z0-9-]+/[a-z0-9-]+-${flyerId}/$`,
        'i',
      ).test(path)
    ) {
      return undefined
    }
    return {
      flyerId,
      path,
      source,
      url: `https://www.latestspecials.co.za${path}`,
    }
  }

  if (source === 'my-catalogue') {
    const storeSlug = safeSlug(url.searchParams.get('store'))
    if (!storeSlug) return undefined
    return {
      source,
      storeSlug,
      url: `https://my-catalogue.co.za/${storeSlug}-specials`,
    }
  }

  if (source === 'flippingbook') {
    const viewer = resolveFlippingBookViewer(
      url.searchParams.get('viewer'),
    )
    if (!viewer) return undefined
    const viewerUrl = viewer.toString()
    return {
      source,
      url: viewerUrl,
      viewerUrl,
    }
  }

  return undefined
}

export async function handleCataloguePagesRequest(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }
  const catalogue = resolveCataloguePagesRequest(request.url)
  if (!catalogue) {
    return failure(400, 'Provide a valid catalogue source and identifier.')
  }

  const pages = await loadCataloguePages(catalogue, fetcher)
  if (pages.length === 0) {
    return failure(502, 'The catalogue did not provide readable pages.')
  }

  return json(
    { pages },
    {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control':
          `public, max-age=${EDGE_CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}, stale-while-revalidate=${STALE_CACHE_SECONDS}`,
      },
    },
  )
}

export const onRequest: PagesFunction = async ({ request, waitUntil }) => {
  const cache = await openEdgeCache()
  const cacheKey = cataloguePagesCacheKey(request)
  if (!cacheKey) {
    return handleCataloguePagesRequest(request)
  }

  return collapseCataloguePageLoad(cacheKey, async () => {
    if (cache) {
      const cached = await cache.match(cacheKey)
      if (cached) return cached
    }

    const response = await handleCataloguePagesRequest(request)
    if (cache && response.status === 200) {
      waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined))
    }
    return response
  })
}

/// Concurrent story tiles can ask for the same flyer before Cache API has
/// finished writing it. Share that one upstream load inside a warm isolate.
export async function collapseCataloguePageLoad(
  cacheKey: string,
  load: () => Promise<Response>,
): Promise<Response> {
  let pending = inFlightPageLoads.get(cacheKey)
  if (!pending) {
    const created = Promise.resolve().then(load)
    pending = created.finally(() => {
      if (inFlightPageLoads.get(cacheKey) === pending) {
        inFlightPageLoads.delete(cacheKey)
      }
    })
    inFlightPageLoads.set(cacheKey, pending)
  }
  return (await pending).clone()
}

async function loadCataloguePages(
  catalogue: CataloguePagesRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  if (catalogue.source === 'catalogue-specials') {
    return loadCatalogueSpecialsPages(catalogue, fetcher)
  }
  if (catalogue.source === 'guzzle') {
    return loadGuzzlePages(catalogue, fetcher)
  }
  if (catalogue.source === 'my-catalogue') {
    return loadMyCataloguePages(catalogue, fetcher)
  }
  if (catalogue.source === 'flippingbook') {
    return loadFlippingBookPages(catalogue, fetcher)
  }
  return loadLatestSpecialsPages(catalogue, fetcher)
}

async function loadFlippingBookPages(
  catalogue: FlippingBookRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  const document = await fetchCatalogueDocument(fetcher, catalogue.viewerUrl, {
    referer: 'https://online.flippingbook.com/',
  })
  if (!document) return []
  const viewer = parseModernFlippingBookViewer(document.text)
  if (!viewer) return []

  return buildModernFlippingBookPages({
    capturedAt: '',
    id: catalogue.viewerUrl,
    name: 'Catalogue',
    retailerId: 'boxer',
    retailerName: 'Retailer',
    url: catalogue.viewerUrl,
  }, viewer, {}, viewer.totalPages)
}

async function loadCatalogueSpecialsPages(
  catalogue: CatalogueSpecialsRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  let document = await fetchCatalogueDocument(fetcher, catalogue.url, {
    referer: `${CATALOGUE_SPECIALS_ORIGIN}/`,
  })
  if (!document) {
    const exactUrl = await findExactFlyerUrl(fetcher, catalogue)
    document = exactUrl
      ? await fetchCatalogueDocument(fetcher, exactUrl, {
          referer: `${CATALOGUE_SPECIALS_ORIGIN}/`,
        })
      : undefined
  }
  return document
    ? extractCatalogueSpecialsPages(document.text, catalogue.flyerId)
    : []
}

async function loadGuzzlePages(
  catalogue: GuzzleRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  const detail = await fetchCatalogueDocument(fetcher, catalogue.url, {
    referer: 'https://www.guzzle.co.za/specials/latest-online-catalogues/',
  })
  if (!detail) return []
  const initialPath =
    /\bdata-initial_url=["'](\/specials\/initial-catalogue\/\d{2,12}\/)["']/i
      .exec(detail.text)?.[1] ??
    `/specials/initial-catalogue/${catalogue.catalogueId}/`
  if (
    initialPath !==
    `/specials/initial-catalogue/${catalogue.catalogueId}/`
  ) {
    return []
  }
  const cookie = detail.response.headers.get('set-cookie')?.split(';')[0]?.trim()
  const initial = await fetchCatalogueDocument(
    fetcher,
    `https://www.guzzle.co.za${initialPath}?main_site=True`,
    {
      cookie,
      referer: catalogue.url,
      requestedWith: true,
    },
  )
  return initial ? extractGuzzlePages(initial.text) : []
}

async function loadMyCataloguePages(
  catalogue: MyCatalogueRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  const store = await fetchCatalogueDocument(fetcher, catalogue.url, {
    referer: 'https://my-catalogue.co.za/',
  })
  if (!store) return []
  const detailPath = extractMyCatalogueDetailPath(
    store.text,
    catalogue.storeSlug,
  )
  if (!detailPath) return []
  const detail = await fetchCatalogueDocument(
    fetcher,
    `https://my-catalogue.co.za${detailPath}`,
    { referer: catalogue.url },
  )
  return detail ? extractMyCataloguePages(detail.text) : []
}

async function loadLatestSpecialsPages(
  catalogue: LatestSpecialsRequest,
  fetcher: typeof fetch,
): Promise<CataloguePage[]> {
  const first = await fetchCatalogueDocument(fetcher, catalogue.url, {
    referer: 'https://www.latestspecials.co.za/',
  })
  if (!first) return []
  const pageCount = latestSpecialsPageCount(first.text)
  const pages: Array<CataloguePage | undefined> = [
    extractLatestSpecialsPage(first.text, catalogue.flyerId, 1),
  ]

  for (let start = 2; start <= pageCount; start += 6) {
    const pageNumbers = Array.from(
      { length: Math.min(6, pageCount - start + 1) },
      (_, index) => start + index,
    )
    const batch = await Promise.all(pageNumbers.map(async (pageNumber) => {
      const page = await fetchCatalogueDocument(
        fetcher,
        `${catalogue.url}?page=${pageNumber}`,
        { referer: catalogue.url },
      )
      return page
        ? extractLatestSpecialsPage(page.text, catalogue.flyerId, pageNumber)
        : undefined
    }))
    pages.push(...batch)
  }

  return pages.filter((page): page is CataloguePage => Boolean(page))
}

async function findExactFlyerUrl(
  fetcher: typeof fetch,
  catalogue: CatalogueSpecialsRequest,
): Promise<string | undefined> {
  const storeUrl =
    `${CATALOGUE_SPECIALS_ORIGIN}/stores/${catalogue.storeSlug}/catalogues-specials`
  const document = await fetchCatalogueDocument(fetcher, storeUrl, {
    referer: `${CATALOGUE_SPECIALS_ORIGIN}/`,
  })
  if (!document) {
    return undefined
  }
  const escapedId = catalogue.flyerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const path = new RegExp(
    `href=["'](\\/view\\/specials\\/[a-z0-9-]+-${escapedId})["']`,
    'i',
  ).exec(document.text)?.[1]
  return path ? `${CATALOGUE_SPECIALS_ORIGIN}${path}` : undefined
}

async function fetchCatalogueDocument(
  fetcher: typeof fetch,
  url: string,
  options: {
    cookie?: string
    referer: string
    requestedWith?: boolean
  },
): Promise<{ response: Response; text: string } | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        ...(options.cookie ? { cookie: options.cookie } : {}),
        referer: options.referer,
        'user-agent': BROWSER_USER_AGENT,
        ...(options.requestedWith
          ? { 'x-requested-with': 'XMLHttpRequest' }
          : {}),
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (response.status !== 200) {
      return undefined
    }
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
      return undefined
    }
    const text = await response.text()
    return new TextEncoder().encode(text).byteLength <= MAX_HTML_BYTES &&
      text.trim().length > 0
      ? { response, text }
      : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

export function cataloguePagesCacheKey(request: Request): string | undefined {
  if (request.method !== 'GET') {
    return undefined
  }
  const catalogue = resolveCataloguePagesRequest(request.url)
  if (!catalogue) return undefined
  const key = new URL('https://edge-cache.trolleyscout.co.za/api/catalogue-pages')
  key.searchParams.set('source', catalogue.source)
  if (catalogue.source === 'catalogue-specials') {
    key.searchParams.set('flyer', catalogue.flyerId)
    key.searchParams.set('store', catalogue.storeSlug)
  } else if (catalogue.source === 'guzzle') {
    key.searchParams.set('catalogue', catalogue.catalogueId)
    key.searchParams.set('store', catalogue.storeSlug)
  } else if (catalogue.source === 'latest-specials') {
    key.searchParams.set('flyer', catalogue.flyerId)
    key.searchParams.set('path', catalogue.path)
  } else if (catalogue.source === 'flippingbook') {
    key.searchParams.set('viewer', catalogue.viewerUrl)
  } else {
    key.searchParams.set('store', catalogue.storeSlug)
  }
  return key.toString()
}

function resolveFlippingBookViewer(raw: string | null): URL | undefined {
  if (!raw || raw.length > 1_024) return undefined
  try {
    const url = new URL(raw)
    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'online.flippingbook.com' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/view\/\d{4,12}\/index\.html$/.test(url.pathname)
    ) {
      return undefined
    }
    return url
  } catch {
    return undefined
  }
}

function safeSlug(value: string | null): string | undefined {
  const slug = value?.trim().toLowerCase() ?? ''
  return /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)
    ? slug
    : undefined
}

async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default
  } catch {
    return undefined
  }
}

function failure(status: number, message: string) {
  return json(
    { message },
    {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      },
      status,
    },
  )
}
