import { describe, expect, it } from 'vitest'

import {
  catalogueFileContentType,
  handleCatalogueFileRequest,
  resolveCatalogueFileUrl,
} from './catalogue-file'

function request(target?: string) {
  const query = target === undefined ? '' : `?u=${encodeURIComponent(target)}`
  return new Request(`https://trolleyscout.co.za/api/catalogue-file${query}`)
}

describe('resolveCatalogueFileUrl', () => {
  it('accepts public https catalogue hosts and strips fragments', () => {
    const url = resolveCatalogueFileUrl(
      'https://www.okfoods.co.za/content/dam/leaflets/CEN-Foods.pdf#page=2',
    )

    expect(url?.toString()).toBe('https://www.okfoods.co.za/content/dam/leaflets/CEN-Foods.pdf')
  })

  it.each([
    ['http (not https)', 'http://www.okfoods.co.za/leaflet.pdf'],
    ['missing value', null],
    ['not a URL', 'not-a-url'],
    ['localhost', 'https://localhost/leaflet.pdf'],
    ['IPv4 literal', 'https://10.0.0.8/leaflet.pdf'],
    ['IPv6 literal', 'https://[::1]/leaflet.pdf'],
    ['dotless internal name', 'https://intranet/leaflet.pdf'],
    ['.local suffix', 'https://printer.local/leaflet.pdf'],
    ['explicit port', 'https://www.okfoods.co.za:8443/leaflet.pdf'],
    ['credentials', 'https://user:pass@www.okfoods.co.za/leaflet.pdf'],
    ['own host (loop)', 'https://trolleyscout.co.za/api/catalogue-file?u=x'],
    ['own preview host', 'https://branch.trolley-scout.pages.dev/file.pdf'],
  ])('rejects %s', (_label, value) => {
    expect(resolveCatalogueFileUrl(value)).toBeUndefined()
  })
})

describe('catalogueFileContentType', () => {
  it('passes PDFs and images through and treats octet-stream as PDF', () => {
    expect(catalogueFileContentType('application/pdf;charset=utf-8')).toBe('application/pdf')
    expect(catalogueFileContentType('image/webp')).toBe('image/webp')
    expect(catalogueFileContentType('application/octet-stream')).toBe('application/pdf')
  })

  it('refuses HTML and unknown types so the endpoint cannot relay pages', () => {
    expect(catalogueFileContentType('text/html')).toBeUndefined()
    expect(catalogueFileContentType('application/javascript')).toBeUndefined()
    expect(catalogueFileContentType(null)).toBeUndefined()
  })
})

describe('handleCatalogueFileRequest', () => {
  it('streams an allowed upstream file with cache and CORS headers', async () => {
    const fetcher = (async () =>
      new Response('%PDF-1.7 catalogue', {
        headers: { 'content-type': 'application/pdf' },
      })) as typeof fetch

    const response = await handleCatalogueFileRequest(
      request('https://www.okfoods.co.za/leaflet.pdf'),
      fetcher,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('cache-control')).toContain('max-age=21600')
    expect(await response.text()).toBe('%PDF-1.7 catalogue')
  })

  it('sends a browser identity and the source referer upstream', async () => {
    let seenHeaders: Headers | undefined
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders = new Headers(init?.headers)
      return new Response('x', { headers: { 'content-type': 'image/jpeg' } })
    }) as typeof fetch

    await handleCatalogueFileRequest(
      request('https://www.okfoods.co.za/leaflet-cover.jpg'),
      fetcher,
    )

    expect(seenHeaders?.get('referer')).toBe('https://www.okfoods.co.za/')
    expect(seenHeaders?.get('user-agent')).toContain('Mozilla/5.0')
  })

  it('rejects disallowed targets without fetching', async () => {
    let fetched = false
    const fetcher = (async () => {
      fetched = true
      return new Response('')
    }) as typeof fetch

    const response = await handleCatalogueFileRequest(request('https://[::1]/x.pdf'), fetcher)

    expect(response.status).toBe(400)
    expect(fetched).toBe(false)
  })

  it('refuses upstream HTML bodies', async () => {
    const fetcher = (async () =>
      new Response('<html></html>', {
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch

    const response = await handleCatalogueFileRequest(
      request('https://www.okfoods.co.za/leaflet.pdf'),
      fetcher,
    )

    expect(response.status).toBe(415)
  })

  it('refuses oversized files by declared length', async () => {
    const fetcher = (async () =>
      new Response('x', {
        headers: {
          'content-length': String(31 * 1024 * 1024),
          'content-type': 'application/pdf',
        },
      })) as typeof fetch

    const response = await handleCatalogueFileRequest(
      request('https://www.okfoods.co.za/leaflet.pdf'),
      fetcher,
    )

    expect(response.status).toBe(413)
  })

  it('reports unreachable sources as a bad gateway', async () => {
    const fetcher = (async () => {
      throw new Error('connect timeout')
    }) as typeof fetch

    const response = await handleCatalogueFileRequest(
      request('https://www.okfoods.co.za/leaflet.pdf'),
      fetcher,
    )

    expect(response.status).toBe(502)
  })
})
