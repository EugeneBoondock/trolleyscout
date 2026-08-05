// Worker-side web search. DuckDuckGo's HTML endpoint blocks Cloudflare
// datacenter IPs, so after a direct attempt we retry through the r.jina.ai
// reader, which fetches from its own network and returns markdown. Keyless
// jina is rate-limited on shared IPs, so callers back off and retry hourly;
// setting JINA_API_KEY (free tier) makes it reliable. Only the public search
// query ever leaves — never any user data.

import {
  buildBingSearchUrl,
  buildDuckDuckGoUrl,
  buildJinaReaderUrl,
  buildYahooSearchUrl,
  extractJinaSearchResults,
  extractSearchResults,
  extractSearchResultsFromMarkdown,
  type SearchResult,
} from '../../src/services/webSearch'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const MAX_BODY_BYTES = 1_500_000
const PAID_PROVIDER_RESULT_LIMIT = 10

export interface SearchProviderKeys {
  EXA_API_KEY?: string
  FIRECRAWL_API_KEY?: string
  TAVILY_API_KEY?: string
}

export async function searchWeb(
  query: string,
  jinaApiKey?: string,
  providerKeys: SearchProviderKeys = {},
): Promise<SearchResult[]> {
  return (await searchWebWithStatus(query, jinaApiKey, providerKeys)).results
}

export async function searchWebWithStatus(
  query: string,
  jinaApiKey?: string,
  providerKeys: SearchProviderKeys = {},
): Promise<{
  results: SearchResult[]
  status: 'success' | 'empty' | 'transient_failure'
}> {
  const paid = await searchConfiguredProviders(query, providerKeys)
  if (paid.results.length > 0) {
    return { results: paid.results, status: 'success' }
  }

  const ddgUrl = buildDuckDuckGoUrl(query)

  const direct = await fetchBody(ddgUrl)
  const directResults = direct.body ? extractSearchResults(direct.body) : []

  if (directResults.length > 0) {
    return { results: directResults, status: 'success' }
  }

  let sawSuccessfulProvider = paid.sawSuccessfulProvider || direct.status === 'success'

  if (jinaApiKey) {
    const jina = await fetchBody('https://s.jina.ai/', {
      body: JSON.stringify({ num: 12, q: query }),
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${jinaApiKey}`,
        'content-type': 'application/json',
        'x-respond-with': 'no-content',
      },
      method: 'POST',
    })
    const jinaResults = jina.body ? extractJinaSearchResults(jina.body) : []
    if (jinaResults.length > 0) {
      return { results: jinaResults, status: 'success' }
    }
    sawSuccessfulProvider ||= jina.status === 'success'
  }

  const proxied = await fetchBody(
    buildJinaReaderUrl(ddgUrl),
    {
      headers: jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : undefined,
    },
  )
  const proxiedResults = proxied.body
    ? extractSearchResultsFromMarkdown(proxied.body)
    : []

  if (proxiedResults.length > 0) {
    return { results: proxiedResults, status: 'success' }
  }

  sawSuccessfulProvider ||= proxied.status === 'success'

  const yahoo = await fetchBody(
    buildJinaReaderUrl(buildYahooSearchUrl(query)),
  )
  const yahooResults = yahoo.body
    ? extractSearchResultsFromMarkdown(yahoo.body)
    : []

  if (yahooResults.length > 0) {
    return { results: yahooResults, status: 'success' }
  }

  sawSuccessfulProvider ||= yahoo.status === 'success'

  const bing = await fetchBody(
    buildJinaReaderUrl(buildBingSearchUrl(query)),
  )
  const bingResults = bing.body
    ? extractSearchResultsFromMarkdown(bing.body)
    : []

  if (bingResults.length > 0) {
    return { results: bingResults, status: 'success' }
  }

  sawSuccessfulProvider ||= bing.status === 'success'
  return {
    results: [],
    status: sawSuccessfulProvider ? 'empty' : 'transient_failure',
  }
}

async function searchConfiguredProviders(
  query: string,
  keys: SearchProviderKeys,
): Promise<{ results: SearchResult[]; sawSuccessfulProvider: boolean }> {
  const requests: Array<Promise<{
    results: SearchResult[]
    status: 'success' | 'transient_failure' | 'permanent_failure'
  }>> = []

  if (keys.EXA_API_KEY) {
    requests.push(fetchSearchProvider(
      'https://api.exa.ai/search',
      {
        headers: { 'x-api-key': keys.EXA_API_KEY },
        payload: { numResults: PAID_PROVIDER_RESULT_LIMIT, query, type: 'auto' },
      },
      (payload) => readProviderResults(payload, ['results']),
    ))
  }
  if (keys.TAVILY_API_KEY) {
    requests.push(fetchSearchProvider(
      'https://api.tavily.com/search',
      {
        headers: { authorization: `Bearer ${keys.TAVILY_API_KEY}` },
        payload: {
          include_answer: false,
          include_raw_content: false,
          max_results: PAID_PROVIDER_RESULT_LIMIT,
          query,
          search_depth: 'basic',
          topic: 'general',
        },
      },
      (payload) => readProviderResults(payload, ['results']),
    ))
  }
  if (keys.FIRECRAWL_API_KEY) {
    requests.push(fetchSearchProvider(
      'https://api.firecrawl.dev/v2/search',
      {
        headers: { authorization: `Bearer ${keys.FIRECRAWL_API_KEY}` },
        payload: {
          limit: PAID_PROVIDER_RESULT_LIMIT,
          query,
          sources: ['web'],
          timeout: 8_000,
        },
      },
      (payload) => readProviderResults(payload, ['data', 'web']),
    ))
  }

  if (requests.length === 0) {
    return { results: [], sawSuccessfulProvider: false }
  }

  const settled = await Promise.all(requests)
  return {
    results: dedupeProviderResults(settled.flatMap((result) => result.results)),
    sawSuccessfulProvider: settled.some((result) => result.status === 'success'),
  }
}

async function fetchSearchProvider(
  url: string,
  options: { headers: Record<string, string>; payload: Record<string, unknown> },
  parse: (payload: unknown) => SearchResult[],
): Promise<{
  results: SearchResult[]
  status: 'success' | 'transient_failure' | 'permanent_failure'
}> {
  const response = await fetchBody(url, {
    body: JSON.stringify(options.payload),
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
    method: 'POST',
  })
  if (!response.body) return { results: [], status: response.status }
  try {
    return { results: parse(JSON.parse(response.body)), status: response.status }
  } catch {
    return { results: [], status: 'permanent_failure' }
  }
}

function readProviderResults(payload: unknown, path: readonly string[]): SearchResult[] {
  let value: unknown = payload
  for (const key of path) {
    if (!value || typeof value !== 'object') return []
    value = (value as Record<string, unknown>)[key]
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): SearchResult[] => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    const url = typeof row.url === 'string' ? row.url.trim() : ''
    return title && /^https?:\/\//i.test(url) ? [{ title, url }] : []
  }).slice(0, PAID_PROVIDER_RESULT_LIMIT)
}

function dedupeProviderResults(results: readonly SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return results.filter((result) => {
    try {
      const url = new URL(result.url)
      url.hash = ''
      const key = url.toString()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    } catch {
      return false
    }
  })
}

async function fetchBody(
  url: string,
  options: {
    body?: string
    headers?: Record<string, string>
    method?: 'GET' | 'POST'
  } = {},
): Promise<{
  body?: string
  status: 'success' | 'transient_failure' | 'permanent_failure'
}> {
  try {
    const response = await fetch(url, {
      body: options.body,
      headers: {
        accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
        'user-agent': BROWSER_UA,
        ...options.headers,
      },
      method: options.method ?? 'GET',
      redirect: 'follow',
    })

    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return { status: 'transient_failure' }
    }

    if (!response.ok) {
      return { status: 'permanent_failure' }
    }

    return {
      body: (await response.text()).slice(0, MAX_BODY_BYTES),
      status: 'success',
    }
  } catch {
    return { status: 'transient_failure' }
  }
}
