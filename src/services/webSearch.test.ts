import { describe, expect, test } from 'vitest'
import {
  buildDuckDuckGoUrl,
  buildStoreSpecialsQuery,
  extractSearchResults,
  extractValidDates,
  pickCatalogueSource,
} from './webSearch'

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
