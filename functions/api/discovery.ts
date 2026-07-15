import { dataPolicy } from '../../src/api/staticData'
import {
  buildClicksPromotionsApiUrl,
  buildPnpPromotionsApiUrl,
  buildTakealotDealsApiUrl,
  buildSourceResult,
  extractClicksPromotionDeals,
  extractDealsFromHtml,
  extractPnpPromotionDeals,
  extractTakealotProductDeals,
  getDiscoveryTargets,
  type ResolvedDiscoveryTarget,
} from '../../src/services/dealDiscovery'
import {
  buildLeafletApiUrl,
  extractBoxerLeaflets,
  extractPdfLeaflets,
  extractSixtyLeaflets,
  leafletTargets,
  type LeafletTarget,
} from '../../src/services/leafletDiscovery'
import type { DiscoveredDeal, DiscoverySourceResult, StoreLeaflet } from '../../src/types'
import {
  type DealSnapshot,
  readDealSnapshots,
  readLeafletSnapshot,
  saveDealSnapshots,
  saveLeafletSnapshot,
  snapshotKey,
} from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

// How old the newest snapshot may get before a background refresh is kicked.
const STALE_AFTER_MS = 60 * 60 * 1000

// The Shoprite-Group leaflet endpoints and pages reject non-browser
// user-agents with a 403, so reading their free public catalogues needs one.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface SourceCheck {
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const forceLive = new URL(request.url).searchParams.get('refresh') === '1'
  const [snapshots, leafletSnapshot] = await Promise.all([
    readDealSnapshots(env),
    readLeafletSnapshot(env),
  ])

  // Instant path: serve the last stored snapshot without waiting on any
  // retailer. A background refresh keeps it fresh so the next visitor still
  // sees current prices — the page never blocks on 13 live fetches.
  if (!forceLive && snapshots.size > 0) {
    const newestCheckedAt = newestSnapshotTime(snapshots)
    const isStale = !newestCheckedAt || Date.now() - Date.parse(newestCheckedAt) > STALE_AFTER_MS

    if (isStale) {
      waitUntil(Promise.all([refreshAllSources(env), refreshAllLeaflets(env)]))
    }

    return respond(buildSnapshotChecks(snapshots), leafletSnapshot?.leaflets ?? [], newestCheckedAt, true)
  }

  // Live path: explicit "Check now", or a cold store with nothing to serve.
  const [settled, leaflets] = await Promise.all([
    refreshAllSources(env, snapshots),
    refreshAllLeaflets(env, leafletSnapshot?.leaflets),
  ])
  return respond(settled, leaflets, new Date().toISOString(), false)
}

// Fetches current specials leaflets for the big grocers that publish
// catalogues rather than per-product API rows, and snapshots them.
async function refreshAllLeaflets(
  env: TrolleyScoutEnv,
  priorLeaflets?: StoreLeaflet[],
): Promise<StoreLeaflet[]> {
  const checkedAt = new Date().toISOString()
  const settled = await Promise.all(leafletTargets.map((target) => fetchLeaflets(target, checkedAt)))
  const leaflets = settled.flat()

  if (leaflets.length === 0) {
    return priorLeaflets ?? []
  }

  await saveLeafletSnapshot(env, leaflets, checkedAt)
  return leaflets
}

async function fetchLeaflets(target: LeafletTarget, checkedAt: string): Promise<StoreLeaflet[]> {
  try {
    if (target.kind === 'sixty60-api' && target.apiBase && target.storeId) {
      const response = await fetch(buildLeafletApiUrl(target.apiBase), {
        body: JSON.stringify({ posSiteCode: target.storeId }),
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          referer: `${target.apiBase}/`,
          'user-agent': BROWSER_USER_AGENT,
        },
        method: 'POST',
      })

      if (!response.ok) {
        return []
      }

      return extractSixtyLeaflets(target, await response.json(), checkedAt)
    }

    if ((target.kind === 'html-list' || target.kind === 'html-pdf') && target.pageUrl) {
      const response = await fetch(target.pageUrl, {
        headers: {
          accept: 'text/html',
          'user-agent': BROWSER_USER_AGENT,
        },
      })

      if (!response.ok) {
        return []
      }

      const html = await response.text()
      return target.kind === 'html-pdf'
        ? extractPdfLeaflets(target, html, checkedAt)
        : extractBoxerLeaflets(target, html, checkedAt)
    }
  } catch {
    // A single retailer's leaflet fetch failing must not sink the board.
  }

  return []
}

// Runs every source, saves fresh rows to D1, and returns the merged results
// (live rows where available, last snapshot where a source failed).
async function refreshAllSources(
  env: TrolleyScoutEnv,
  priorSnapshotsInput?: Map<string, DealSnapshot>,
): Promise<SourceCheck[]> {
  const targets = getDiscoveryTargets()
  const priorSnapshots = priorSnapshotsInput ?? (await readDealSnapshots(env))
  const settled = await Promise.all(targets.map((target) => checkSource(target)))

  const freshEntries: Array<{
    retailerId: string
    sourceLabel: string
    checkedAt: string
    deals: DiscoveredDeal[]
  }> = []

  for (const result of settled) {
    if (result.deals.length > 0) {
      freshEntries.push({
        checkedAt: result.source.checkedAt,
        deals: result.deals,
        retailerId: result.source.retailerId,
        sourceLabel: result.source.sourceLabel,
      })
      continue
    }

    const snapshot = priorSnapshots.get(snapshotKey(result.source.retailerId, result.source.sourceLabel))

    if (snapshot) {
      result.deals = snapshot.deals
      result.source = {
        ...result.source,
        itemCount: snapshot.deals.length,
        status: 'found',
        statusText: `Live check had no rows. Showing rows captured ${snapshot.checkedAt.slice(0, 10)}.`,
      }
    }
  }

  await saveDealSnapshots(env, freshEntries)
  return settled
}

function respond(
  settled: SourceCheck[],
  leaflets: StoreLeaflet[],
  refreshedAt: string | undefined,
  fromCache: boolean,
) {
  const deals = dedupeByProductUrl(settled.flatMap((result) => result.deals))
  const sources = settled.map((result) => result.source)

  return json(
    {
      deals,
      leaflets,
      refreshedAt,
      served: fromCache ? 'snapshot' : 'live',
      sources,
      summary: {
        checkedSourceCount: sources.length,
        dataPolicy,
        foundDealCount: deals.length,
        leafletCount: leaflets.length,
        unavailableSourceCount: sources.filter((source) => source.status === 'unavailable').length,
      },
    },
    {
      headers: privateHeaders,
    },
  )
}

function newestSnapshotTime(snapshots: Map<string, DealSnapshot>): string | undefined {
  let newest: string | undefined

  for (const snapshot of snapshots.values()) {
    if (!newest || snapshot.checkedAt > newest) {
      newest = snapshot.checkedAt
    }
  }

  return newest
}

// Reconstructs the discovery board from stored snapshots alone — one "found"
// source row per snapshotted feed, plus a "pending" row for feeds not yet
// captured, so the instant response matches the live response shape.
function buildSnapshotChecks(snapshots: Map<string, DealSnapshot>): SourceCheck[] {
  return getDiscoveryTargets().map((target) => {
    const snapshot = snapshots.get(snapshotKey(target.retailer.id, target.source.label))
    const base = {
      retailerId: target.retailer.id,
      retailerName: target.retailer.name,
      sourceLabel: target.source.label,
      sourceUrl: target.source.url,
    }

    if (!snapshot) {
      return {
        deals: [],
        source: {
          ...base,
          checkedAt: new Date(0).toISOString(),
          itemCount: 0,
          status: 'checked_no_static_rows',
          statusText: 'Not captured yet. Check now to fetch this source.',
        },
      }
    }

    return {
      deals: snapshot.deals,
      source: {
        ...base,
        checkedAt: snapshot.checkedAt,
        itemCount: snapshot.deals.length,
        status: 'found',
        statusText: `Captured ${snapshot.checkedAt.slice(0, 10)}.`,
      },
    }
  })
}

// Overlapping feeds (e.g. Clicks all-promotions vs a category feed) can
// surface the same product; keep the first row for each product URL.
function dedupeByProductUrl(deals: DiscoveredDeal[]): DiscoveredDeal[] {
  const seen = new Set<string>()

  return deals.filter((deal) => {
    if (seen.has(deal.productUrl)) {
      return false
    }

    seen.add(deal.productUrl)
    return true
  })
}

// Retry transient failures (5xx, 429, network errors) with exponential
// backoff before giving up. Adapted from the resilient-scrape pattern:
// most "the source is down" blips are a single bad response.
const MAX_ATTEMPTS = 3

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response | undefined> {
  let backoffMs = 300

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, init)

      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
        // A 2xx or a definitive client error (401/404) will not change on retry.
        return response
      }
    } catch {
      // Network error — fall through to the backoff and try again.
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs)
      backoffMs *= 2
    }
  }

  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkSource(target: ResolvedDiscoveryTarget): Promise<{
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}> {
  if (target.parserId === 'takealot-deals') {
    return checkJsonSource(target, buildTakealotDealsApiUrl(target.source.url), extractTakealotProductDeals)
  }

  if (target.parserId === 'clicks-promotions') {
    return checkJsonSource(target, buildClicksPromotionsApiUrl(target.source.url), extractClicksPromotionDeals)
  }

  if (target.parserId === 'pnp-promotions') {
    // The PnP OCC search route only answers POST.
    return checkJsonSource(target, buildPnpPromotionsApiUrl(), extractPnpPromotionDeals, 'POST')
  }

  const checkedAt = new Date().toISOString()

  try {
    const response = await fetchWithRetry(target.source.url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'TrolleyScoutSourceCheck/1.0',
      },
    })

    if (!response || !response.ok) {
      return {
        deals: [],
        source: buildSourceResult(target, checkedAt, 0, {
          httpStatus: response?.status,
          unavailable: true,
        }),
      }
    }

    const html = await response.text()
    const deals = extractDealsFromHtml(target, html, checkedAt)

    return {
      deals,
      source: buildSourceResult(target, checkedAt, deals.length, {
        httpStatus: response.status,
        parserId: target.parserId,
      }),
    }
  } catch {
    return {
      deals: [],
      source: buildSourceResult(target, checkedAt, 0, {
        unavailable: true,
      }),
    }
  }
}

async function checkJsonSource(
  target: ResolvedDiscoveryTarget,
  apiUrl: string,
  extract: (target: ResolvedDiscoveryTarget, payload: unknown, capturedAt: string) => DiscoveredDeal[],
  method: 'GET' | 'POST' = 'GET',
): Promise<{
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}> {
  const checkedAt = new Date().toISOString()

  try {
    const response = await fetchWithRetry(apiUrl, {
      headers: {
        accept: 'application/json',
        referer: target.source.url,
        'user-agent': 'TrolleyScoutSourceCheck/1.0',
      },
      method,
    })

    if (!response || !response.ok) {
      return {
        deals: [],
        source: buildSourceResult(target, checkedAt, 0, {
          httpStatus: response?.status,
          unavailable: true,
        }),
      }
    }

    const payload = (await response.json()) as unknown
    const deals = extract(target, payload, checkedAt)

    return {
      deals,
      source: buildSourceResult(target, checkedAt, deals.length, {
        httpStatus: response.status,
        parserId: target.parserId,
      }),
    }
  } catch {
    return {
      deals: [],
      source: buildSourceResult(target, checkedAt, 0, {
        unavailable: true,
      }),
    }
  }
}
