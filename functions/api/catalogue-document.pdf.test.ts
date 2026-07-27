import { describe, expect, it, vi } from 'vitest'

import {
  catalogueDocumentCacheKey,
  extractHeyzineDocumentUrl,
  handleCatalogueDocumentRequest,
  resolveHeyzineDocumentRequest,
} from './catalogue-document.pdf'

function request(query = 'source=heyzine&book=9744ed8319') {
  return new Request(
    `https://trolleyscout.co.za/api/catalogue-document.pdf?${query}`,
  )
}

describe('resolveHeyzineDocumentRequest', () => {
  it('maps an exact short book ID to the fixed Heyzine viewer', () => {
    expect(resolveHeyzineDocumentRequest(request().url)).toEqual({
      bookId: '9744ed8319',
      source: 'heyzine',
      viewerUrl: 'https://heyzine.com/flip-book/9744ed8319.html',
    })
  })

  it.each([
    'source=other&book=9744ed8319',
    'source=heyzine&book=9744ed831',
    'source=heyzine&book=9744ed83190',
    'source=heyzine&book=9744edzzzz',
    'source=heyzine&book=..%2Finternal',
  ])('rejects unsafe identifiers: %s', (query) => {
    expect(resolveHeyzineDocumentRequest(request(query).url)).toBeUndefined()
  })
})

describe('extractHeyzineDocumentUrl', () => {
  const hash = '9744ed8319ced8d8d048b71b0c4c7fad690e7786'

  it('extracts a direct PDF from the exact cdnc Heyzine host', () => {
    expect(extractHeyzineDocumentUrl(`
      <a href="https://cdnc.heyzine.com/flip-book/pdf/${hash}-1.pdf">
        Download
      </a>
    `)).toBe(
      `https://cdnc.heyzine.com/flip-book/pdf/${hash}-1.pdf`,
    )

    expect(extractHeyzineDocumentUrl(
      `{"download":"https:\\/\\/cdnc.heyzine.com\\/files\\/uploaded\\/v3\\/${hash}.pdf"}`,
    )).toBe(
      `https://cdnc.heyzine.com/files/uploaded/v3/${hash}.pdf`,
    )
  })

  it.each([
    `https://cdn.heyzine.com/flip-book/pdf/${hash}-1.pdf`,
    `https://cdnc.heyzine.com.evil.test/flip-book/pdf/${hash}-1.pdf`,
    `https://cdnc.heyzine.com/flip-book/pdf/${hash}-1.pdf?next=x`,
    'https://cdnc.heyzine.com/flip-book/pdf/not-a-hash.pdf',
    `https://cdnc.heyzine.com/files/uploaded/v3/${hash}.pdf-thumb.jpg`,
  ])('rejects non-document candidate %s', (candidate) => {
    expect(extractHeyzineDocumentUrl(`<a href="${candidate}">x</a>`))
      .toBeUndefined()
  })
})

describe('handleCatalogueDocumentRequest', () => {
  it('resolves and relays the bounded PDF with public cache headers', async () => {
    const hash = '9744ed8319ced8d8d048b71b0c4c7fad690e7786'
    const pdfUrl =
      `https://cdnc.heyzine.com/flip-book/pdf/${hash}-1.pdf`
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://heyzine.com/flip-book/9744ed8319.html') {
        return new Response(`<a href="${pdfUrl}">Download</a>`, {
          headers: { 'content-type': 'text/html' },
        })
      }
      if (url === pdfUrl) {
        return new Response('%PDF-1.7 full catalogue', {
          headers: { 'content-type': 'application/pdf' },
        })
      }
      throw new Error(`Unexpected request ${url}`)
    }) as typeof fetch

    const response = await handleCatalogueDocumentRequest(request(), fetcher)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toContain('max-age=21600')
    expect(response.headers.get('content-disposition')).toBe('inline')
    expect(await response.text()).toBe('%PDF-1.7 full catalogue')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not fetch a document when viewer HTML exceeds its size limit', async () => {
    const fetcher = vi.fn(async () => new Response('too large', {
      headers: {
        'content-length': String(2 * 1024 * 1024 + 1),
        'content-type': 'text/html',
      },
    })) as typeof fetch

    const response = await handleCatalogueDocumentRequest(request(), fetcher)

    expect(response.status).toBe(502)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects an unsafe request before fetching upstream', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch

    const response = await handleCatalogueDocumentRequest(
      request('source=heyzine&book=../../internal'),
      fetcher,
    )

    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('catalogueDocumentCacheKey', () => {
  it('uses only the validated provider and book ID', () => {
    expect(catalogueDocumentCacheKey(request(
      'book=9744ED8319&source=heyzine',
    ))).toBe(
      'https://edge-cache.trolleyscout.co.za/api/catalogue-document.pdf?source=heyzine&book=9744ed8319',
    )
    expect(catalogueDocumentCacheKey(request(
      'source=heyzine&book=../internal',
    ))).toBeUndefined()
  })
})
