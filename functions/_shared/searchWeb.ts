// Worker-side web search. DuckDuckGo's HTML endpoint blocks Cloudflare
// datacenter IPs, so after a direct attempt we retry through the r.jina.ai
// reader, which fetches from its own network and returns markdown. Keyless
// jina is rate-limited on shared IPs, so callers back off and retry hourly;
// setting JINA_API_KEY (free tier) makes it reliable. Only the public search
// query ever leaves — never any user data.

import {
  buildDuckDuckGoUrl,
  buildJinaReaderUrl,
  extractSearchResults,
  extractSearchResultsFromMarkdown,
  type SearchResult,
} from '../../src/services/webSearch'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const MAX_BODY_BYTES = 1_500_000

export async function searchWeb(query: string, jinaApiKey?: string): Promise<SearchResult[]> {
  const ddgUrl = buildDuckDuckGoUrl(query)

  const direct = await fetchBody(ddgUrl)
  const directResults = direct ? extractSearchResults(direct) : []

  if (directResults.length > 0) {
    return directResults
  }

  const proxied = await fetchBody(
    buildJinaReaderUrl(ddgUrl),
    jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : undefined,
  )

  return proxied ? extractSearchResultsFromMarkdown(proxied) : []
}

async function fetchBody(
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html, text/plain;q=0.9, */*;q=0.8',
        'user-agent': BROWSER_UA,
        ...extraHeaders,
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return undefined
    }

    return (await response.text()).slice(0, MAX_BODY_BYTES)
  } catch {
    return undefined
  }
}
