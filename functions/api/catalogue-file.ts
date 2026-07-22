// Same-origin fetch-through for catalogue documents and page images.
//
// Retailer CDNs regularly refuse browser hotlinks (403 without their own
// referer, X-Frame-Options on PDFs), which left many catalogues unviewable
// in-app. Reading a catalogue is the product promise, so this endpoint
// fetches the file server-side with a browser identity and streams it back
// same-origin. Readers use it as a fallback whenever the direct URL fails.
//
// Only ever serves PDF or image bodies (checked on the upstream response),
// never HTML, so it cannot be used as a general page proxy.

import { methodNotAllowed } from '../_shared/respond'

const MAX_FILE_BYTES = 30 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000
const EDGE_CACHE_SECONDS = 6 * 60 * 60

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost']
const OWN_HOST_SUFFIXES = ['trolleyscout.co.za', '.pages.dev', '.workers.dev']

// Resolves the requested target into a safe, public https URL, or undefined.
export function resolveCatalogueFileUrl(raw: string | null): URL | undefined {
  if (!raw || raw.length > 2048) {
    return undefined
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }

  const hostname = url.hostname.toLowerCase()
  const isIpLiteral =
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[')

  if (
    url.protocol !== 'https:' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    isIpLiteral ||
    hostname === 'localhost' ||
    !hostname.includes('.') ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    OWN_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.replace(/^\./, '') || hostname.endsWith(suffix),
    )
  ) {
    return undefined
  }

  url.hash = ''
  return url
}

// A catalogue file must be a PDF or an image — anything else is refused so
// this endpoint cannot relay arbitrary web content.
export function catalogueFileContentType(value: string | null): string | undefined {
  const normalized = value?.split(';')[0].trim().toLowerCase() ?? ''

  if (normalized === 'application/pdf' || normalized === 'application/octet-stream') {
    return normalized === 'application/pdf' ? normalized : 'application/pdf'
  }

  return /^image\/[a-z0-9.+-]+$/.test(normalized) ? normalized : undefined
}

export async function handleCatalogueFileRequest(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const target = resolveCatalogueFileUrl(new URL(request.url).searchParams.get('u'))
  if (!target) {
    return failure(400, 'Provide a public https catalogue file URL in ?u=.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let upstream: Response
  try {
    upstream = await fetcher(target.toString(), {
      headers: {
        accept: 'application/pdf,image/avif,image/webp,image/*,*/*;q=0.5',
        referer: `${target.origin}/`,
        'user-agent': BROWSER_USER_AGENT,
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch {
    return failure(502, 'The catalogue file could not be fetched.')
  } finally {
    clearTimeout(timeout)
  }

  if (!upstream.ok || !upstream.body) {
    return failure(502, `The source responded with ${upstream.status}.`)
  }

  const contentType = catalogueFileContentType(upstream.headers.get('content-type'))
  if (!contentType) {
    return failure(415, 'Only catalogue PDFs and images can be served.')
  }

  const declaredLength = Number(upstream.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
    return failure(413, 'The catalogue file is too large to relay.')
  }

  const headers = new Headers({
    'access-control-allow-origin': '*',
    'cache-control': `public, max-age=${EDGE_CACHE_SECONDS}`,
    'content-disposition': 'inline',
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  })
  if (Number.isFinite(declaredLength) && declaredLength >= 0) {
    headers.set('content-length', String(declaredLength))
  }

  return new Response(boundedStream(upstream.body, MAX_FILE_BYTES), {
    headers,
    status: 200,
  })
}

export const onRequest: PagesFunction = async ({ request, waitUntil }) => {
  // Serve repeat reads of the same catalogue from the edge instead of
  // refetching multi-megabyte PDFs from the retailer every time.
  const cache = await openEdgeCache()
  const cacheKey = cacheKeyFor(request)
  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey)
    if (cached) {
      return cached
    }
  }

  const response = await handleCatalogueFileRequest(request)
  if (cache && cacheKey && response.status === 200) {
    const cacheable = response.clone()
    waitUntil(cache.put(cacheKey, cacheable).catch(() => undefined))
  }
  return response
}

function cacheKeyFor(request: Request): string | undefined {
  if (request.method !== 'GET') {
    return undefined
  }
  const target = new URL(request.url).searchParams.get('u')
  return target
    ? `https://edge-cache.trolleyscout.co.za/api/catalogue-file?u=${encodeURIComponent(target)}`
    : undefined
}

// The Cache API is absent in unit tests and some local runtimes — treat it
// as an optional accelerator, never a requirement.
async function openEdgeCache(): Promise<Cache | undefined> {
  try {
    return typeof caches === 'undefined' ? undefined : caches.default
  } catch {
    return undefined
  }
}

// Streams the upstream body through untouched but aborts past the size cap,
// so a lying content-length cannot turn this into an unbounded relay.
function boundedStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let transferred = 0

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        transferred += chunk.byteLength
        if (transferred > maxBytes) {
          controller.error(new RangeError('Catalogue file exceeded the relay limit'))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}

function failure(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { code: 'catalogue_file', message } }), {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
    status,
  })
}
