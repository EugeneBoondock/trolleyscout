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
  extractPdfLeaflets,
  extractSixtyLeaflets,
  leafletTargets,
  type LeafletTarget,
} from '../../src/services/leafletDiscovery'
import { extractRetailerLeafletsFromHtml } from '../../src/services/scoutSources'
import type {
  DiscoveredDeal,
  DiscoverySourceResult,
  RetailerId,
  StoreLeaflet,
} from '../../src/types'
import {
  listActiveDealItems,
  type StoredDealItem,
} from '../_shared/dealItemStore'
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

const NORMALIZED_PAGE_SIZE = 200
const NORMALIZED_SAFETY_CAP = 5_000
const PAGER_MANIFEST_MAX_BYTES = 512 * 1024
const PAGER_MANIFEST_TIMEOUT_MS = 8_000
const PAGER_ENRICH_CONCURRENCY = 2
const PAGER_PUBLIC_PAGE_LIMIT = 250

export interface NormalizedDealReadOptions {
  listItems?: typeof listActiveDealItems
  pageSize?: number
  safetyCap?: number
}

export const onRequest: PagesFunction<TrolleyScoutEnv> = async ({ env, request, waitUntil }) => {
  if (request.method !== 'GET') {
    return methodNotAllowed(request.method)
  }

  const forceLive = new URL(request.url).searchParams.get('refresh') === '1'
  const nowIso = new Date().toISOString()
  const [snapshots, leafletSnapshot, session, storePromotions, normalizedItems] = await Promise.all([
    readDealSnapshots(env),
    readLeafletSnapshot(env),
    getMemberSession(env, request),
    readAllStorePromotions(env, nowIso),
    readNormalizedDealItems(env, nowIso),
  ])
  const interests = await getRequestInterests(env, session.account?.id)
  const storeDiscovery = storePromotionsToDiscovery(storePromotions, nowIso)
  const normalizedChecks = buildNormalizedDiscoveryChecks(normalizedItems)

  // Instant path: serve the last stored snapshot without waiting on any
  // retailer. A background refresh keeps it fresh so the next visitor still
  // sees current prices — the page never blocks on 13 live fetches.
  if (!forceLive && (normalizedItems.length > 0 || snapshots.size > 0)) {
    const newestCheckedAt = newestDiscoveryCacheTime(normalizedItems, snapshots)
    const isStale = !newestCheckedAt || Date.now() - Date.parse(newestCheckedAt) > STALE_AFTER_MS

    if (isStale) {
      waitUntil(Promise.all([refreshAllSources(env), refreshAllLeaflets(env)]))
    }

    return respond(
      mergeNormalizedFirstChecks(normalizedChecks, buildSnapshotChecks(snapshots)),
      leafletSnapshot?.leaflets ?? [],
      newestCheckedAt,
      true,
      interests,
      storeDiscovery,
    )
  }

  // Live path: explicit "Check now", or a cold store with nothing to serve.
  const [settled, leaflets] = await Promise.all([
    refreshAllSources(env, snapshots),
    refreshAllLeaflets(env, leafletSnapshot?.leaflets),
  ])
  return respond(
    mergeNormalizedFirstChecks(normalizedChecks, settled),
    leaflets,
    new Date().toISOString(),
    false,
    interests,
    storeDiscovery,
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
async function refreshAllLeaflets(
  env: TrolleyScoutEnv,
  priorLeaflets?: StoreLeaflet[],
): Promise<StoreLeaflet[]> {
  const checkedAt = new Date().toISOString()
  const settled = await Promise.all(leafletTargets.map((target) => fetchLeaflets(target, checkedAt)))
  const leaflets = await enrichInteractiveLeaflets(settled.flat())

  if (leaflets.length === 0) {
    return priorLeaflets ?? []
  }

  await saveLeafletSnapshot(env, leaflets, checkedAt)
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

      if (target.kind === 'html-pdf') {
        return extractPdfLeaflets(target, html, checkedAt)
      }

      return await resolveEmbeddedViewers(extractBoxerLeaflets(target, html, checkedAt))
    }

    if (target.kind === 'sitebuilder-pdf' && target.pageUrls) {
      return await fetchSitebuilderLeaflets(target, target.pageUrls, checkedAt)
    }
  } catch {
    // A single retailer's leaflet fetch failing must not sink the board.
  }

  return []
}

// A leaflet whose link is an HTML promotion page cannot be read or scanned.
// Follow each one and, when it embeds a hosted FlippingBook viewer, point the
// leaflet at the viewer's index.html so its pages can be built and scanned.
async function resolveEmbeddedViewers(leaflets: StoreLeaflet[]): Promise<StoreLeaflet[]> {
  return await Promise.all(
    leaflets.map(async (leaflet) => {
      if (leaflet.documentUrl || leaflet.url.toLowerCase().endsWith('/index.html')) {
        return leaflet
      }

      try {
        const response = await fetch(leaflet.url, {
          headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
        })

        if (!response.ok) {
          return leaflet
        }

        const viewerUrl = extractFlippingBookViewerUrl(await response.text())
        return viewerUrl ? { ...leaflet, url: viewerUrl } : leaflet
      } catch {
        return leaflet
      }
    }),
  )
}

// Sitebuilder chains link their weekly leaflet PDF from the nav of the home
// page and repeat or extend it per branch page. Fetch every page, reuse the
// store-scout PDF extractor, and dedupe by document so a leaflet shared across
// branches is listed once.
async function fetchSitebuilderLeaflets(
  target: LeafletTarget,
  pageUrls: string[],
  checkedAt: string,
): Promise<StoreLeaflet[]> {
  const pages = await Promise.all(
    pageUrls.map(async (pageUrl) => {
      try {
        const response = await fetch(pageUrl, {
          headers: { accept: 'text/html', 'user-agent': BROWSER_USER_AGENT },
        })

        if (!response.ok) {
          return []
        }

        return extractRetailerLeafletsFromHtml(
          {
            retailerId: target.retailerId,
            retailerName: target.retailerName,
            sourceUrl: pageUrl,
            trustAllPdfs: true,
          },
          await response.text(),
          checkedAt,
        )
      } catch {
        return []
      }
    }),
  )

  const seen = new Set<string>()
  return pages.flat().filter((leaflet) => {
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
) {
  const deals = rankDealsForMember(
    dedupeDiscoveryDeals([
      ...settled.flatMap((result) => result.deals),
      ...storeDiscovery.deals,
    ]),
    interests,
  )
  const sources = [...settled.map((result) => result.source), ...storeDiscovery.sources]
  const mergedLeaflets = dedupeLeaflets([...leaflets, ...storeDiscovery.leaflets])

  return json(
    {
      deals,
      leaflets: mergedLeaflets,
      refreshedAt,
      served: fromCache ? 'snapshot' : 'live',
      sources,
      summary: {
        checkedSourceCount: sources.length,
        dataPolicy,
        foundDealCount: deals.length,
        leafletCount: mergedLeaflets.length,
        unavailableSourceCount: sources.filter((source) => source.status === 'unavailable').length,
      },
    },
    {
      headers: privateHeaders,
    },
  )
}

export function storePromotionsToDiscovery(
  promotions: StorePromotion[],
  capturedAt: string,
): { deals: DiscoveredDeal[]; leaflets: StoreLeaflet[]; sources: DiscoverySourceResult[] } {
  const deals: DiscoveredDeal[] = []
  const leaflets: StoreLeaflet[] = []
  const byStore = new Map<string, { name: string; sourceUrl: string; count: number }>()

  for (const promotion of promotions) {
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
        capturedAt,
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
      capturedAt,
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

function dedupeLeaflets(leaflets: StoreLeaflet[]): StoreLeaflet[] {
  const seen = new Set<string>()
  return leaflets.filter((leaflet) => {
    const key = leaflet.documentUrl ?? leaflet.url
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
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
