import { dataPolicy } from '../../src/api/staticData'
import { retailerById } from '../../src/data/retailers'
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
  extractFlippingBookViewerUrl,
  extractPnpCmsLeaflets,
  extractViewerCoverImage,
  extractPdfLeaflets,
  extractSixtyLeaflets,
  leafletTargets,
  type LeafletTarget,
} from '../../src/services/leafletDiscovery'
import { extractRetailerLeafletsFromHtml } from '../../src/services/scoutSources'
import type {
  DiscoveredDeal,
  DiscoveryRun,
  DiscoverySourceResult,
  RetailerId,
  StoreLeaflet,
} from '../../src/types'
import {
  listActiveDealItems,
  type StoredDealItem,
} from '../_shared/dealItemStore'
import { runDealRefreshWithAlerts } from '../_shared/dealAlertStore'
import {
  type DealSnapshot,
  readDealSnapshots,
  readLeafletSnapshot,
  saveDealSnapshots,
  saveLeafletSnapshot,
  snapshotKey,
} from '../_shared/dealSnapshotStore'
import type { TrolleyScoutEnv } from '../_shared/env'
import { getStructuredRetailerSources } from '../_shared/retailerFeedScout'
import {
  buildFlippingBookPages,
  flippingBookPagerUrl,
  parseFlippingBookPager,
} from '../_shared/catalogueScout'
import { readAllStorePromotions, type StorePromotion } from '../_shared/locationStore'
import { rankDealsForMember, type DealInterestWeight } from '../_shared/dealLearning'
import {
  getDealLearningState,
  listMemberInterestWeights,
} from '../_shared/dealLearningStore'
import { getMemberSession } from '../_shared/memberStore'
import { json, methodNotAllowed } from '../_shared/respond'

// Public, cookieless data — allow any origin so the mobile app can read it.
const privateHeaders = {
  'access-control-allow-origin': '*',
  'cache-control': 'private, no-store',
}

// The Shoprite-Group leaflet endpoints and pages reject non-browser
// user-agents with a 403, so reading their free public catalogues needs one.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface SourceCheck {
  deals: DiscoveredDeal[]
  source: DiscoverySourceResult
}

const NORMALIZED_PAGE_SIZE = 200
const NORMALIZED_SAFETY_CAP = 5_000
const PAGER_MANIFEST_MAX_BYTES = 512 * 1024
const PAGER_MANIFEST_TIMEOUT_MS = 8_000
const PAGER_ENRICH_CONCURRENCY = 2
const PAGER_PUBLIC_PAGE_LIMIT = 250
const PNP_VIEWER_MAX_BYTES = 256 * 1024
const PNP_VIEWER_TIMEOUT_MS = 8_000
const PNP_VIEWER_CONCURRENCY = 3

export interface NormalizedDealReadOptions {
  listItems?: typeof listActiveDealItems
  pageSize?: number
  safetyCap?: number
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const forceLive = new URL(request.url).searchParams.get('refresh') === '1'
  const summaryOnly = new URL(request.url).searchParams.get('summary') === '1'
  const session = await getMemberSession(env, request)
  if (forceLive && session.account?.role !== 'admin') {
    return json(
      { message: 'Admin access is required.' },
      { headers: privateHeaders, status: 403 },
    )
  }

  const nowIso = new Date().toISOString()

  // Try to load cached summary immediately if possible to avoid heavy D1 reads/dedupes
  if (!forceLive && summaryOnly) {
    try {
      const summaryRow = await env.DB.prepare(
        "SELECT checked_at, deals_json FROM deal_snapshots WHERE source_key = '__summary__'",
      ).first<{ checked_at: string; deals_json: string }>()

      if (summaryRow) {
        const parsed = JSON.parse(summaryRow.deals_json) as { foundDealCount?: number; leafletCount?: number }
        return json(
          {
            deals: [],
            leaflets: [],
            summary: {
              foundDealCount: parsed.foundDealCount ?? 0,
              leafletCount: parsed.leafletCount ?? 0,
              refreshedAt: summaryRow.checked_at,
            },
          },
          {
            headers: {
              'access-control-allow-origin': '*',
              'cache-control': 'public, max-age=10800',
            },
          },
        )
      }
    } catch {
      // Fallback to normal execution on DB errors
    }
  }

  const [snapshots, leafletSnapshot, storePromotions, normalizedItems] = await Promise.all([
    readDealSnapshots(env),
    readLeafletSnapshot(env),
    readAllStorePromotions(env, nowIso),
    readNormalizedDealItems(env, nowIso),
  ])
  const interests = await getRequestInterests(env, session.account?.id)
  const storeDiscovery = storePromotionsToDiscovery(storePromotions, nowIso)
  const normalizedChecks = buildNormalizedDiscoveryChecks(normalizedItems)

  // Normal requests read stored rows only, including a cold or empty cache.
  // Scheduled and administrator runs are the only upstream refresh owners.
  if (!forceLive) {
    const newestCheckedAt = newestDiscoveryCacheTime(normalizedItems, snapshots)
    const mergedChecks = mergeNormalizedFirstChecks(normalizedChecks, buildSnapshotChecks(snapshots))
    const leaflets = leafletSnapshot?.leaflets ?? []

    const response = respond(
      mergedChecks,
      leaflets,
      newestCheckedAt,
      true,
      interests,
      storeDiscovery,
      summaryOnly,
    )

    // Compute summary and write back in background so subsequent summaryOnly hits get served instantly
    const allDeals = dedupeDiscoveryDeals([
      ...mergedChecks.flatMap((result) => result.deals),
      ...storeDiscovery.deals,
    ])

    await env.DB.prepare(
      `INSERT INTO deal_snapshots (source_key, retailer_id, source_label, checked_at, deals_json, updated_at)
       VALUES ('__summary__', 'system', 'Discovery Summary', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(source_key) DO UPDATE SET
         checked_at = excluded.checked_at,
         deals_json = excluded.deals_json,
         updated_at = excluded.updated_at`,
    )
      .bind(
        newestCheckedAt || nowIso,
        JSON.stringify({ foundDealCount: allDeals.length, leafletCount: leaflets.length }),
      )
      .run()
      .catch(() => undefined)

    return response
  }

  // Live path: an explicit administrator source check.
  const { value: [settled, leaflets] } = await runDealRefreshWithAlerts(
    env,
    () => Promise.all([
      refreshAllSources(env, snapshots),
      refreshLeafletCache(env, leafletSnapshot?.leaflets),
    ]),
  )
  const mergedChecks = mergeNormalizedFirstChecks(normalizedChecks, settled)

  const response = respond(
    mergedChecks,
    leaflets,
    new Date().toISOString(),
    false,
    interests,
    storeDiscovery,
    summaryOnly,
  )

  // Update summary table for live updates
  const allDeals = dedupeDiscoveryDeals([
    ...mergedChecks.flatMap((result) => result.deals),
    ...storeDiscovery.deals,
  ])

  await env.DB.prepare(
    `INSERT INTO deal_snapshots (source_key, retailer_id, source_label, checked_at, deals_json, updated_at)
     VALUES ('__summary__', 'system', 'Discovery Summary', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(source_key) DO UPDATE SET
       checked_at = excluded.checked_at,
       deals_json = excluded.deals_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      nowIso,
      JSON.stringify({ foundDealCount: allDeals.length, leafletCount: leaflets.length }),
    )
    .run()
    .catch(() => undefined)

  return response
}

// Internal scheduled-worker entry point. It bypasses request authorization
// because it is only called from the Worker bundle.
export interface DiscoveryRefreshOptions {
  refreshDeals?: boolean
}

export async function refreshDiscoveryCache(
  env: TrolleyScoutEnv,
  options: DiscoveryRefreshOptions = {},
): Promise<DiscoveryRun> {
  const nowIso = new Date().toISOString()
  const [snapshots, leafletSnapshot, storePromotions, normalizedItems] = await Promise.all([
    readDealSnapshots(env),
    readLeafletSnapshot(env),
    readAllStorePromotions(env, nowIso),
    readNormalizedDealItems(env, nowIso),
  ])
  const [settled, leaflets] = await Promise.all([
    options.refreshDeals === false
      ? Promise.resolve(buildSnapshotChecks(snapshots))
      : refreshAllSources(env, snapshots),
    refreshLeafletCache(env, leafletSnapshot?.leaflets),
  ])

  return buildDiscoveryRun(
    mergeNormalizedFirstChecks(buildNormalizedDiscoveryChecks(normalizedItems), settled),
    leaflets,
    new Date().toISOString(),
    false,
    [],
    storePromotionsToDiscovery(storePromotions, nowIso),
  )
}

export async function readNormalizedDealItems(
  env: TrolleyScoutEnv,
  now: string,
  options: NormalizedDealReadOptions = {},
): Promise<StoredDealItem[]> {
  const listItems = options.listItems ?? listActiveDealItems
  const pageSize = boundedWholeNumber(
    options.pageSize ?? NORMALIZED_PAGE_SIZE,
    'pageSize',
    1,
    NORMALIZED_PAGE_SIZE,
  )
  const safetyCap = boundedWholeNumber(
    options.safetyCap ?? NORMALIZED_SAFETY_CAP,
    'safetyCap',
    1,
    NORMALIZED_SAFETY_CAP,
  )
  const items: StoredDealItem[] = []

  try {
    while (items.length < safetyCap) {
      const limit = Math.min(pageSize, safetyCap - items.length)
      const page = await listItems(env, { limit, now, offset: items.length })
      items.push(...page)

      if (page.length < limit) {
        break
      }
    }
  } catch {
    // Missing migration or a transient D1 read leaves legacy snapshots usable.
  }

  return items
}

export function buildNormalizedDiscoveryChecks(items: StoredDealItem[]): SourceCheck[] {
  const selectedItems = selectGlobalScopedItems(items)
  const sourcesByKey = new Map(getStructuredRetailerSources().map((source) => [source.key, source]))
  const groups = new Map<string, StoredDealItem[]>()

  for (const item of selectedItems) {
    const group = groups.get(item.sourceKey) ?? []
    group.push(item)
    groups.set(item.sourceKey, group)
  }

  return Array.from(groups.entries()).map(([sourceKey, sourceItems]) => {
    const first = sourceItems[0]
    const registrySource = sourcesByKey.get(sourceKey)
    const retailer = retailerById.get(first.retailerId as RetailerId)
    const retailerName = registrySource?.retailerName ?? retailer?.name ?? readableSlug(first.retailerId)
    const sourceLabel = registrySource?.sourceLabel ?? readableSourceKey(sourceKey)
    const checkedAt = sourceItems.reduce(
      (newest, item) => item.lastSeenAt > newest ? item.lastSeenAt : newest,
      sourceItems[0].lastSeenAt,
    )
    const deals = sourceItems.map((item) => storedItemToDiscovery(
      item,
      retailerName,
      sourceLabel,
    ))

    return {
      deals,
      source: {
        checkedAt,
        itemCount: deals.length,
        retailerId: first.retailerId,
        retailerName,
        sourceLabel,
        sourceUrl: registrySource?.sourceUrl ?? first.sourceUrl,
        status: 'found',
        statusText: `Stored ${deals.length} current structured item${deals.length === 1 ? '' : 's'}.`,
      },
    }
  })
}

export function mergeNormalizedFirstChecks(
  normalized: SourceCheck[],
  legacy: SourceCheck[],
): SourceCheck[] {
  if (normalized.length === 0) {
    return legacy
  }

  const seen = new Set<string>()
  const merged: SourceCheck[] = []

  for (const check of [...normalized, ...legacy]) {
    const deals = check.deals.filter((deal) => {
      const keys = discoveryDealKeys(deal)
      if (keys.some((key) => seen.has(key))) {
        return false
      }
      keys.forEach((key) => seen.add(key))
      return true
    })

    merged.push({
      deals,
      source: {
        ...check.source,
        itemCount: deals.length,
      },
    })
  }

  return merged
}

// Fetches current specials leaflets for the big grocers that publish
// catalogues rather than per-product API rows, and snapshots them.
export interface LeafletRefreshOptions {
  fetcher?: typeof fetch
  saveSnapshot?: typeof saveLeafletSnapshot
  targets?: readonly LeafletTarget[]
}

interface LeafletFetchResult {
  leaflets: StoreLeaflet[]
  succeeded: boolean
  target: LeafletTarget
}

export async function refreshLeafletCache(
  env: TrolleyScoutEnv,
  priorLeaflets?: StoreLeaflet[],
  options: LeafletRefreshOptions = {},
): Promise<StoreLeaflet[]> {
  const checkedAt = new Date().toISOString()
  const fetcher = options.fetcher ?? fetch
  const targets = options.targets ?? leafletTargets
  const settled = await Promise.all(
    targets.map((target) => fetchLeaflets(target, checkedAt, fetcher)),
  )
  const freshLeaflets = await enrichInteractiveLeaflets(
    settled.flatMap((result) => result.succeeded ? result.leaflets : []),
    { fetcher },
  )
  const failedRetailers = new Set<string>(
    settled
      .filter((result) => !result.succeeded)
      .map((result) => result.target.retailerId),
  )
  const targetedRetailers = new Set<string>(
    targets.map((target) => target.retailerId),
  )
  const retainedLeaflets = (priorLeaflets ?? []).filter((leaflet) =>
    failedRetailers.has(leaflet.retailerId) ||
    !targetedRetailers.has(leaflet.retailerId),
  )
  const leaflets = dedupeLeaflets([...freshLeaflets, ...retainedLeaflets])
  const anyTargetSucceeded = settled.some((result) => result.succeeded)

  if (!anyTargetSucceeded || leaflets.length === 0) {
    return priorLeaflets ?? []
  }

  await (options.saveSnapshot ?? saveLeafletSnapshot)(env, leaflets, checkedAt)
  return leaflets
}

export async function enrichInteractiveLeaflets(
  leaflets: StoreLeaflet[],
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<StoreLeaflet[]> {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? PAGER_MANIFEST_TIMEOUT_MS),
    PAGER_MANIFEST_TIMEOUT_MS,
  )
  const enriched = [...leaflets]
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < leaflets.length) {
      const index = nextIndex
      nextIndex += 1
      const leaflet = leaflets[index]
      const pagerUrl = flippingBookPagerUrl(leaflet)
      if (!pagerUrl) {
        continue
      }

      try {
        const response = await fetchWithTimeout(fetcher, pagerUrl, {
          headers: {
            accept: 'application/json,text/javascript',
            'user-agent': BROWSER_USER_AGENT,
          },
        }, timeoutMs)
        if (!response.ok) {
          continue
        }
        const pager = parseFlippingBookPager(await readBoundedText(
          response,
          PAGER_MANIFEST_MAX_BYTES,
        ))
        const pages = buildFlippingBookPages(leaflet, pager, PAGER_PUBLIC_PAGE_LIMIT)
        if (pages.length > 0) {
          enriched[index] = { ...leaflet, pages }
        }
      } catch {
        // Keep the cover and source link when a retailer manifest is unavailable.
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(PAGER_ENRICH_CONCURRENCY, leaflets.length) },
    worker,
  ))
  return enriched
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetcher(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchBoundedTextWithTimeout(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  maxBytes: number,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(input, { ...init, signal: controller.signal })
    return {
      response,
      text: response.ok ? await readBoundedText(response, maxBytes) : '',
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedText(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RangeError('Pager manifest exceeded the response limit')
  }
  if (!response.body) {
    return ''
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let value = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    bytes += chunk.value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel()
      throw new RangeError('Pager manifest exceeded the response limit')
    }
    value += decoder.decode(chunk.value, { stream: true })
  }
  return value + decoder.decode()
}

async function fetchLeaflets(
  target: LeafletTarget,
  checkedAt: string,
  fetcher: typeof fetch,
): Promise<LeafletFetchResult> {
  const success = (leaflets: StoreLeaflet[]): LeafletFetchResult => ({
    leaflets,
    succeeded: true,
    target,
  })
  const failure = (): LeafletFetchResult => ({
    leaflets: [],
    succeeded: false,
    target,
  })

  try {
    if (target.kind === 'pnp-cms' && target.pageUrl) {
      const response = await fetchWithTimeout(fetcher, target.pageUrl, {
        headers: {
          accept: 'application/json',
          referer: 'https://www.pnp.co.za/catalogues',
          'user-agent': BROWSER_USER_AGENT,
        },
      }, PNP_VIEWER_TIMEOUT_MS)

      if (!response.ok) {
        return failure()
      }

      return success(await resolvePnpHflipDocuments(
        extractPnpCmsLeaflets(target, await response.json(), checkedAt),
        { fetcher },
      ))
    }

    if (target.kind === 'sixty60-api' && target.apiBase && target.storeId) {
      const response = await fetcher(buildLeafletApiUrl(target.apiBase), {
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
        return failure()
      }

      return success(extractSixtyLeaflets(target, await response.json(), checkedAt))
    }

    if ((target.kind === 'html-list' || target.kind === 'html-pdf') && target.pageUrl) {
      const response = await fetcher(target.pageUrl, {
        headers: {
          accept: 'text/html',
          'user-agent': BROWSER_USER_AGENT,
        },
      })

      if (!response.ok) {
        return failure()
      }

      const html = await response.text()

      if (target.kind === 'html-pdf') {
        return success(extractPdfLeaflets(target, html, checkedAt))
      }

      return success(await resolveEmbeddedViewers(
        extractBoxerLeaflets(target, html, checkedAt),
        fetcher,
      ))
    }

    if (target.kind === 'sitebuilder-pdf' && target.pageUrls) {
      return success(await fetchSitebuilderLeaflets(
        target,
        target.pageUrls,
        checkedAt,
        fetcher,
      ))
    }
  } catch {
    // A single retailer's leaflet fetch failing must not sink the board.
  }

  return failure()
}

export async function resolvePnpHflipDocuments(
  leaflets: StoreLeaflet[],
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {},
): Promise<StoreLeaflet[]> {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = Math.min(
    Math.max(1, options.timeoutMs ?? PNP_VIEWER_TIMEOUT_MS),
    PNP_VIEWER_TIMEOUT_MS,
  )
  const resolved = [...leaflets]
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < leaflets.length) {
      const index = nextIndex
      nextIndex += 1
      const leaflet = leaflets[index]
      if (
        leaflet.documentUrl ||
        leaflet.retailerId !== 'pick-n-pay' ||
        !isTrustedPnpViewerUrl(leaflet.url)
      ) {
        continue
      }

      try {
        const { response, text } = await fetchBoundedTextWithTimeout(fetcher, leaflet.url, {
          headers: {
            accept: 'text/html',
            referer: 'https://www.pnp.co.za/catalogues',
            'user-agent': BROWSER_USER_AGENT,
          },
        }, timeoutMs, PNP_VIEWER_MAX_BYTES)
        if (!response.ok) {
          continue
        }
        const documentUrl = trustedHeyzinePdfUrl(text)
        if (documentUrl) {
          resolved[index] = { ...leaflet, documentUrl }
        }
      } catch {
        // Keep the official cover and HFlip source when its PDF cannot be resolved.
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(PNP_VIEWER_CONCURRENCY, leaflets.length) },
    worker,
  ))
  return resolved
}

function isTrustedPnpViewerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'pnpcatalogues.hflip.co' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/[a-z0-9]{6,64}\.html$/i.test(url.pathname)
    )
  } catch {
    return false
  }
}

function trustedHeyzinePdfUrl(html: string): string | undefined {
  const candidates = html.match(/https?:\/\/[^"'<>\\\s]+/gi) ?? []
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/&amp;/gi, '&'))
      if (
        url.protocol === 'https:' &&
        url.hostname === 'cdn.heyzine.com' &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        /^\/flip-book\/pdf\/[a-f0-9]{32,128}\.pdf$/i.test(url.pathname)
      ) {
        return url.toString()
      }
    } catch {
      // Ignore malformed candidate URLs and keep looking.
    }
  }
  return undefined
}

// A leaflet whose link is an HTML promotion page cannot be read or scanned.
// Follow each one and, when it embeds a hosted FlippingBook viewer, point the
// leaflet at the viewer's index.html so its pages can be built and scanned.
async function resolveEmbeddedViewers(
  leaflets: StoreLeaflet[],
  fetcher: typeof fetch = fetch,
): Promise<StoreLeaflet[]> {
  return await Promise.all(
    leaflets.map(async (leaflet) => {
      if (leaflet.documentUrl || leaflet.url.toLowerCase().endsWith('/index.html')) {
        return leaflet
      }

      try {
        const response = await fetcher(leaflet.url, {
          headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
        })

        if (!response.ok) {
          return leaflet
        }

        const viewerUrl = extractFlippingBookViewerUrl(await response.text())

        if (!viewerUrl) {
          return leaflet
        }

        // Its pages are signed and unreadable, so carry the public cover.
        const cover = leaflet.imageUrl ?? (await fetchViewerCover(viewerUrl, fetcher))
        return { ...leaflet, imageUrl: cover, url: viewerUrl }
      } catch {
        return leaflet
      }
    }),
  )
}

async function fetchViewerCover(
  viewerUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await fetcher(viewerUrl, {
      headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
    })

    return response.ok ? extractViewerCoverImage(await response.text()) : undefined
  } catch {
    return undefined
  }
}

// Sitebuilder chains link their weekly leaflet PDF from the nav of the home
// page and repeat or extend it per branch page. Fetch every page, reuse the
// store-scout PDF extractor, and dedupe by document so a leaflet shared across
// branches is listed once.
async function fetchSitebuilderLeaflets(
  target: LeafletTarget,
  pageUrls: string[],
  checkedAt: string,
  fetcher: typeof fetch = fetch,
): Promise<StoreLeaflet[]> {
  const pages = await Promise.all(
    pageUrls.map(async (pageUrl) => {
      try {
        const response = await fetcher(pageUrl, {
          headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
        })

        if (!response.ok) {
          return { leaflets: [] as StoreLeaflet[], succeeded: false }
        }

        return {
          leaflets: extractRetailerLeafletsFromHtml(
            {
              retailerId: target.retailerId,
              retailerName: target.retailerName,
              sourceUrl: pageUrl,
              trustAllPdfs: true,
            },
            await response.text(),
            checkedAt,
          ),
          succeeded: true,
        }
      } catch {
        return { leaflets: [] as StoreLeaflet[], succeeded: false }
      }
    }),
  )

  if (!pages.some((page) => page.succeeded)) {
    throw new Error(`Every ${target.retailerName} catalogue page failed.`)
  }

  const seen = new Set<string>()
  return pages.flatMap((page) => page.leaflets).filter((leaflet) => {
    const key = leaflet.documentUrl ?? leaflet.url
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
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
  return [
    ...settled,
    ...buildDynamicSnapshotChecks(priorSnapshots, knownSourceKeys(targets)),
  ]
}

function respond(
  settled: SourceCheck[],
  leaflets: StoreLeaflet[],
  refreshedAt: string | undefined,
  fromCache: boolean,
  interests: DealInterestWeight[],
  storeDiscovery: ReturnType<typeof storePromotionsToDiscovery>,
  summaryOnly?: boolean,
) {
  const headers = summaryOnly
    ? {
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=10800',
      }
    : privateHeaders

  return json(
    buildDiscoveryRun(
      settled,
      leaflets,
      refreshedAt,
      fromCache,
      interests,
      storeDiscovery,
      summaryOnly,
    ),
    { headers },
  )
}

function buildDiscoveryRun(
  settled: SourceCheck[],
  leaflets: StoreLeaflet[],
  refreshedAt: string | undefined,
  fromCache: boolean,
  interests: DealInterestWeight[],
  storeDiscovery: ReturnType<typeof storePromotionsToDiscovery>,
  summaryOnly?: boolean,
): DiscoveryRun {
  const allDeals = dedupeDiscoveryDeals([
    ...settled.flatMap((result) => result.deals),
    ...storeDiscovery.deals,
  ])
  const deals = summaryOnly ? [] : rankDealsForMember(
    allDeals,
    interests,
  )
  const sources = [...settled.map((result) => result.source), ...storeDiscovery.sources]
  const mergedLeaflets = dedupeLeaflets([...leaflets, ...storeDiscovery.leaflets])

  return {
    deals,
    leaflets: summaryOnly ? [] : mergedLeaflets,
    refreshedAt,
    served: fromCache ? 'snapshot' : 'live',
    sources,
    summary: {
      checkedSourceCount: sources.length,
      dataPolicy,
      foundDealCount: allDeals.length,
      leafletCount: mergedLeaflets.length,
      unavailableSourceCount: sources.filter((source) => source.status === 'unavailable').length,
    },
  }
}

export function storePromotionsToDiscovery(
  promotions: StorePromotion[],
  capturedAt: string,
): { deals: DiscoveredDeal[]; leaflets: StoreLeaflet[]; sources: DiscoverySourceResult[] } {
  const deals: DiscoveredDeal[] = []
  const leaflets: StoreLeaflet[] = []
  const byStore = new Map<string, { name: string; sourceUrl: string; count: number }>()

  for (const promotion of promotions) {
    const promotionCapturedAt = promotion.capturedAt ?? capturedAt
    const retailerId = (promotion.retailerId ?? `store-${promotion.placeId}`) as DiscoveredDeal['retailerId']
    const source = byStore.get(promotion.placeId) ?? {
      count: 0,
      name: promotion.storeName,
      sourceUrl: promotion.sourceUrl,
    }
    source.count += 1
    byStore.set(promotion.placeId, source)

    if (promotion.kind === 'catalogue') {
      leaflets.push({
        capturedAt: promotionCapturedAt,
        documentUrl: promotion.productUrl ?? promotion.sourceUrl,
        id: promotion.id,
        imageUrl: promotion.imageUrl,
        name: promotion.title,
        priceScope: { type: 'store', storeIds: [promotion.placeId] },
        retailerId,
        retailerName: promotion.storeName,
        url: promotion.sourceUrl,
        validFrom: promotion.validFrom,
        validTo: promotion.validTo,
      })
      continue
    }

    deals.push({
      capturedAt: promotionCapturedAt,
      evidenceText: [promotion.title, promotion.priceText, promotion.savingText]
        .filter(Boolean)
        .join(' '),
      id: promotion.id,
      imageUrl: promotion.imageUrl,
      priceScope: { type: 'store', storeIds: [promotion.placeId] },
      previousPriceText: promotion.previousPriceText,
      priceText: promotion.priceText,
      productUrl: promotion.productUrl ?? promotion.sourceUrl,
      retailerId,
      retailerName: promotion.storeName,
      savingText: promotion.savingText,
      sourceLabel: 'Store scout',
      sourceUrl: promotion.sourceUrl,
      title: promotion.title,
    })
  }

  const sources: DiscoverySourceResult[] = Array.from(byStore.entries()).map(([placeId, source]) => ({
    checkedAt: capturedAt,
    itemCount: source.count,
    retailerId: (`store-${placeId}`) as DiscoverySourceResult['retailerId'],
    retailerName: source.name,
    sourceLabel: 'Store scout',
    sourceUrl: source.sourceUrl,
    status: 'found',
    statusText: `Found ${source.count} current store item${source.count === 1 ? '' : 's'}.`,
  }))

  return { deals, leaflets, sources }
}

export function dedupeLeaflets(leaflets: StoreLeaflet[]): StoreLeaflet[] {
  const hasOfficialPnpViewer = leaflets.some((leaflet) =>
    leaflet.retailerId === 'pick-n-pay' && isTrustedPnpViewerUrl(leaflet.url))
  const seen = new Set<string>()
  return leaflets.filter((leaflet) => {
    if (hasOfficialPnpViewer && isGenericPnpCatalogue(leaflet)) {
      return false
    }
    const key = leaflet.documentUrl ?? leaflet.url
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function isGenericPnpCatalogue(leaflet: StoreLeaflet): boolean {
  const isPnp = leaflet.retailerId === 'pick-n-pay' ||
    leaflet.retailerName.toLowerCase().includes('pick n pay')
  if (!isPnp) {
    return false
  }

  for (const value of [leaflet.url, leaflet.documentUrl]) {
    if (!value) {
      continue
    }
    try {
      const url = new URL(value)
      if (
        (url.hostname === 'www.pnp.co.za' || url.hostname === 'pnp.co.za') &&
        url.pathname.replace(/\/+$/, '') === '/catalogues'
      ) {
        return true
      }
    } catch {
      // Ignore malformed source URLs.
    }
  }
  return false
}

async function getRequestInterests(env: TrolleyScoutEnv, accountId: string | undefined) {
  if (!accountId) {
    return []
  }

  const learning = await getDealLearningState(env, accountId)
  return learning.enabled ? listMemberInterestWeights(env, accountId) : []
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

function newestDiscoveryCacheTime(
  normalizedItems: StoredDealItem[],
  snapshots: Map<string, DealSnapshot>,
) {
  let newest = newestSnapshotTime(snapshots)
  for (const item of normalizedItems) {
    if (!newest || item.lastSeenAt > newest) {
      newest = item.lastSeenAt
    }
  }
  return newest
}

// Reconstructs the discovery board from stored snapshots alone — one "found"
// source row per snapshotted feed, plus a "pending" row for feeds not yet
// captured, so the instant response matches the live response shape.
export function buildSnapshotChecks(snapshots: Map<string, DealSnapshot>): SourceCheck[] {
  const targets = getDiscoveryTargets()
  const fixedChecks: SourceCheck[] = targets.map((target) => {
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

  return [
    ...fixedChecks,
    ...buildDynamicSnapshotChecks(snapshots, knownSourceKeys(targets)),
  ]
}

function knownSourceKeys(targets: ResolvedDiscoveryTarget[]) {
  return new Set(
    targets.map((target) => snapshotKey(target.retailer.id, target.source.label)),
  )
}

function buildDynamicSnapshotChecks(
  snapshots: Map<string, DealSnapshot>,
  fixedSourceKeys: Set<string>,
): SourceCheck[] {
  return Array.from(snapshots.entries()).flatMap(([sourceKey, snapshot]) => {
    const firstDeal = snapshot.deals[0]

    if (fixedSourceKeys.has(sourceKey) || !firstDeal) {
      return []
    }

    return [{
      deals: snapshot.deals,
      source: {
        checkedAt: snapshot.checkedAt,
        itemCount: snapshot.deals.length,
        retailerId: firstDeal.retailerId,
        retailerName: firstDeal.retailerName,
        sourceLabel: firstDeal.sourceLabel,
        sourceUrl: firstDeal.sourceUrl,
        status: 'found' as const,
        statusText: `Captured ${snapshot.checkedAt.slice(0, 10)} by the scheduled scout.`,
      },
    }]
  })
}

// Overlapping feeds (e.g. Clicks all-promotions vs a category feed) can
// surface the same product; keep the first row for each product URL.
export function dedupeDiscoveryDeals(deals: DiscoveredDeal[]): DiscoveredDeal[] {
  const seen = new Set<string>()

  return deals.filter((deal) => {
    const keys = discoveryDealKeys(deal)
    if (keys.some((key) => seen.has(key))) {
      return false
    }

    keys.forEach((key) => seen.add(key))
    return true
  })
}

function storedItemToDiscovery(
  item: StoredDealItem,
  retailerName: string,
  sourceLabel: string,
): DiscoveredDeal {
  const catalogueMetadata = item.sourceKind === 'catalogue'
    ? catalogueMetadataFromEvidence(item.evidenceText)
    : {}
  return {
    ...catalogueMetadata,
    capturedAt: item.capturedAt,
    evidenceText: item.evidenceText,
    expiresAt: item.expiresAt,
    id: item.id,
    imageUrl: item.imageUrl,
    previousPriceText: item.previousPriceCents === undefined
      ? undefined
      : centsToRand(item.previousPriceCents),
    priceScope: item.scope,
    priceText: centsToRand(item.priceCents),
    productId: item.productId,
    productUrl: item.productUrl,
    promotionId: item.promotionId,
    retailerId: item.retailerId,
    retailerName,
    savingText: item.savingText,
    sourceLabel,
    sourceUrl: item.sourceUrl,
    title: item.title,
    validFrom: item.validFrom,
    validTo: item.validTo,
  }
}

function catalogueMetadataFromEvidence(value: string): Partial<DiscoveredDeal> {
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const evidence = parsed as Record<string, unknown>
    const pageNumber = evidence.pageNumber
    const documentFingerprint = evidence.documentFingerprint
    const crop = evidence.crop
    const deepLink = publicEvidenceUrl(evidence.deepLink)
    if (
      !Number.isSafeInteger(pageNumber) || (pageNumber as number) < 1 ||
      typeof documentFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(documentFingerprint) ||
      !isEvidenceCrop(crop)
    ) {
      return {}
    }
    return {
      catalogueDeepLink: deepLink,
      catalogueFingerprint: documentFingerprint,
      imageCrop: crop,
      pageNumber: pageNumber as number,
    }
  } catch {
    return {}
  }
}

function publicEvidenceUrl(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function isEvidenceCrop(value: unknown): value is NonNullable<DiscoveredDeal['imageCrop']> {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const crop = value as Record<string, unknown>
  const numbers = ['x', 'y', 'width', 'height'].map((field) => crop[field])
  if (numbers.some((number) => typeof number !== 'number' || !Number.isFinite(number))) {
    return false
  }
  const [x, y, width, height] = numbers as number[]
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1 && y + height <= 1
}

function selectGlobalScopedItems(items: StoredDealItem[]) {
  const priority = { national: 0, online: 1, province: 2, store: 3 } as const
  const selected = new Map<string, StoredDealItem>()

  for (const item of items) {
    const key = `${item.retailerId}::${item.productId}`
    const current = selected.get(key)
    if (
      !current ||
      priority[item.scope.type] < priority[current.scope.type] ||
      (
        priority[item.scope.type] === priority[current.scope.type] &&
        item.capturedAt > current.capturedAt
      )
    ) {
      selected.set(key, item)
    }
  }

  return Array.from(selected.values())
}

function discoveryDealKeys(deal: DiscoveredDeal) {
  const keys: string[] = []
  const scopeKey = discoveryScopeKey(deal)
  if (deal.productId) {
    keys.push(`product:${deal.retailerId}:${deal.productId}:${scopeKey}`)
  }

  try {
    const url = new URL(deal.productUrl)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    keys.push(`url:${deal.retailerId}:${url.toString().toLocaleLowerCase()}:${scopeKey}`)
  } catch {
    keys.push(`url:${deal.retailerId}:${deal.productUrl.trim().toLocaleLowerCase()}:${scopeKey}`)
  }

  return keys
}

function discoveryScopeKey(deal: DiscoveredDeal) {
  const scope = deal.priceScope
  if (!scope || scope.type === 'national' || scope.type === 'online') {
    return 'global'
  }
  if (scope.type === 'province') {
    return `province:${[...scope.regionIds].sort().join(',')}`
  }
  return `store:${[...scope.storeIds].sort().join(',')}`
}

function centsToRand(cents: number) {
  return `R${(cents / 100).toFixed(2)}`
}

function readableSlug(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ') || 'Discovered supermarket'
}

function readableSourceKey(sourceKey: string) {
  // Catalogue keys end in a content fingerprint, so the generic "last segment"
  // rule showed shoppers a raw hash as the deal's source.
  if (sourceKey.startsWith('catalogue::')) {
    return 'Catalogue scan'
  }

  return readableSlug(sourceKey.split('::').at(-1) ?? 'structured-feed')
}

function boundedWholeNumber(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${field} must be between ${minimum} and ${maximum}`)
  }
  return value
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
