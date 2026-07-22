import { describe, expect, it } from 'vitest'

import { catalogueFileUrl, isPdfUrl, leafletPdfUrl, withProxiedFallbacks } from './catalogueFiles'

describe('catalogueFileUrl', () => {
  it('routes an external https file through the same-origin relay', () => {
    expect(catalogueFileUrl('https://www.okfoods.co.za/leaflets/CEN-Foods.pdf')).toBe(
      '/api/catalogue-file?u=https%3A%2F%2Fwww.okfoods.co.za%2Fleaflets%2FCEN-Foods.pdf',
    )
  })

  it('refuses non-https and unparseable URLs', () => {
    expect(catalogueFileUrl('http://www.okfoods.co.za/leaflet.pdf')).toBeUndefined()
    expect(catalogueFileUrl('/local/cover.jpg')).toBeUndefined()
  })

  it('leaves same-origin URLs alone', () => {
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin
    expect(origin).toBeTruthy()
    expect(catalogueFileUrl(`${origin}/assets/cover.jpg`)).toBeUndefined()
  })
})

describe('leafletPdfUrl', () => {
  it('prefers the document URL, then a PDF link, and ignores HTML links', () => {
    expect(leafletPdfUrl({
      documentUrl: 'https://cdn.test/week.pdf',
      url: 'https://retailer.test/specials',
    })).toBe('https://cdn.test/week.pdf')
    expect(leafletPdfUrl({ url: 'https://retailer.test/week.pdf' }))
      .toBe('https://retailer.test/week.pdf')
    expect(leafletPdfUrl({ url: 'https://retailer.test/specials' })).toBeUndefined()
  })

  it('does not mistake a viewer page for a PDF', () => {
    expect(isPdfUrl('https://viewer.test/book/index.html?file=week.pdf')).toBe(false)
  })
})

describe('withProxiedFallbacks', () => {
  it('keeps direct URLs first and appends deduped relay fallbacks', () => {
    const urls = withProxiedFallbacks([
      'https://cdn.test/page-1.webp',
      'https://cdn.test/page-1.jpg',
      undefined,
    ])

    expect(urls).toEqual([
      'https://cdn.test/page-1.webp',
      'https://cdn.test/page-1.jpg',
      '/api/catalogue-file?u=https%3A%2F%2Fcdn.test%2Fpage-1.webp',
      '/api/catalogue-file?u=https%3A%2F%2Fcdn.test%2Fpage-1.jpg',
    ])
  })
})
