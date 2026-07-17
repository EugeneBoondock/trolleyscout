import {
  runCatalogueScout,
  type CatalogueScoutResult,
} from '../functions/_shared/catalogueScout'
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
  runCatalogueScout: typeof runCatalogueScout
  runStructuredRetailerFeedScout: typeof runStructuredRetailerFeedScout
  runVoucherScout?: typeof runVoucherScout
  scoutNearbyStores: typeof scoutNearbyStores
}

const defaultDependencies: ScheduledScoutDependencies = {
  expireDealItems,
  matchPendingWatches,
  purgeExpired,
  readAllStoreCatalogues,
  readDueDiscoveredStores,
  runCatalogueScout,
  runStructuredRetailerFeedScout,
  runVoucherScout,
  scoutNearbyStores,
}

export async function runScheduledScout(
  env: ScoutEnv,
  fetcher: ScoutFetch = fetch,
  dependencies: ScheduledScoutDependencies = defaultDependencies,
) {
  let structured: RetailerFeedScoutResult = emptyStructuredResult(env)
  let structuredScoutFailed = false
  try {
    structured = await dependencies.runStructuredRetailerFeedScout(env)
  } catch {
    structuredScoutFailed = true
  }
  const origin = env.SCOUT_ORIGIN ?? 'https://trolleyscout.co.za'
  const refreshUrl = new URL('/api/discovery', origin)
  refreshUrl.searchParams.set('refresh', '1')
  let discovery: DiscoveryRun | undefined
  let legacyRefreshFailed = false
  try {
    const response = await fetcher(refreshUrl.toString(), {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`Deal refresh returned HTTP ${response.status}.`)
    }
    const envelope = (await response.json()) as { data?: DiscoveryRun }
    discovery = envelope.data
  } catch {
    // Structured feeds and discovered-store fallbacks still run when this
    // older refresh lane has a transient transport or endpoint failure.
    legacyRefreshFailed = true
  }
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  let dueStores: Awaited<ReturnType<typeof readDueDiscoveredStores>> = []
  let storeScoutFailed = false
  try {
    dueStores = await dependencies.readDueDiscoveredStores(env, nowIso)
    await dependencies.scoutNearbyStores(env, dueStores, nowMs, dueStores.length)
  } catch {
    storeScoutFailed = true
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
  if (hasTrolleyScoutDatabase(env)) {
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
    dueStoreCount: dueStores.length,
    expiredNormalizedDealCount,
    expiredRemoved,
    legacyRefreshFailed,
    refreshedDealCount: discovery?.summary.foundDealCount ?? 0,
    refreshedSourceCount: discovery?.summary.checkedSourceCount ?? 0,
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

export default {
  async scheduled(_controller, env) {
    const result = await runScheduledScout(env)
    console.log(JSON.stringify({ event: 'deal_scout_completed', ...result }))
  },
} satisfies ExportedHandler<ScoutEnv>
