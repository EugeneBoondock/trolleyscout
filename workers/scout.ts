import {
  runCatalogueScout,
  type CatalogueScoutResult,
} from '../functions/_shared/catalogueScout'
import {
  beginDealAlertCapture,
  finishDealAlertCapture,
  recordGlobalDealAlertBatch,
  snapshotDealAlertKeys,
} from '../functions/_shared/dealAlertStore'
import { refreshDealSites } from '../functions/_shared/dealSiteScout'
import { expireDealItems } from '../functions/_shared/dealItemStore'
import { matchPendingWatches } from '../functions/_shared/dealWatchStore'
import type { TrolleyScoutEnv } from '../functions/_shared/env'
import { hasTrolleyScoutDatabase } from '../functions/_shared/env'
import { purgeExpired } from '../functions/_shared/locationStore'
import { readAllStoreCatalogues } from '../functions/_shared/locationStore'
import { readDueDiscoveredStores } from '../functions/_shared/locationStore'
import type { StorePromotion } from '../functions/_shared/locationStore'
import {
  runStructuredRetailerFeedScout,
  type RetailerFeedScoutResult,
} from '../functions/_shared/retailerFeedScout'
import { scoutNearbyStores } from '../functions/_shared/storeScout'
import { runVoucherScout } from '../functions/_shared/voucherScout'
import { pruneWindowSocial } from '../functions/_shared/windowSocialStore'
import { refreshDiscoveryCache } from '../functions/api/discovery'
import type { DiscoveryRun } from '../src/types'
import { parseRetailerSlug } from '../src/services/retailerFeeds/types'

export interface ScoutEnv extends TrolleyScoutEnv {
  SCOUT_ORIGIN?: string
}

type ScoutFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>

export interface ScheduledScoutDependencies {
  expireDealItems: typeof expireDealItems
  matchPendingWatches?: typeof matchPendingWatches
  purgeExpired: typeof purgeExpired
  readAllStoreCatalogues?: typeof readAllStoreCatalogues
  readDueDiscoveredStores: typeof readDueDiscoveredStores
  recordGlobalDealAlertBatch?: typeof recordGlobalDealAlertBatch
  refreshDealSites: typeof refreshDealSites
  refreshDiscovery: typeof refreshDiscoveryCache
  runCatalogueScout: typeof runCatalogueScout
  runStructuredRetailerFeedScout: typeof runStructuredRetailerFeedScout
  runVoucherScout?: typeof runVoucherScout
  scoutNearbyStores: typeof scoutNearbyStores
  snapshotDealAlertKeys?: typeof snapshotDealAlertKeys
}

export interface ScheduledScoutOptions {
  refreshDealSources?: boolean
}

const defaultDependencies: ScheduledScoutDependencies = {
  expireDealItems,
  matchPendingWatches,
  purgeExpired,
  readAllStoreCatalogues,
  readDueDiscoveredStores,
  recordGlobalDealAlertBatch,
  refreshDealSites,
  refreshDiscovery: refreshDiscoveryCache,
  runCatalogueScout,
  runStructuredRetailerFeedScout,
  runVoucherScout,
  scoutNearbyStores,
  snapshotDealAlertKeys,
}

export async function runScheduledScout(
  env: ScoutEnv,
  _fetcher: ScoutFetch = fetch,
  dependencies: ScheduledScoutDependencies = defaultDependencies,
  options: ScheduledScoutOptions = {},
) {
  const refreshDealSources = options.refreshDealSources ?? true
  const dealAlertCapture = await beginDealAlertCapture(env, {
    snapshotKeys: dependencies.snapshotDealAlertKeys ?? snapshotDealAlertKeys,
  })

  let structured: RetailerFeedScoutResult = emptyStructuredResult(env)
  let structuredScoutFailed = false
  if (refreshDealSources) {
    try {
      structured = await dependencies.runStructuredRetailerFeedScout(env)
    } catch {
      structuredScoutFailed = true
    }
  }
  let discovery: DiscoveryRun | undefined
  let legacyRefreshFailed = false
  try {
    discovery = refreshDealSources
      ? await dependencies.refreshDiscovery(env)
      : await dependencies.refreshDiscovery(env, { refreshDeals: false })
  } catch {
    // Structured feeds and discovered-store fallbacks still run when this
    // older refresh lane has a transient transport or endpoint failure.
    legacyRefreshFailed = true
  }
  let externalDealCount = 0
  let externalDealRefreshFailed = false
  if (refreshDealSources) {
    try {
      externalDealCount = await dependencies.refreshDealSites(env)
    } catch {
      externalDealRefreshFailed = true
    }
  }
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  let dueStores: Awaited<ReturnType<typeof readDueDiscoveredStores>> = []
  let storeScoutFailed = false
  if (refreshDealSources) {
    try {
      dueStores = await dependencies.readDueDiscoveredStores(env, nowIso)
      await dependencies.scoutNearbyStores(env, dueStores, nowMs, dueStores.length)
    } catch {
      storeScoutFailed = true
    }
  }

  let discoveredStoreCatalogues: StorePromotion[] = []
  if (hasTrolleyScoutDatabase(env) && dependencies.readAllStoreCatalogues) {
    discoveredStoreCatalogues = await readStoredCataloguePages(
      env,
      nowIso,
      dependencies.readAllStoreCatalogues,
    )
  }
  const catalogueLeaflets = dedupeCatalogueLeaflets([
    ...structured.catalogues,
    ...(discovery?.leaflets ?? []),
    ...storePromotionsToLeaflets(discoveredStoreCatalogues, nowIso),
  ])
  let catalogue: CatalogueScoutResult = {
    dealCount: 0,
    discoveredLeafletCount: 0,
    scannedDocumentCount: 0,
  }
  let catalogueScoutFailed = false
  try {
    catalogue = await dependencies.runCatalogueScout(env, catalogueLeaflets)
  } catch {
    catalogueScoutFailed = true
  }

  let voucherExpiredCount = 0
  let voucherSourceCount = 0
  let voucherWrittenCount = 0
  if (refreshDealSources && hasTrolleyScoutDatabase(env)) {
    try {
      const voucherResult = await (dependencies.runVoucherScout ?? runVoucherScout)(env)
      voucherExpiredCount = voucherResult.expired
      voucherSourceCount = voucherResult.sources.length
      voucherWrittenCount = voucherResult.sources.reduce(
        (total, source) => total + source.written,
        0,
      )
    } catch {
      // A voucher migration or source failure must not stop deal and store scouting.
    }
  }

  // Enforce the expiry rule: remove any store promotions and location caches
  // whose date has passed, so no shopper is ever shown an out-of-date special.
  const expiredRemoved = await dependencies.purgeExpired(env, nowIso)
  let expiredNormalizedDealCount = 0
  if (hasTrolleyScoutDatabase(env)) {
    try {
      expiredNormalizedDealCount = await dependencies.expireDealItems(env, { now: nowIso })
    } catch {
      // During migration rollout, existing discovery and store scouting continue.
    }
  }

  // Every lane above may have landed new deals — answer waiting members last,
  // when today's corpus is at its fullest.
  const dealAlerts = await finishDealAlertCapture(
    env,
    dealAlertCapture,
    nowIso,
    {
      recordBatch: dependencies.recordGlobalDealAlertBatch ?? recordGlobalDealAlertBatch,
      snapshotKeys: dependencies.snapshotDealAlertKeys ?? snapshotDealAlertKeys,
    },
  )

  let watchAlertCount = 0
  if (hasTrolleyScoutDatabase(env)) {
    try {
      watchAlertCount = await (dependencies.matchPendingWatches ?? matchPendingWatches)(env)
    } catch {
      // Watch alerts are best-effort and retried on the next scheduled run.
    }
  }

  return {
    catalogueDealCount: catalogue.dealCount,
    catalogueScoutFailed,
    discoveredLeafletCount: catalogue.discoveredLeafletCount,
    dealAlertAfterSnapshotCount: dealAlerts.afterSnapshotCount,
    dealAlertBatchFailed: dealAlerts.batchFailed,
    dealAlertBatchInserted: dealAlerts.batchInserted,
    dealAlertBeforeSnapshotCount: dealAlerts.beforeSnapshotCount,
    dealAlertNewDealCount: dealAlerts.newDealCount,
    dealAlertSnapshotFailed: dealAlerts.snapshotFailed,
    dealSourcesRefreshed: refreshDealSources,
    dueStoreCount: dueStores.length,
    expiredNormalizedDealCount,
    expiredRemoved,
    externalDealCount,
    externalDealRefreshFailed,
    legacyRefreshFailed,
    refreshedDealCount: refreshDealSources ? discovery?.summary.foundDealCount ?? 0 : 0,
    refreshedSourceCount: refreshDealSources ? discovery?.summary.checkedSourceCount ?? 0 : 0,
    scannedDocumentCount: catalogue.scannedDocumentCount,
    storeScoutFailed,
    structuredAcceptedDealCount: structured.acceptedDealCount,
    structuredCatalogueCount: structured.catalogueCount,
    structuredCheckedSourceCount: structured.checkedSourceCount,
    structuredFailedSourceCount: structured.failedSourceCount,
    structuredPhysicalRequestCount: structured.physicalRequestCount,
    structuredScoutFailed,
    voucherExpiredCount,
    voucherSourceCount,
    voucherWrittenCount,
    watchAlertCount,
  }
}

function emptyStructuredResult(env: ScoutEnv): RetailerFeedScoutResult {
  return {
    acceptedDealCount: 0,
    catalogueCount: 0,
    catalogues: [],
    checkedSourceCount: 0,
    databaseAvailable: hasTrolleyScoutDatabase(env),
    failedSourceCount: 0,
    physicalRequestCount: 0,
    sources: [],
  }
}

const STORED_CATALOGUE_PAGE_SIZE = 1000
const STORED_CATALOGUE_ROW_LIMIT = 10_000

async function readStoredCataloguePages(
  env: ScoutEnv,
  nowIso: string,
  reader: typeof readAllStoreCatalogues,
): Promise<StorePromotion[]> {
  const catalogues: StorePromotion[] = []

  for (
    let offset = 0;
    offset < STORED_CATALOGUE_ROW_LIMIT;
    offset += STORED_CATALOGUE_PAGE_SIZE
  ) {
    try {
      const page = await reader(
        env,
        nowIso,
        STORED_CATALOGUE_PAGE_SIZE,
        offset,
      )
      const remaining = STORED_CATALOGUE_ROW_LIMIT - catalogues.length
      catalogues.push(...page.slice(0, remaining))
      if (page.length < STORED_CATALOGUE_PAGE_SIZE) {
        break
      }
    } catch {
      // Keep completed pages and continue with structured and discovery catalogues.
      break
    }
  }

  return catalogues
}

function dedupeCatalogueLeaflets(leaflets: NonNullable<DiscoveryRun['leaflets']>) {
  const seen = new Set<string>()
  return leaflets.filter((leaflet) => {
    const value = leaflet.documentUrl ?? leaflet.url
    let key = value
    try {
      const url = new URL(value)
      url.hash = ''
      key = url.toString()
    } catch {
      // Invalid legacy records remain distinguishable by their stored value.
    }
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function storePromotionsToLeaflets(
  promotions: readonly StorePromotion[],
  capturedAt: string,
): NonNullable<DiscoveryRun['leaflets']> {
  return promotions.map((promotion) => ({
    capturedAt,
    documentUrl: promotion.productUrl ?? promotion.sourceUrl,
    id: promotion.id,
    imageUrl: promotion.imageUrl,
    name: promotion.title,
    priceScope: { storeIds: [promotion.placeId], type: 'store' },
    retailerId: catalogueRetailerId(promotion),
    retailerName: promotion.storeName,
    sourceLabel: 'Discovered store catalogue',
    url: promotion.sourceUrl,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
  }))
}

export function catalogueRetailerId(promotion: Pick<
  StorePromotion,
  'placeId' | 'retailerId' | 'storeName'
>): string {
  if (promotion.retailerId && parseRetailerSlug(promotion.retailerId)) {
    return promotion.retailerId
  }
  const name = promotion.storeName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'store'
  return `independent-${name}-${stableSlugHash(promotion.placeId)}`
}

function stableSlugHash(value: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(36)
}

const DEAL_SOURCE_CADENCE_HOURS = 3
const HOUR_MS = 60 * 60 * 1000

export function shouldRefreshDealSources(scheduledTime: number): boolean {
  if (!Number.isFinite(scheduledTime)) {
    throw new TypeError('scheduledTime must be a finite timestamp.')
  }
  return Math.floor(scheduledTime / HOUR_MS) % DEAL_SOURCE_CADENCE_HOURS === 0
}

export default {
  async scheduled(controller, env) {
    const result = await runScheduledScout(
      env,
      fetch,
      defaultDependencies,
      { refreshDealSources: shouldRefreshDealSources(controller.scheduledTime) },
    )
    // Drop saves/comments for deals that have left the live feed so global save
    // counts fall as stores retire deals.
    await pruneWindowSocial(env).catch(() => undefined)
    console.log(JSON.stringify({ event: 'deal_scout_completed', ...result }))
  },
} satisfies ExportedHandler<ScoutEnv>
