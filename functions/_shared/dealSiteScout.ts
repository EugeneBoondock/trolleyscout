// Fetches the four external deal sites and caches their normalized deals in D1,
// one row per site. Each fetch is isolated and time-bounded so a slow or broken
// site never blocks the others or the Worker. The public /api/deal-sites
// endpoint reads the cache and triggers a background refresh when it is stale.

import {
  parseDaddysDeals,
  parseHyperli,
  parseMyRunway,
  parseOneDayOnly,
  type DealSiteId,
  type DealSiteItem,
} from '../../src/services/dealSites'
import { hasTrolleyScoutDatabase, type TrolleyScoutEnv } from './env'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 9_000
const MAX_ITEMS_PER_SITE = 60
// A cache row older than this is refreshed in the background on the next read.
export const DEAL_SITE_STALE_MS = 2 * 60 * 60 * 1000

interface DealSiteRow {
  source_key: string
  payload_json: string
  item_count: number
  fetched_at: string
}

interface DealSiteSourceMeta {
  id: DealSiteId
  label: string
  count: number
  fetchedAt: string
}

export interface DealSiteFeed {
  deals: DealSiteItem[]
  sources: DealSiteSourceMeta[]
  refreshedAt?: string
}

const SITE_LABELS: Record<DealSiteId, string> = {
  onedayonly: 'OneDayOnly',
  hyperli: 'Hyperli',
  daddysdeals: "Daddy's Deals",
  myrunway: 'MyRunway',
}

async function fetchOneDayOnly(fetcher: typeof fetch): Promise<DealSiteItem[]> {
  const response = await timedFetch(fetcher, 'https://www.onedayonly.co.za/', {
    headers: { 'user-agent': BROWSER_UA, accept: 'text/html' },
  })
  if (!response.ok) return []
  return parseOneDayOnly(await response.text())
}

async function fetchHyperli(fetcher: typeof fetch): Promise<DealSiteItem[]> {
  const response = await timedFetch(fetcher, 'https://hyperli.com/products.json?limit=250', {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
  })
  if (!response.ok) return []
  return parseHyperli(await response.json())
}

async function fetchDaddysDeals(fetcher: typeof fetch): Promise<DealSiteItem[]> {
  const response = await timedFetch(
    fetcher,
    'https://daddysdeals.co.za/wp-json/wp/v2/product?per_page=50&_embed=1',
    { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' } },
  )
  if (!response.ok) return []
  return parseDaddysDeals(await response.json())
}

async function fetchMyRunway(fetcher: typeof fetch): Promise<DealSiteItem[]> {
  // MyRunway's API accepts a self-issued guest session token (a UUID), the same
  // way its own web client bootstraps an anonymous browsing session.
  const response = await timedFetch(fetcher, 'https://api.myrunway.co.za/v1/products?size=60', {
    headers: {
      accept: 'application/json',
      'user-agent': BROWSER_UA,
      'x-session-token': crypto.randomUUID(),
      'device-type': 'web',
      origin: 'https://myrunway.co.za',
      referer: 'https://myrunway.co.za/',
    },
  })
  if (!response.ok) return []
  return parseMyRunway(await response.json())
}

const SITE_FETCHERS: Record<DealSiteId, (fetcher: typeof fetch) => Promise<DealSiteItem[]>> = {
  onedayonly: fetchOneDayOnly,
  hyperli: fetchHyperli,
  daddysdeals: fetchDaddysDeals,
  myrunway: fetchMyRunway,
}

// Refreshes every site's cache row. Each site is independent: a failure keeps
// the previously cached data rather than blanking it. Returns how many items
// were freshly written.
export async function refreshDealSites(
  env: TrolleyScoutEnv,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  if (!hasTrolleyScoutDatabase(env)) return 0

  const ids = Object.keys(SITE_FETCHERS) as DealSiteId[]
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const items = (await SITE_FETCHERS[id](fetcher)).slice(0, MAX_ITEMS_PER_SITE)
      if (items.length === 0) return 0
      await writeSiteRow(env, id, items)
      return items.length
    }),
  )

  return results.reduce(
    (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
    0,
  )
}

export async function readDealSiteFeed(env: TrolleyScoutEnv): Promise<DealSiteFeed> {
  if (!hasTrolleyScoutDatabase(env)) {
    return { deals: [], sources: [] }
  }

  let rows: DealSiteRow[]
  try {
    const result = await env.DB.prepare(
      'SELECT source_key, payload_json, item_count, fetched_at FROM deal_site_cache',
    ).all<DealSiteRow>()
    rows = result.results
  } catch {
    return { deals: [], sources: [] }
  }

  const deals: DealSiteItem[] = []
  const sources: DealSiteSourceMeta[] = []
  let newest: string | undefined

  for (const row of rows) {
    const id = row.source_key as DealSiteId
    if (!(id in SITE_LABELS)) continue
    let items: DealSiteItem[] = []
    try {
      const parsed = JSON.parse(row.payload_json)
      if (Array.isArray(parsed)) items = parsed as DealSiteItem[]
    } catch {
      items = []
    }
    deals.push(...items)
    sources.push({ count: items.length, fetchedAt: row.fetched_at, id, label: SITE_LABELS[id] })
    if (!newest || row.fetched_at > newest) newest = row.fetched_at
  }

  return { deals, refreshedAt: newest, sources }
}

// True when no row exists or the oldest row is older than the stale window —
// the read endpoint uses this to schedule a background refresh.
export async function dealSitesNeedRefresh(env: TrolleyScoutEnv, nowMs: number): Promise<boolean> {
  if (!hasTrolleyScoutDatabase(env)) return false
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS total, MIN(fetched_at) AS oldest FROM deal_site_cache',
    ).first<{ total: number; oldest: string | null }>()
    if (!row || row.total < 1 || !row.oldest) return true
    return nowMs - Date.parse(row.oldest) > DEAL_SITE_STALE_MS
  } catch {
    return true
  }
}

async function writeSiteRow(
  env: TrolleyScoutEnv & { DB: D1Database },
  id: DealSiteId,
  items: DealSiteItem[],
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO deal_site_cache (source_key, payload_json, item_count, fetched_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (source_key) DO UPDATE SET
        payload_json = excluded.payload_json,
        item_count = excluded.item_count,
        fetched_at = excluded.fetched_at`,
  )
    .bind(id, JSON.stringify(items), items.length, new Date().toISOString())
    .run()
}

async function timedFetch(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetcher(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
