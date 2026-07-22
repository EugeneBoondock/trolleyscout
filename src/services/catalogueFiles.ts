// Catalogue files live on retailer CDNs that often refuse hotlinks (missing
// referer → 403) or forbid framing. /api/catalogue-file re-fetches them
// server-side and serves them same-origin, so readers can fall back to it
// whenever a direct URL fails — and must use it for embedded PDFs.

import type { StoreLeaflet } from '../types'

export function catalogueFileUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      return undefined
    }
    if (parsed.origin === currentOrigin()) {
      return undefined
    }
    return `/api/catalogue-file?u=${encodeURIComponent(parsed.toString())}`
  } catch {
    return undefined
  }
}

// This module is shared with the Pages Functions build, which has no DOM
// types — reach for the browser origin without naming `window`.
function currentOrigin(): string | undefined {
  return (globalThis as { location?: { origin?: string } }).location?.origin
}

export function isPdfUrl(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  try {
    return /\.pdf$/i.test(new URL(value).pathname)
  } catch {
    return false
  }
}

// The document a reader can embed when a leaflet publishes no page images.
export function leafletPdfUrl(leaflet: Pick<StoreLeaflet, 'documentUrl' | 'url'>): string | undefined {
  if (isPdfUrl(leaflet.documentUrl)) {
    return leaflet.documentUrl
  }
  return isPdfUrl(leaflet.url) ? leaflet.url : undefined
}

// Direct URLs first (fastest when the CDN allows hotlinks), then the
// same-origin relay for each, deduped and in order.
export function withProxiedFallbacks(urls: Array<string | undefined>): string[] {
  const direct = urls.filter((url): url is string => Boolean(url))
  const proxied = direct
    .map((url) => catalogueFileUrl(url))
    .filter((url): url is string => Boolean(url))
  return [...new Set([...direct, ...proxied])]
}
