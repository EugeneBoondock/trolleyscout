import { methodNotAllowed } from '../_shared/respond'
import { handleCatalogueFileRequest } from './catalogue-file'

const MAX_VIEWER_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface HeyzineDocumentRequest {
  bookId: string
  source: 'heyzine'
  viewerUrl: string
}

export function resolveHeyzineDocumentRequest(
  requestUrl: string,
): HeyzineDocumentRequest | undefined {
  const url = new URL(requestUrl)
  if (url.searchParams.get('source')?.trim().toLowerCase() !== 'heyzine') {
    return undefined
  }
  const bookId = url.searchParams.get('book')?.trim().toLowerCase() ?? ''
  if (!/^[a-f0-9]{10}$/.test(bookId)) return undefined

  return {
    bookId,
    source: 'heyzine',
    viewerUrl: `https://heyzine.com/flip-book/${bookId}.html`,
  }
}

export function extractHeyzineDocumentUrl(
  html: string,
): string | undefined {
  const normalized = html
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
  const candidates = normalized.match(/https:\/\/[^"'<>\\\s]+/gi) ?? []

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate)
      if (
        url.protocol !== 'https:' ||
        url.hostname.toLowerCase() !== 'cdnc.heyzine.com' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        continue
      }
      if (
        /^\/flip-book\/pdf\/[a-f0-9]{40}(?:-1)?\.pdf$/i.test(url.pathname) ||
        /^\/files\/uploaded\/v\d+\/[a-f0-9]{40}(?:-1)?\.pdf$/i.test(
          url.pathname,
        )
      ) {
        return url.toString()
      }
    } catch {
      continue
    }
  }

  return undefined
}

export async function handleCatalogueDocumentRequest(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }
  const document = resolveHeyzineDocumentRequest(request.url)
  if (!document) {
    return failure(400, 'Provide a valid Heyzine catalogue book ID.')
  }

  const html = await fetchViewerHtml(document.viewerUrl, fetcher)
  if (!html) {
    return failure(502, 'The catalogue viewer could not be read.')
  }
  const documentUrl = extractHeyzineDocumentUrl(html)
  if (!documentUrl) {
    return failure(502, 'The catalogue viewer did not provide a readable PDF.')
  }

  const relayUrl =
    `https://trolleyscout.co.za/api/catalogue-file?u=${encodeURIComponent(documentUrl)}`
  return handleCatalogueFileRequest(new Request(relayUrl), fetcher)
}

export const onRequest: PagesFunction = async ({ request, waitUntil }) => {
  const cache = await openEdgeCache()
  const cacheKey = catalogueDocumentCacheKey(request)
  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
  }

  const response = await handleCatalogueDocumentRequest(request)
  if (cache && cacheKey && response.status === 200) {
    waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined))
  }
  return response
}

export function catalogueDocumentCacheKey(
  request: Request,
): string | undefined {
  if (request.method !== 'GET') return undefined
  const document = resolveHeyzineDocumentRequest(request.url)
  if (!document) return undefined
  return 'https://edge-cache.trolleyscout.co.za/api/catalogue-document.pdf' +
    `?source=heyzine&book=${document.bookId}`
}

async function fetchViewerHtml(
  viewerUrl: string,
  fetcher: typeof fetch,
): Promise<string | undefined> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetcher(viewerUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        referer: 'https://heyzine.com/',
        'user-agent': BROWSER_USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return undefined
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_VIEWER_BYTES) {
      return undefined
    }
    const html = await response.text()
    if (
      html.trim().length === 0 ||
      new TextEncoder().encode(html).byteLength > MAX_VIEWER_BYTES
    ) {
      return undefined
    }
    return html
  } catch {
    return undefined
  } finally {
    clearTimeout(timeout)
  }
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
    error: { code: 'catalogue_document', message },
  }), {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  })
}
