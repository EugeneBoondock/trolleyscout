// Worker-side web search. DuckDuckGo's HTML endpoint blocks Cloudflare
// datacenter IPs, so after a direct attempt we retry through the r.jina.ai
// reader, which fetches from its own network and returns markdown. Keyless
// jina is rate-limited on shared IPs, so callers back off and retry hourly;
// setting JINA_API_KEY (free tier) makes it reliable. Only the public search
// query ever leaves — never any user data.

import {
  buildDuckDuckGoUrl,
  buildJinaReaderUrl,
  extractJinaSearchResults,
  extractSearchResults,
  extractSearchResultsFromMarkdown,
  type SearchResult,
} from '../../src/services/webSearch'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const MAX_BODY_BYTES = 1_500_000

export async function searchWeb(query: string, jinaApiKey?: string): Promise<SearchResult[]> {
  return (await searchWebWithStatus(query, jinaApiKey)).results
}

export async function searchWebWithStatus(
  query: string,
  jinaApiKey?: string,
): Promise<{
  results: SearchResult[]
  status: 'success' | 'empty' | 'transient_failure'
}> {
  const ddgUrl = buildDuckDuckGoUrl(query)

  const direct = await fetchBody(ddgUrl)
  const directResults = direct.body ? extractSearchResults(direct.body) : []

  if (directResults.length > 0) {
    return { results: directResults, status: 'success' }
  }

  let sawSuccessfulProvider = direct.status === 'success'

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
  return {
    results: [],
    status: sawSuccessfulProvider ? 'empty' : 'transient_failure',
  }
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
