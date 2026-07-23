// Search-backed catalogue discovery. When Geoapify/our scout has no deals for a
// store, we search the open web for that store's current specials and turn the
// best result into a "this week's catalogue" link — the way a shopper would
// Google it. No API key: DuckDuckGo's HTML endpoint is a plain fetch.

export interface SearchResult {
  url: string
  title: string
}

export function buildDuckDuckGoUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
}

export function buildBingSearchUrl(query: string): string {
  return `http://www.bing.com/search?q=${encodeURIComponent(query)}`
}

export function buildYahooSearchUrl(query: string): string {
  return `http://search.yahoo.com/search?p=${encodeURIComponent(query)}`
}

export function buildStoreSpecialsQuery(
  storeName: string,
  area?: string,
  verifiedHost?: string,
  countryName = 'South Africa',
): string {
  const place = area ? ` ${area}` : ''
  const site = verifiedHost ? `site:${normalizeHost(verifiedHost)} ` : ''
  return `${site}${storeName}${place} specials catalogue ${countryName}`
}

// Reputable SA catalogue aggregators — trusted as a fallback when the store's
// own site is not in the results.
const AGGREGATOR_HOSTS = ['guzzle.co.za', 'tiendeo.co.za', 'cataloguespecials.co.za']

// Hosts that are never a store's specials page.
const JUNK_HOSTS = [
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'linkedin.com',
  'tiktok.com',
  'pinterest.com',
  'wikipedia.org',
  'duckduckgo.com',
  'yahoo.com',
  'bing.com',
]

// DuckDuckGo blocks direct fetches from datacenter IPs (Workers), so we retry
// through the r.jina.ai reader proxy, which fetches from its own network and
// returns the page as markdown. Keyless; our volume is a handful a day.
export function buildJinaReaderUrl(url: string): string {
  return `https://r.jina.ai/${url}`
}

// Parses search results out of a reader-proxied DDG page. Result links look
// like "[Title](https://duckduckgo.com/l/?uddg=<encoded>&rut=…)"; every result
// also has an image link and a bare-URL link pointing at the same target,
// which dedupe (first wins) and the URL-shaped-title check discard.
export function extractSearchResultsFromMarkdown(markdown: string, limit = 12): SearchResult[] {
  const results: SearchResult[] = []
  const seen = new Set<string>()
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(markdown)) !== null && results.length < limit) {
    const title = stripTags(match[1])
    const url = decodeSearchHref(match[2])

    if (
      !url ||
      seen.has(url) ||
      isJunkHost(url) ||
      !title ||
      title.startsWith('![') ||
      /^(?:https?:\/\/|www\.)/i.test(title)
    ) {
      continue
    }

    seen.add(url)
    results.push({ title, url })
  }

  return results
}

export function extractSearchResults(html: string, limit = 12): SearchResult[] {
  const results: SearchResult[] = []
  const seen = new Set<string>()
  const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null && results.length < limit) {
    const url = decodeDuckDuckGoHref(match[1])
    const title = stripTags(match[2])

    if (!url || seen.has(url) || isJunkHost(url)) {
      continue
    }

    seen.add(url)
    results.push({ title, url })
  }

  return results
}

export function extractJinaSearchResults(value: string, limit = 12): SearchResult[] {
  try {
    const payload = JSON.parse(value) as { data?: unknown }
    if (!Array.isArray(payload.data)) {
      return []
    }

    const results: SearchResult[] = []
    const seen = new Set<string>()

    for (const item of payload.data) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const record = item as Record<string, unknown>
      const title = typeof record.title === 'string' ? stripTags(record.title) : ''
      const url = typeof record.url === 'string' ? record.url.trim() : ''

      if (
        !title ||
        !url ||
        seen.has(url) ||
        isJunkHost(url) ||
        !/^https?:\/\//i.test(url)
      ) {
        continue
      }

      seen.add(url)
      results.push({ title, url })
      if (results.length >= limit) {
        break
      }
    }

    return results
  } catch {
    return []
  }
}

// A PDF is evidence only after its host has been verified as the store's own
// site. With no verified host, return an HTML candidate so the caller can
// verify store identity before following any catalogue links.
export function pickCatalogueSource(
  results: SearchResult[],
  storeName: string,
  verifiedHost?: string,
): { url: string; title: string; kind: 'pdf' | 'official' } | undefined {
  const nameTokens = storeNameTokens(storeName)
  const officialHost = verifiedHost ? normalizeHost(verifiedHost) : undefined

  if (officialHost) {
    if (isAggregator(officialHost)) {
      return undefined
    }
    const officialResults = results.filter((result) => sameHost(hostOf(result.url), officialHost))
    const pdf = officialResults.find((result) => /\.pdf(?:$|\?)/i.test(result.url))
    if (pdf) {
      return { kind: 'pdf', title: pdf.title, url: pdf.url }
    }

    const page = officialResults.find((result) => !isAggregator(hostOf(result.url)))
    return page ? { kind: 'official', title: page.title, url: page.url } : undefined
  }

  const official = results.find((result) => {
    const host = hostOf(result.url)
    return (
      host &&
      !isAggregator(host) &&
      !/\.pdf(?:$|\?)/i.test(result.url) &&
      nameTokens.some((token) => host.includes(token))
    )
  })
  if (official) {
    return { kind: 'official', title: official.title, url: official.url }
  }

  return undefined
}

// Pulls a "valid dd Month - dd Month" style date range out of page text, when
// present, so surfaced catalogues can still respect their end date.
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

export function extractValidDates(
  text: string,
  year: number,
): { validFrom?: string; validTo?: string } {
  const monthNames = MONTHS.map((m) => m.slice(0, 3)).join('|')
  const range = new RegExp(
    `(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(${monthNames})[a-z]*\\s*(?:to|-|–|until)\\s*(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(${monthNames})[a-z]*`,
    'i',
  )
  const match = range.exec(text)

  if (!match) {
    return {}
  }

  const validFrom = toIso(Number(match[1]), match[2], year)
  const validTo = toIso(Number(match[3]), match[4], year)

  return { validFrom, validTo }
}

function toIso(day: number, monthAbbrev: string, year: number): string | undefined {
  const month = MONTHS.findIndex((m) => m.startsWith(monthAbbrev.toLowerCase()))

  if (month < 0 || day < 1 || day > 31) {
    return undefined
  }

  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function decodeDuckDuckGoHref(href: string): string {
  const cleaned = href.replace(/&amp;/g, '&')
  const uddg = /[?&]uddg=([^&]+)/.exec(cleaned)

  if (uddg) {
    try {
      return decodeURIComponent(uddg[1])
    } catch {
      return ''
    }
  }

  if (cleaned.startsWith('http')) {
    return cleaned
  }

  return ''
}

function decodeSearchHref(href: string): string {
  const duckDuckGoTarget = decodeDuckDuckGoHref(href)
  if (!duckDuckGoTarget) return ''

  try {
    const url = new URL(duckDuckGoTarget)
    const host = normalizeHost(url.hostname)
    if (host === 'r.search.yahoo.com') {
      const target = /\/RU=([^/]+)\/RK=/.exec(url.pathname)?.[1]
      if (!target) return ''
      const decoded = decodeURIComponent(target)
      return /^https?:\/\//i.test(decoded) ? decoded : ''
    }

    if (!host.endsWith('bing.com') || url.pathname !== '/ck/a') {
      return duckDuckGoTarget
    }

    const encoded = url.searchParams.get('u')
    if (!encoded?.startsWith('a1')) return ''
    const base64 = encoded
      .slice(2)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil((encoded.length - 2) / 4) * 4, '=')
    const decoded = atob(base64)
    return /^https?:\/\//i.test(decoded) ? decoded : ''
  } catch {
    return ''
  }
}

function storeNameTokens(storeName: string): string[] {
  return storeName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
}

function hostOf(url: string): string {
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return ''
  }
}

function normalizeHost(host: string): string {
  return host.trim().replace(/^www\./, '').toLowerCase()
}

function sameHost(left: string, right: string): boolean {
  return normalizeHost(left) === normalizeHost(right)
}

function isAggregator(host: string): boolean {
  return AGGREGATOR_HOSTS.some((aggregator) => host.endsWith(aggregator))
}

function isJunkHost(url: string): boolean {
  const host = hostOf(url)
  return !host || JUNK_HOSTS.some((junk) => host.endsWith(junk))
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}
