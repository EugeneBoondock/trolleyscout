import { describe, expect, test } from 'vitest'
import {
  buildDuckDuckGoUrl,
  buildJinaReaderUrl,
  buildStoreSpecialsQuery,
  extractSearchResults,
  extractSearchResultsFromMarkdown,
  extractValidDates,
  pickCatalogueSource,
} from './webSearch'

// Shape of a real r.jina.ai render of a DuckDuckGo results page: each result
// has a title link, a favicon image link, and a bare-URL link to the same
// uddg-encoded target.
const READER_MARKDOWN = `
Title: supermarkets Edenvale at DuckDuckGo

[Frontline Hyper in Edenvale | July Specials & Deals | Tiendeo](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tiendeo.co.za%2Fedenvale%2Ffrontline&rut=7add02f2)
[![Image 1](https://external-content.duckduckgo.com/ip3/www.tiendeo.co.za.ico)
[www.tiendeo.co.za/edenvale/frontline](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tiendeo.co.za%2Fedenvale%2Ffrontline&rut=7add02f2)
[Home - Devland Cash and Carry](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.devland.co.za%2F&rut=409c4791)
[Frontline Hyper Edenvale | Germiston - Facebook](https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Ffrontlinehyperedenvale%2F&rut=3d57bf01)
`

describe('extractSearchResultsFromMarkdown', () => {
  test('decodes uddg targets and keeps one entry per URL with the real title', () => {
    const results = extractSearchResultsFromMarkdown(READER_MARKDOWN)

    expect(results[0]).toEqual({
      title: 'Frontline Hyper in Edenvale | July Specials & Deals | Tiendeo',
      url: 'https://www.tiendeo.co.za/edenvale/frontline',
    })
    expect(results.filter((r) => r.url.includes('tiendeo'))).toHaveLength(1)
  })

  test('drops junk hosts and favicon image links', () => {
    const results = extractSearchResultsFromMarkdown(READER_MARKDOWN)

    expect(results.some((r) => r.url.includes('facebook'))).toBe(false)
    expect(results.some((r) => r.url.includes('external-content'))).toBe(false)
    expect(results.map((r) => r.title)).toContain('Home - Devland Cash and Carry')
  })

  test('builds a reader-proxy URL', () => {
    expect(buildJinaReaderUrl('https://html.duckduckgo.com/html/?q=x')).toBe(
      'https://r.jina.ai/https://html.duckduckgo.com/html/?q=x',
    )
  })
})

describe('buildDuckDuckGoUrl / query', () => {
  test('builds a keyless HTML search URL', () => {
    expect(buildDuckDuckGoUrl('frontline specials')).toBe(
      'https://html.duckduckgo.com/html/?q=frontline%20specials',
    )
  })

  test('builds a store specials query with area', () => {
    expect(buildStoreSpecialsQuery('Frontline Hyper', 'Edenvale')).toBe(
      'Frontline Hyper Edenvale specials catalogue South Africa',
    )
  })
})

describe('extractSearchResults', () => {
  test('decodes DuckDuckGo redirect hrefs and drops social/junk hosts', () => {
    const html = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ffrontlinesa.co.za%2Fspecials&amp;rut=x">Frontline Specials</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.facebook.com%2Ffrontline&amp;rut=y">Facebook</a>
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.guzzle.co.za%2Ffrontline-hyper%2F&amp;rut=z">Guzzle</a>`

    const results = extractSearchResults(html)

    expect(results.map((r) => r.url)).toEqual([
      'https://frontlinesa.co.za/specials',
      'https://www.guzzle.co.za/frontline-hyper/',
    ])
  })
})

describe('pickCatalogueSource', () => {
  const results = [
    { title: 'Tiendeo Frontline', url: 'https://www.tiendeo.co.za/edenvale/frontline' },
    { title: 'Guzzle Frontline', url: 'https://www.guzzle.co.za/frontline-hyper/' },
    { title: 'Official', url: 'https://frontlinesa.co.za/specials' },
    { title: 'Direct PDF', url: 'https://frontlinesa.co.za/uploads/frontline-national.pdf' },
  ]

  test('prefers a direct PDF, then official site, then aggregator', () => {
    expect(pickCatalogueSource(results, 'Frontline Hyper')?.kind).toBe('pdf')
    expect(pickCatalogueSource(results.slice(0, 3), 'Frontline Hyper')?.kind).toBe('official')
    expect(pickCatalogueSource(results.slice(0, 2), 'Frontline Hyper')?.kind).toBe('aggregator')
  })

  test('returns undefined when nothing usable is found', () => {
    expect(pickCatalogueSource([], 'Frontline')).toBeUndefined()
  })
})

describe('extractValidDates', () => {
  test('reads a printed date range into ISO dates', () => {
    expect(extractValidDates('Valid 13 July to 22 July', 2026)).toEqual({
      validFrom: '2026-07-13',
      validTo: '2026-07-22',
    })
    expect(extractValidDates('Specials 29 June - 19 July 2026', 2026)).toEqual({
      validFrom: '2026-06-29',
      validTo: '2026-07-19',
    })
  })

  test('returns empty when no dates are present', () => {
    expect(extractValidDates('shop now for great deals', 2026)).toEqual({})
  })
})
