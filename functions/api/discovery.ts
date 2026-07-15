import { dataPolicy } from '../../src/api/staticData'
import {
  buildClicksPromotionsApiUrl,
  buildTakealotDealsApiUrl,
  buildSourceResult,
  extractClicksPromotionDeals,
  extractDealsFromHtml,
  extractTakealotProductDeals,
  getDiscoveryTargets,
  type ResolvedDiscoveryTarget,
} from '../../src/services/dealDiscovery'
import type { DiscoveredDeal, DiscoverySourceResult } from '../../src/types'
import { json, methodNotAllowed } from '../_shared/respond'

const privateHeaders = {
  'cache-control': 'private, no-store',
}

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const targets = getDiscoveryTargets()
  const settled = await Promise.all(targets.map((target) => checkSource(target)))
  const deals = settled.flatMap((result) => result.deals)
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

async function checkSource(target: ResolvedDiscoveryTarget): Promise<{
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}> {
  if (target.parserId === 'takealot-deals') {
    return checkJsonSource(target, buildTakealotDealsApiUrl(target.source.url), extractTakealotProductDeals)
  }

  if (target.parserId === 'clicks-promotions') {
    return checkJsonSource(target, buildClicksPromotionsApiUrl(), extractClicksPromotionDeals)
  }

  const checkedAt = new Date().toISOString()

  try {
    const response = await fetch(target.source.url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'TrolleyScoutSourceCheck/1.0',
      },
    })

    if (!response.ok) {
      return {
        deals: [],
        source: buildSourceResult(target, checkedAt, 0, {
          httpStatus: response.status,
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
): Promise<{
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}> {
  const checkedAt = new Date().toISOString()

  try {
    const response = await fetch(apiUrl, {
      headers: {
        accept: 'application/json',
        referer: target.source.url,
        'user-agent': 'TrolleyScoutSourceCheck/1.0',
      },
    })

    if (!response.ok) {
      return {
        deals: [],
        source: buildSourceResult(target, checkedAt, 0, {
          httpStatus: response.status,
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
