// Stable high-resolution page relay for modern FlippingBook publications.
//
// FlippingBook page assets use signed CloudFront links that expire shortly
// after the viewer loads. Discovery therefore stores this stable endpoint,
// which refreshes the viewer policy and returns the largest ready page image.

import {
  modernFlippingBookPageAssetUrls,
  modernFlippingBookPagerUrl,
  parseFlippingBookPager,
  parseModernFlippingBookViewer,
} from '../_shared/catalogueScout'
import { methodNotAllowed } from '../_shared/respond'

const MAX_VIEWER_BYTES = 2 * 1024 * 1024
const MAX_PAGER_BYTES = 1024 * 1024
const MAX_PAGE_BYTES = 8 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000
const EDGE_CACHE_SECONDS = 6 * 60 * 60
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export function resolveModernFlippingBookViewerUrl(
  raw: string | null,
): URL | undefined {
  if (!raw || raw.length > 1_024) {
    return undefined
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'online.flippingbook.com' ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/view\/[a-z0-9_-]+\/(?:index\.html)?$/i.test(url.pathname)
  ) {
    return undefined
  }

  if (url.pathname.endsWith('/')) {
    url.pathname += 'index.html'
  }
  url.hash = ''
  url.search = ''
  return url
}

export async function handleCataloguePageRequest(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const requestUrl = new URL(request.url)
  const viewerUrl = resolveModernFlippingBookViewerUrl(
    requestUrl.searchParams.get('viewer'),
  )
  const pageNumber = Number(requestUrl.searchParams.get('page'))
  if (
    !viewerUrl ||
    !Number.isSafeInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > 500
  ) {
    return failure(400, 'Provide a valid FlippingBook viewer and page number.')
  }

  const viewerResponse = await fetchBounded(
    fetcher,
    viewerUrl.toString(),
    MAX_VIEWER_BYTES,
    'text/html',
  )
  if (!viewerResponse) {
    return failure(502, 'The catalogue viewer could not be read.')
  }
  const viewer = parseModernFlippingBookViewer(
    new TextDecoder().decode(viewerResponse.bytes),
  )
  const pagerUrl = modernFlippingBookPagerUrl(viewer)
  if (!viewer || !pagerUrl) {
    return failure(502, 'The catalogue viewer did not provide page data.')
  }

  const pagerResponse = await fetchBounded(
    fetcher,
    pagerUrl,
    MAX_PAGER_BYTES,
    'application/json,text/javascript',
  )
  if (!pagerResponse) {
    return failure(502, 'The catalogue page list could not be read.')
  }

  let pager: unknown
  try {
    pager = parseFlippingBookPager(new TextDecoder().decode(pagerResponse.bytes))
  } catch {
    return failure(502, 'The catalogue page list was invalid.')
  }

  const imageUrls = modernFlippingBookPageAssetUrls(
    viewer,
    pager,
    pageNumber,
  )
  if (imageUrls.length === 0) {
    return failure(404, 'That catalogue page does not exist.')
  }

  for (const imageUrl of imageUrls) {
    const image = await fetchBounded(
      fetcher,
      imageUrl,
      MAX_PAGE_BYTES,
      'image/avif,image/webp,image/jpeg,image/*',
    )
    if (!image) {
      continue
    }
    const contentType = cataloguePageContentType(
      image.contentType,
      imageUrl,
    )
    if (!contentType) {
      continue
    }

    return new Response(image.bytes, {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': `public, max-age=${EDGE_CACHE_SECONDS}`,
        'content-disposition': 'inline',
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
      },
      status: 200,
    })
  }

  return failure(502, 'The high-resolution catalogue page could not be read.')
}

export const onRequest: PagesFunction = async ({ request, waitUntil }) => {
  const cache = await openEdgeCache()
  const key = cacheKeyFor(request)
  if (cache && key) {
    const cached = await cache.match(key)
    if (cached) {
      return cached
    }
  }

  const response = await handleCataloguePageRequest(request)
  if (cache && key && response.status === 200) {
    waitUntil(cache.put(key, response.clone()).catch(() => undefined))
  }
  return response
}

function cataloguePageContentType(
  value: string | undefined,
  imageUrl: string,
): string | undefined {
  const normalized = value?.split(';')[0].trim().toLowerCase() ?? ''
  if (/^image\/[a-z0-9.+-]+$/.test(normalized)) {
    return normalized
  }
  if (normalized && normalized !== 'application/octet-stream') {
    return undefined
  }

  const pathname = new URL(imageUrl).pathname.toLowerCase()
  if (pathname.endsWith('.webp')) return 'image/webp'
  if (pathname.endsWith('.png')) return 'image/png'
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg'
  return undefined
}

async function fetchBounded(
  fetcher: typeof fetch,
  url: string,
  maxBytes: number,
  accept: string,
): Promise<{ bytes: ArrayBuffer; contentType?: string } | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(url, {
      headers: {
        accept,
        referer: 'https://online.flippingbook.com/',
        'user-agent': BROWSER_USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) {
      return undefined
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return undefined
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maxBytes) {
      return undefined
    }

    return {
      bytes,
      contentType: response.headers.get('content-type') ?? undefined,
    }
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
}

function cacheKeyFor(request: Request): string | undefined {
  if (request.method !== 'GET') {
    return undefined
  }
  const url = new URL(request.url)
  const viewer = resolveModernFlippingBookViewerUrl(
    url.searchParams.get('viewer'),
  )
  const page = Number(url.searchParams.get('page'))
  if (!viewer || !Number.isSafeInteger(page) || page < 1 || page > 500) {
    return undefined
  }
  return `https://edge-cache.trolleyscout.co.za/api/catalogue-page?page=${page}&viewer=${encodeURIComponent(viewer.toString())}`
}

async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default
  } catch {
    return undefined
  }
}

function failure(status: number, message: string): Response {
  return new Response(JSON.stringify({
    error: { code: 'catalogue_page', message },
  }), {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  })
}
