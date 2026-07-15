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
import type { DiscoveredDeal, DiscoverySourceResult } from '../../src/types'
import {
  readDealSnapshots,
  saveDealSnapshots,
  snapshotKey,
} from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const targets = getDiscoveryTargets()
  const [settled, snapshots] = await Promise.all([
    Promise.all(targets.map((target) => checkSource(target))),
    readDealSnapshots(env),
  ])

  // Live rows refresh the per-source snapshots; sources that failed or came
  // back empty fall back to their last snapshot so the board never goes dark
  // because one retailer had a bad morning.
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

    const snapshot = snapshots.get(snapshotKey(result.source.retailerId, result.source.sourceLabel))

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

  waitUntil(saveDealSnapshots(env, freshEntries))

  const deals = dedupeByProductUrl(settled.flatMap((result) => result.deals))
  const sources = settled.map((result) => result.source)

  return json(
    {
      deals,
      sources,
      summary: {
        checkedSourceCount: sources.length,
        dataPolicy,
        foundDealCount: deals.length,
        unavailableSourceCount: sources.filter((source) => source.status === 'unavailable').length,
      },
    },
    {
      headers: privateHeaders,
    },
  )
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
