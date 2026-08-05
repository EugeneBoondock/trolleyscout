import {
  extractRetailerLeafletsFromHtml,
  isTrustedCatalogueUrl,
  looksLikePromotionSignal,
} from '../../src/services/scoutSources'
import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  SHOPRITE_GROUP_CHAINS,
  onPromotionRequest,
  parseShopriteGroupPromotions,
  selectNearestBranchId,
  storesByLocationRequest,
  type ShopriteGroupPromotion,
} from '../../src/services/shopriteGroupDeals'
import {
  buildJinaReaderUrl,
  buildStoreSpecialsQuery,
  extractValidDates,
  pickCatalogueSource,
  type SearchResult,
} from '../../src/services/webSearch'
import type { StoreLeaflet } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import { readSourceCursor, writeSourceCursor } from './dealItemStore'
import { matchPendingWatches } from './dealWatchStore'
import {
  getStructuredRetailerSources,
  runStructuredRetailerFeedScout,
} from './retailerFeedScout'
import {
  buildAlgoliaDealsRequest,
  buildConstructorDealsUrl,
  buildKlevuBootstrapUrl,
  buildKlevuDealsUrl,
  detectDealPlatform,
  extractKlevuSearchDomain,
  parseAlgoliaDeals,
  parseConstructorDeals,
  parseKlevuDeals,
  type AlgoliaDetection,
  type ConstructorDetection,
  type KlevuDetection,
  type PlatformDeal,
} from '../../src/services/dealPlatform'
import {
  DEFAULT_COMMON_COMMERCE_PAGE_SIZE,
  MAX_COMMON_COMMERCE_PAGES,
  MAX_WOOCOMMERCE_PAGE_SIZE,
  buildCommonCommerceDealsRequest,
  commonCommercePayloadItemCount,
  detectCommonCommercePlatform,
  detectPageCurrency,
  parseCommonCommerceDeals,
  type CommonCommercePlatform,
} from '../../src/services/commonCommerceDeals'
import {
  TMPNP_STORE_HOST,
  buildTmpnpSpecialsUrl,
  parseTmpnpSpecialDeals,
} from '../../src/services/tmpnpDeals'
import {
  reconcileSuccessfulStorePromotions,
  recordStoreScout,
  saveStorePromotions,
  claimStoreScout,
  type StoreScoutOutcomeStatus,
  type StorePromotion,
} from './locationStore'
import { countryFromCode } from './countryContext'
import {
  applyCountryRetailerWebsites,
  getCountryRetailers,
} from './countryRetailerScout'
import { searchWebWithStatus } from './searchWeb'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Common places a South African store publishes its specials. Probed in order;
// the first that yields catalogue links wins.
const SPECIALS_PATHS = [
  '/specials',
  '/specials.html',
  '/promotions',
  '/promotions.php',
  '/promocoes',
  '/ofertas',
  '/offres',
  '/deals',
  '/catalogue',
  '/catalogues',
  '/catalogo',
  '/folheto',
  '/punguzo',
  '/weekly-specials',
  '/',
]

// Keep a location scout cheap and quick: only a few independent stores per run,
// and only those with a website that we have not scouted recently.
const MAX_STORES_PER_RUN = 3
// Browser and API fallbacks are independent per shop. Running a small pool
// prevents one expired certificate or hanging host from consuming the entire
// Zimbabwe sweep, while staying below Workers’ outbound connection and
// subrequest limits.
const STORE_SCOUT_CONCURRENCY = 4
const MAX_PATHS_PER_STORE = 4
// A Shopify catalogue page of 250 products runs to about 3.3MB, and reading a
// truncated one leaves unparseable JSON, so the limit has to clear a whole page
// with room to spare. It bounds one response at a time and each is released
// before the next shop, so this costs headroom rather than accumulating.
const MAX_BODY_BYTES = 5_000_000
const MAX_EMBEDDED_SCRIPT_BYTES = 500_000
const MAX_EMBEDDED_ATTRIBUTE_BYTES = 1_250_000
const MAX_EMBEDDED_TOTAL_BYTES = 1_400_000
const MAX_EMBEDDED_SCRIPTS = 30
const MAX_EMBEDDED_NODES = 12_000
const MAX_PROMOTIONS_PER_PAGE = 60
const REQUEST_TIMEOUT_MS = 8_000
// A request-bounded admin sweep must leave enough of its wall-clock budget to
// fetch at least one claimed shop. With a large registry, checking cooldowns
// one row at a time could otherwise consume the whole budget after a useful
// candidate had already been found.
const CLAIM_COLLECTION_AFTER_FIRST_MS = 1_000
const STORE_FETCH_BUDGET_RESERVE_MS = REQUEST_TIMEOUT_MS + 2_000
const SPAR_ORIGIN = 'https://mobile.spar.co.za'
const SPAR_ZIMBABWE_HOST = 'spar.co.zw'
const SPAR_ZIMBABWE_PRODUCTS_URL = 'https://www.spar.co.zw/products'
const SPAR_ZIMBABWE_PRODUCT_PAGES = 4
const ZIMBABWE_WOOCOMMERCE_PRODUCT_PAGES = 6
const ZIMBABWE_WOOCOMMERCE_PAGE_SIZE = 100
const MAX_ZIMBABWE_CATALOGUE_DEALS =
  ZIMBABWE_WOOCOMMERCE_PRODUCT_PAGES * ZIMBABWE_WOOCOMMERCE_PAGE_SIZE
const ZIMBABWE_COMMON_COMMERCE_CATALOGUES: Record<
  string,
  { currencyHint?: string; origin: string; platform: CommonCommercePlatform }
> = {
  '4harvests.co.zw': { currencyHint: 'USD', origin: 'https://www.4harvests.co.zw', platform: 'woocommerce' },
  'africanunique.com': { currencyHint: 'USD', origin: 'https://africanunique.com', platform: 'shopify' },
  'amanatelectrical.com': { currencyHint: 'USD', origin: 'https://amanatelectrical.com', platform: 'shopify' },
  'avacarts.com': { currencyHint: 'USD', origin: 'https://avacarts.com', platform: 'woocommerce' },
  'belindamarshallart.com': { currencyHint: 'USD', origin: 'https://belindamarshallart.com', platform: 'woocommerce' },
  'dairibord.com': { currencyHint: 'USD', origin: 'https://www.dairibord.com', platform: 'woocommerce' },
  'diy.co.zw': { currencyHint: 'USD', origin: 'https://www.diy.co.zw', platform: 'woocommerce' },
  'filaptops.co.zw': { currencyHint: 'USD', origin: 'https://www.filaptops.co.zw', platform: 'woocommerce' },
  'foodworld.co.zw': { currencyHint: 'USD', origin: 'https://www.foodworld.co.zw', platform: 'woocommerce' },
  'infinitysolar.co.zw': { currencyHint: 'USD', origin: 'https://www.infinitysolar.co.zw', platform: 'woocommerce' },
  'innovative.co.zw': { currencyHint: 'USD', origin: 'https://innovative.co.zw', platform: 'woocommerce' },
  'kesontvs.co.zw': { currencyHint: 'USD', origin: 'https://kesontvs.co.zw', platform: 'woocommerce' },
  'laptopzone.co.zw': { currencyHint: 'USD', origin: 'https://laptopzone.co.zw', platform: 'woocommerce' },
  'luckybrandonline.co.zw': { currencyHint: 'USD', origin: 'https://luckybrandonline.co.zw', platform: 'woocommerce' },
  'magnet.co.zw': { currencyHint: 'USD', origin: 'https://magnet.co.zw', platform: 'woocommerce' },
  'market.ama.co.zw': { currencyHint: 'USD', origin: 'https://market.ama.co.zw', platform: 'woocommerce' },
  'mawuafrica.com': { currencyHint: 'USD', origin: 'https://mawuafrica.com', platform: 'shopify' },
  'mcmeats.co.zw': { currencyHint: 'USD', origin: 'https://mcmeats.co.zw', platform: 'woocommerce' },
  'montanamallzw.com': { currencyHint: 'USD', origin: 'https://montanamallzw.com', platform: 'woocommerce' },
  'nashfurnishers.co.zw': { currencyHint: 'USD', origin: 'https://nashfurnishers.co.zw', platform: 'woocommerce' },
  'shop.zikimall.com': { currencyHint: 'USD', origin: 'https://shop.zikimall.com', platform: 'woocommerce' },
  'solarshack.co.zw': { currencyHint: 'USD', origin: 'https://solarshack.co.zw', platform: 'woocommerce' },
  'solutioncentre.co.zw': { currencyHint: 'USD', origin: 'https://solutioncentre.co.zw', platform: 'shopify' },
  'steelcentre.co.zw': { currencyHint: 'USD', origin: 'https://steelcentre.co.zw', platform: 'woocommerce' },
  'tcgas.co.zw': { currencyHint: 'USD', origin: 'https://tcgas.co.zw', platform: 'woocommerce' },
  'tileandcarpetcentre.co.zw': { currencyHint: 'USD', origin: 'https://www.tileandcarpetcentre.co.zw', platform: 'woocommerce' },
  'tvsales.co.zw': { currencyHint: 'USD', origin: 'https://tvsales.co.zw', platform: 'woocommerce' },
  'vegetablebasket.co.zw': { currencyHint: 'USD', origin: 'https://www.vegetablebasket.co.zw', platform: 'woocommerce' },
  'volksmaster.co.zw': { currencyHint: 'USD', origin: 'https://volksmaster.co.zw', platform: 'woocommerce' },
  'zambezicart.com': { currencyHint: 'USD', origin: 'https://www.zambezicart.com', platform: 'shopify' },
  'zbms.co.zw': { currencyHint: 'USD', origin: 'https://www.zbms.co.zw', platform: 'woocommerce' },
}
const ZIMBABWE_WOOCOMMERCE_CATALOGUES: Record<
  string,
  { apiUrl: string; label: string; origin: string; shopUrl: string }
> = {
  'everythingzimbabwean.com': {
    apiUrl:
      'https://api.everythingzimbabwean.com/wp-json/wc/store/v1/products?on_sale=true',
    label: 'Everything Zimbabwean sale catalogue',
    origin: 'https://everythingzimbabwean.com',
    shopUrl: 'https://everythingzimbabwean.com/',
  },
  'zstore.co.zw': {
    apiUrl: 'https://zstore.co.zw/wp-json/wc/store/v1/products',
    label: 'Z-Store online catalogue',
    origin: 'https://zstore.co.zw',
    shopUrl: 'https://zstore.co.zw/shop/',
  },
}
const AGGREGATOR_HOSTS = ['guzzle.co.za', 'tiendeo.co.za', 'cataloguespecials.co.za']
const TELONE_SHOP_HOST = 'shop.telone.co.zw'
const TELONE_PRODUCTS_URL =
  'https://springapi.telone.co.zw/digitalShop/api/v1/product-line?region=Harare'
const TILLPOINT_HOST = 'tillpoint.co.zw'
const TILLPOINT_ORIGIN = 'https://tillpoint.co.zw'
const GETMORE_HOST = 'getmore.co.zw'
const GETMORE_SPECIALS_URL = 'https://getmore.co.zw/special-offers.html'
const FOUR_HARVESTS_HOST = '4harvests.co.zw'
const FOUR_HARVESTS_ORIGIN = 'https://www.4harvests.co.zw'
const FOUR_HARVESTS_SALE_URL =
  'https://www.4harvests.co.zw/shop/?on_sale=onsale'
const FOUR_HARVESTS_PAGE_SIZE = 48
const TENGAI_HOST = 'tengaionline.com'
const TENGAI_ORIGIN = 'https://tengaionline.com'
const TENGAI_SHOP_URL = 'https://tengaionline.com/?post_type=product&per_page=24'
const TENGAI_PRODUCT_PAGES = 4
const HELLO_KUMBA_HOST = 'order.hellokumba.com'
const HELLO_KUMBA_ORIGIN = 'https://order.hellokumba.com'
const HELLO_KUMBA_MERCHANT_SITEMAP =
  'https://order.hellokumba.com/merchant_sitemap.xml'
const HELLO_KUMBA_PRODUCTS_API =
  'https://api.hyperzod.app/store/v1/catalog/products'
const HELLO_KUMBA_PRODUCT_PAGES = 4
const ZIM_ZONE_HOST = 'zim-zone.co.uk'
const ZIM_ZONE_ORIGIN = 'https://zim-zone.co.uk'
const ZIM_ZONE_SPECIALS_URL =
  'https://zim-zone.co.uk/grocery-deals?pagesize=100'
const WATUMIRA_HERE_HOST = 'watumirahere.co.za'
const WATUMIRA_HERE_URL = 'https://www.watumirahere.co.za/'
const BULK_BARREL_HOST = 'bulkbmarketing-ux.github.io'
const BULK_BARREL_CATALOGUE_URL =
  'https://bulkbmarketing-ux.github.io/bulk-barrel/'
const FIRST_CLASS_GROCERIES_HOST = 'firstclassgroceries.com'
const FIRST_CLASS_GROCERIES_ORIGIN = 'https://www.firstclassgroceries.com'
const FIRST_CLASS_GROCERIES_PRODUCTS_API =
  'https://api-ecommerce.hostinger.com/store/store_01KQGWJMJ110BVYHPYPHVH0GZ0/products?limit=100'
const KAMBUDZI_HOST = 'kambudzi.com'
const KAMBUDZI_ORIGIN = 'https://kambudzi.com'
const KAMBUDZI_SPECIALS_URL = 'https://kambudzi.com/search?q=special'

const KNOWN_RETAILER_HOSTS: Record<string, string> = {
  builders: 'builders.co.za',
  boxer: 'boxer.co.za',
  checkers: 'checkers.co.za',
  clicks: 'clicks.co.za',
  'dis-chem': 'dischem.co.za',
  'food-lovers': 'foodloversmarket.co.za',
  game: 'game.co.za',
  makro: 'makro.co.za',
  'ok-foods': 'okfoods.co.za',
  'pick-n-pay': 'pnp.co.za',
  shoprite: 'shoprite.co.za',
  spar: 'mobile.spar.co.za',
  usave: 'usave.co.za',
  woolworths: 'woolworths.co.za',
}

interface ScoutOutcome {
  promotions: StorePromotion[]
  resolvedWebsite?: string
  status: StoreScoutOutcomeStatus
}

interface FetchOutcome {
  finalUrl?: string
  headers?: Headers
  status: 'success' | 'transient_failure' | 'permanent_unverified'
  text?: string
}

// Scouts the stores that ended up with no deals or leaflets — passed in by the
// endpoint. This covers both independents AND big chains we do not have a live
// feed for (SPAR, Woolworths, Food Lover's), giving each a real "this week's
// specials" link found the way a shopper would search for it.
/// `deadlineMs` bounds the wall clock rather than the number of shops. A shop
/// that never answers costs its whole timeout, so a run sized only by count can
/// outlast the caller waiting for it — which is what made an on-demand fetch of
/// the United States, where many sites hang on a request from outside the
/// country, look like a failure. Past the deadline the sweep stops and reports
/// what it managed; the shops it never reached keep only their ten-minute
/// claim, so they come round again shortly rather than waiting out a full day.
export async function scoutNearbyStores(
  env: TrolleyScoutEnv,
  storesNeedingDeals: NearbyStore[],
  nowMs: number,
  maxStores = MAX_STORES_PER_RUN,
  deadlineMs?: number,
): Promise<void> {
  if (!env.DB) {
    return
  }

  const nowIso = new Date(nowMs).toISOString()

  // First, for every known chain among the nearby stores, run that retailer's
  // structured deal feed (Woolworths Constructor.io, Dis-Chem Klevu, Game,
  // Clicks, Makro, Builders, Food Lover's...). One call covers the whole chain
  // and lands deals in deal_items, which the Near-me endpoint reads for known
  // chains. This is why a chain store rarely shows empty: its own API is tried
  // before we ever fall back to website scraping or web search.
  const feedRetailersScouted = await scoutStructuredFeedsForStores(env, storesNeedingDeals)

  const candidates: NearbyStore[] = []
  const limit = Math.max(0, Math.floor(maxStores))
  const claimStartedAt = Date.now()

  if (limit === 0) {
    if (feedRetailersScouted) {
      try {
        await matchPendingWatches(env)
      } catch {
        // Best-effort.
      }
    }
    return
  }

  for (const store of storesNeedingDeals) {
    if (
      deadlineMs !== undefined &&
      (
        Date.now() >= deadlineMs - STORE_FETCH_BUDGET_RESERVE_MS ||
        (
          candidates.length > 0 &&
          Date.now() - claimStartedAt >= CLAIM_COLLECTION_AFTER_FIRST_MS
        )
      )
    ) {
      break
    }

    const queuedNextScoutAt = (store as NearbyStore & { nextScoutAt?: unknown }).nextScoutAt
    const isDueQueueItem =
      typeof queuedNextScoutAt === 'string' && queuedNextScoutAt <= nowIso

    // claimStoreScout is an atomic claim, so concurrent nearby searches around
    // the same due store scrape it exactly once. Cron queue items are already
    // due-filtered upstream and keep their fast path.
    if (isDueQueueItem || await claimStoreScout(env, store.placeId, nowIso)) {
      candidates.push(store)
    }

    if (candidates.length >= limit) {
      break
    }
  }

  let savedAnyPromotions = false
  const preparedCandidates = await enrichCountryRetailerWebsites(env, candidates)

  let candidateIndex = 0
  const workerCount = Math.min(
    STORE_SCOUT_CONCURRENCY,
    preparedCandidates.length,
  )

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (candidateIndex < preparedCandidates.length) {
        // Checked before reserving the next shop, so the pool never starts
        // another fetch after the caller’s wall-clock budget has ended.
        if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
          return
        }

        const store = preparedCandidates[candidateIndex]
        candidateIndex += 1
        if (!store) return

        try {
          const outcome = await scoutStore(env, store, nowMs)
          const resolvedStore = outcome.resolvedWebsite
            ? { ...store, website: outcome.resolvedWebsite }
            : store
          const promotions = outcome.promotions.map((promotion) => ({
            ...promotion,
            countryCode: store.countryCode ?? 'ZA',
          }))
          const saved = await saveStorePromotions(env, promotions, nowMs)
          if (saved && promotions.length > 0) {
            savedAnyPromotions = true
          }
          if (saved && outcome.status === 'success' && promotions.length > 0) {
            await reconcileSuccessfulStorePromotions(env, store.placeId, promotions)
          }
          await recordStoreScout(
            env,
            resolvedStore,
            promotions.length,
            nowMs,
            store.sourceCategory === 'holiday-campaign' &&
                Number.isFinite(store.scoutIntervalMs) &&
                (store.scoutIntervalMs ?? 0) > 0 &&
                outcome.status !== 'transient_failure' &&
                outcome.status !== 'permanent_unverified'
              ? store.scoutIntervalMs!
              : outcome.status,
          )
        } catch {
          // A malformed store or unexpected source response is isolated to
          // this queue item so every later due store still receives an attempt.
          await recordStoreScout(env, store, 0, nowMs, 'transient_failure')
        }
      }
    }),
  )

  // New deals just landed from this shopper's area (structured feeds and/or
  // scouted promotions): see whether they answer anything members watch for.
  if (savedAnyPromotions || feedRetailersScouted) {
    try {
      await matchPendingWatches(env)
    } catch {
      // Alerts are best-effort; the cron sweep retries every pending watch.
    }
  }
}

async function enrichCountryRetailerWebsites(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
): Promise<NearbyStore[]> {
  const enriched = [...stores]
  const indexesByCountry = new Map<string, number[]>()

  for (const [index, store] of stores.entries()) {
    const countryCode = store.countryCode?.toUpperCase()
    if (!countryCode || countryCode === 'ZA' || store.website) continue
    const indexes = indexesByCountry.get(countryCode) ?? []
    indexes.push(index)
    indexesByCountry.set(countryCode, indexes)
  }

  for (const [countryCode, indexes] of indexesByCountry) {
    try {
      const country = countryFromCode(countryCode)
      const retailers = await getCountryRetailers(env, country)
      const countryStores = indexes.map((index) => enriched[index]!)
      const resolved = applyCountryRetailerWebsites(countryStores, country, retailers)
      indexes.forEach((index, offset) => {
        enriched[index] = resolved[offset]!
      })
    } catch {
      // Country directory lookup is optional. The direct website search still runs.
    }
  }

  return enriched
}

// Runs the structured deal feed for each distinct known chain among the nearby
// stores, deduped so ten Woolworths branches trigger one Woolworths fetch.
// Returns how many retailers produced deals. Each retailer's feed is a queued
// fallback method: if a chain has a structured API we use it here, and the
// per-store website/search scout below only runs for what still has nothing.
async function scoutStructuredFeedsForStores(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
): Promise<number> {
  if (!env.DB) {
    return 0
  }

  const sources = getStructuredRetailerSources()
  const sourcesByRetailer = new Map<string, typeof sources>()

  for (const source of sources) {
    const list = sourcesByRetailer.get(source.retailerId) ?? []
    sourcesByRetailer.set(source.retailerId, [...list, source])
  }

  const retailersNearby = new Set<string>()
  for (const store of stores) {
    if (
      countryFromCode(store.countryCode).code === 'ZA' &&
      store.retailerId &&
      sourcesByRetailer.has(store.retailerId)
    ) {
      retailersNearby.add(store.retailerId)
    }
  }

  let retailersWithDeals = 0

  for (const retailerId of retailersNearby) {
    const retailerSources = sourcesByRetailer.get(retailerId)
    if (!retailerSources) {
      continue
    }

    try {
      // Cooldown before touching the upstream feed: the hourly cron already
      // sweeps every source, so a nearby search only tops a retailer up when
      // nothing has run recently. Without this, every shopper near a chain
      // store re-scraped that chain's API on each location refresh.
      if (await ranStructuredFeedRecently(env, retailerSources.map((source) => source.key))) {
        continue
      }
      // Bounded: a near-me search advances the retailer's feed by a couple of
      // requests, not a full re-crawl (the cron sweep does the deep pass).
      const result = await runStructuredRetailerFeedScout(env, {
        requestCap: 2,
        sources: retailerSources,
      })
      if (result.acceptedDealCount > 0) {
        retailersWithDeals += 1
      }
    } catch {
      // A single retailer feed failing must not stop the others.
    }
  }

  return retailersWithDeals
}

// A request-path feed top-up is skipped when any of the retailer's sources ran
// inside this window. The hourly cron is the real cadence; this only exists so
// a brand-new region isn't empty until the next cron tick.
const STRUCTURED_FEED_REQUEST_COOLDOWN_MS = 15 * 60 * 1000

async function ranStructuredFeedRecently(
  env: TrolleyScoutEnv,
  sourceKeys: string[],
): Promise<boolean> {
  if (!env.DB || sourceKeys.length === 0) {
    return false
  }

  const cutoff = new Date(Date.now() - STRUCTURED_FEED_REQUEST_COOLDOWN_MS).toISOString()
  const placeholders = sourceKeys.map(() => '?').join(', ')

  try {
    const row = await env.DB.prepare(
      `SELECT 1 AS ran FROM deal_source_runs
        WHERE source_key IN (${placeholders}) AND finished_at >= ?
        LIMIT 1`,
    )
      .bind(...sourceKeys, cutoff)
      .first<{ ran: number }>()
    return Boolean(row?.ran)
  } catch {
    // If the audit table is missing (mid-migration), keep the old behavior.
    return false
  }
}

async function scoutStore(
  env: TrolleyScoutEnv,
  store: NearbyStore,
  nowMs: number,
): Promise<ScoutOutcome> {
  const attempts: ScoutOutcome[] = []
  const isSouthAfricanStore = countryFromCode(store.countryCode).code === 'ZA'

  // A discovered Shoprite/Checkers branch can serve its OWN current specials
  // through the anonymous browse-by-store API, keyed off the store's location.
  if (
    isSouthAfricanStore &&
    store.retailerId &&
    SHOPRITE_GROUP_CHAINS[store.retailerId]
  ) {
    const group = await scoutShopriteGroupBranch(store, nowMs)
    attempts.push(group)
    if (group.promotions.length > 0) {
      return group
    }
  }

  if (isSouthAfricanStore && store.retailerId === 'spar') {
    const spar = await scoutSparBranch(store, nowMs)
    attempts.push(spar)
    if (spar.promotions.length > 0) {
      return spar
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === SPAR_ZIMBABWE_HOST
  ) {
    const sparZimbabwe = await scoutSparZimbabwe(store)
    attempts.push(sparZimbabwe)
    if (sparZimbabwe.promotions.length > 0) {
      return sparZimbabwe
    }
  }

  const zimbabweCommonCommerce =
    countryFromCode(store.countryCode).code === 'ZW' && safeHost(store.website)
      ? ZIMBABWE_COMMON_COMMERCE_CATALOGUES[safeHost(store.website) ?? '']
      : undefined
  if (zimbabweCommonCommerce) {
    const catalogue = await scoutCommonCommercePlatform(
      store,
      zimbabweCommonCommerce.platform,
      zimbabweCommonCommerce.origin,
      zimbabweCommonCommerce.currencyHint,
    )
    attempts.push(catalogue)
    if (catalogue.promotions.length > 0) {
      return catalogue
    }
  }

  const zimbabweWooCommerce =
    countryFromCode(store.countryCode).code === 'ZW' && safeHost(store.website)
      ? ZIMBABWE_WOOCOMMERCE_CATALOGUES[safeHost(store.website) ?? '']
      : undefined
  if (zimbabweWooCommerce) {
    const catalogue = await scoutZimbabweWooCommerceCatalogue(
      store,
      zimbabweWooCommerce,
    )
    attempts.push(catalogue)
    if (catalogue.promotions.length > 0) {
      return catalogue
    }
  }

  // A store matched to a custom-API retailer reads its live specials straight
  // from that API. TM Pick n Pay's Next.js storefront bot-walls datacenter
  // fetches with a redirect loop, so website scraping never would — but its
  // api.tmpnponline.co.zw subdomain answers plain JSON.
  if (safeHost(store.website) === TMPNP_STORE_HOST) {
    const tmpnp = await scoutTmpnp(store, nowMs)
    attempts.push(tmpnp)
    if (tmpnp.promotions.length > 0) {
      return tmpnp
    }
  }

  // TelOne renders its public shop as an Angular shell. The product rows are
  // loaded from this anonymous JSON endpoint, so the raw HTML contains no
  // prices for a server-side scout to read.
  if (safeHost(store.website) === TELONE_SHOP_HOST) {
    const telone = await scoutTelone(store)
    attempts.push(telone)
    if (telone.promotions.length > 0) {
      return telone
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === TILLPOINT_HOST
  ) {
    const tillPoint = await scoutTillPoint(store)
    attempts.push(tillPoint)
    if (tillPoint.promotions.length > 0) {
      return tillPoint
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === GETMORE_HOST
  ) {
    const getMore = await scoutGetMore(env, store)
    attempts.push(getMore)
    if (getMore.promotions.length > 0) {
      return getMore
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === FOUR_HARVESTS_HOST
  ) {
    const fourHarvests = await scoutFourHarvests(env, store)
    attempts.push(fourHarvests)
    if (fourHarvests.promotions.length > 0) {
      return fourHarvests
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === TENGAI_HOST
  ) {
    const tengai = await scoutTengai(env, store)
    attempts.push(tengai)
    if (tengai.promotions.length > 0) {
      return tengai
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === HELLO_KUMBA_HOST
  ) {
    const helloKumba = await scoutHelloKumba(store)
    attempts.push(helloKumba)
    if (helloKumba.promotions.length > 0) {
      return helloKumba
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === ZIM_ZONE_HOST
  ) {
    const zimZone = await scoutZimZone(env, store)
    attempts.push(zimZone)
    if (zimZone.promotions.length > 0) {
      return zimZone
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === WATUMIRA_HERE_HOST
  ) {
    const watumiraHere = await scoutWatumiraHere(env, store)
    attempts.push(watumiraHere)
    if (watumiraHere.promotions.length > 0) {
      return watumiraHere
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === BULK_BARREL_HOST
  ) {
    const bulkBarrel = await scoutBulkBarrel(env, store)
    attempts.push(bulkBarrel)
    if (bulkBarrel.promotions.length > 0) {
      return bulkBarrel
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === FIRST_CLASS_GROCERIES_HOST
  ) {
    const firstClassGroceries = await scoutFirstClassGroceries(store)
    attempts.push(firstClassGroceries)
    if (firstClassGroceries.promotions.length > 0) {
      return firstClassGroceries
    }
  }

  if (
    countryFromCode(store.countryCode).code === 'ZW' &&
    safeHost(store.website) === KAMBUDZI_HOST
  ) {
    const kambudzi = await scoutKambudzi(env, store)
    attempts.push(kambudzi)
    if (kambudzi.promotions.length > 0) {
      return kambudzi
    }
  }
  if (store.website) {
    const website = await scoutStoreWebsite(env, store, nowMs)
    attempts.push(website)
    if (website.promotions.length > 0) {
      return website
    }
  }

  // An event result is admitted for one exact public campaign page after a
  // robots check. Do not turn an empty page into permission to probe other
  // paths or issue another broad search on that retailer's behalf.
  if (store.sourceCategory === 'holiday-campaign') {
    if (attempts.some((attempt) => attempt.status === 'transient_failure')) {
      return outcome('transient_failure', [], resolvedWebsiteFrom(attempts))
    }
    if (attempts.some((attempt) => attempt.status === 'empty')) {
      return outcome('empty', [], resolvedWebsiteFrom(attempts))
    }
    return outcome('permanent_unverified', [], resolvedWebsiteFrom(attempts))
  }

  const search = await searchStoreCatalogue(store, nowMs, env)
  attempts.push(search)
  if (search.promotions.length > 0) {
    return search
  }

  if (attempts.some((attempt) => attempt.status === 'transient_failure')) {
    return outcome('transient_failure', [], resolvedWebsiteFrom(attempts))
  }
  if (attempts.some((attempt) => attempt.status === 'empty')) {
    return outcome('empty', [], resolvedWebsiteFrom(attempts))
  }
  return outcome('permanent_unverified', [], resolvedWebsiteFrom(attempts))
}

// Searches the open web for a store's current catalogue and turns the best
// result into a promotion. Reads the found page (when it is not a PDF) to pick
// up any printed valid-until date so it still expires correctly.
async function searchStoreCatalogue(
  store: NearbyStore,
  nowMs: number,
  env: TrolleyScoutEnv,
): Promise<ScoutOutcome> {
  const area = store.address ? cityFromAddress(store.address) : undefined
  const websiteHost = safeHost(store.website)
  const knownRetailerHost = countryFromCode(store.countryCode).code === 'ZA' && store.retailerId
    ? KNOWN_RETAILER_HOSTS[store.retailerId]
    : undefined
  const verifiedHost = knownRetailerHost ?? websiteHost
  const search = await searchOfficialWeb(
    buildStoreSpecialsQuery(
      store.name,
      area,
      verifiedHost,
      store.countryName ?? countryFromCode(store.countryCode).name,
    ),
    env.JINA_API_KEY,
    env,
  )

  if (search.status === 'transient_failure') {
    return outcome('transient_failure')
  }

  const source = pickCatalogueSource(search.results, store.name, verifiedHost)

  if (!source) {
    return outcome(verifiedHost ? 'empty' : 'permanent_unverified')
  }

  let validFrom: string | undefined
  let validTo: string | undefined

  if (source.kind === 'pdf') {
    return outcome(
      'success',
      [cataloguePromotion(store, source.url, source.title)],
      safeOrigin(source.url),
    )
  }

  const page = await fetchText(source.url)

  if (page.status !== 'success' || !page.text) {
    return outcome(page.status)
  }

  if (
    !knownRetailerHost &&
    !verifyOfficialStorePage(store, page.text, page.finalUrl ?? source.url, true)
  ) {
    return outcome('permanent_unverified')
  }

  if (verifiedHost && safeHost(page.finalUrl ?? source.url) !== verifiedHost.replace(/^www\./, '')) {
    return outcome('permanent_unverified')
  }

  const officialOrigin = safeOrigin(page.finalUrl ?? source.url)

  if (!officialOrigin || isAggregatorHost(new URL(officialOrigin).hostname)) {
    return outcome('permanent_unverified')
  }

  const pageUrl = page.finalUrl ?? source.url
  const deals = extractPublicStoreDeals(store, page.text, pageUrl, nowMs)
  const leaflets = extractOfficialLeaflets(store, page.text, pageUrl, officialOrigin, nowMs)
  let commonCommerceTransient = false

  if (deals.length > 0 || leaflets.length > 0) {
    return outcome('success', [...deals, ...leaflets], officialOrigin)
  }

  const commonCommerce = detectCommonCommercePlatform(page.text)
  if (commonCommerce) {
    const platform = await scoutCommonCommercePlatform(
      store,
      commonCommerce.platform,
      officialOrigin,
      detectPageCurrency(page.text),
    )
    if (platform.promotions.length > 0) {
      return { ...platform, resolvedWebsite: officialOrigin }
    }
    commonCommerceTransient = platform.status === 'transient_failure'
  }

  if (!isPromotionalSource(pageUrl, source.title, page.text)) {
    return outcome(
      commonCommerceTransient ? 'transient_failure' : 'empty',
      [],
      officialOrigin,
    )
  }

  const dates = extractValidDates(
    stripHtml(page.text).slice(0, 20_000),
    new Date(nowMs).getUTCFullYear(),
  )
  validFrom = dates.validFrom
  validTo = dates.validTo

  return outcome(
    commonCommerceTransient ? 'transient_failure' : 'success',
    [
      {
        id: `${store.placeId}-search-${hashString(source.url)}`,
        kind: 'catalogue',
        placeId: store.placeId,
        productUrl: source.url,
        sourceUrl: source.url,
        storeName: store.name,
        title: `${store.name} specials`,
        validFrom,
        validTo,
      },
    ],
    officialOrigin,
  )
}

async function searchOfficialWeb(
  query: string,
  jinaApiKey?: string,
  providerKeys: TrolleyScoutEnv = {},
): Promise<{ results: SearchResult[]; status: 'success' | 'empty' | 'transient_failure' }> {
  return searchWebWithStatus(query, jinaApiKey, providerKeys)
}

function cityFromAddress(address: string): string | undefined {
  // Addresses look like "Store, 5th Street, Johannesburg, Ward 103, ...".
  const parts = address.split(',').map((part) => part.trim())
  return parts.length >= 3 ? parts[2] : parts[1]
}

function stripHtml(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
}

function hashString(value: string): string {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash).toString(36)
}

// Probes a store's website for a specials/catalogue page and turns any leaflet
// links it finds into promotions, respecting whatever dates are printed.
// Detects a hosted deal platform (Klevu, Constructor.io, Algolia) the big
// chains use and, if found, queries it for on-promotion products — applied to
// any store, however small, so "no deals" means every method was tried.
// Matches the parser's ceiling: a shop with plenty of markdowns should be
// represented by them, not truncated to a token few.
// Kept in step with MAX_COMMON_COMMERCE_DEALS: a shop that is worth scanning
// deeply is worth keeping the results of.
const MAX_PLATFORM_DEALS = 300

function platformDealToPromotion(
  store: NearbyStore,
  deal: PlatformDeal,
  sourceUrl: string,
  scopeLabel?: string,
): StorePromotion {
  const currency = deal.currencyCode
  const savingText = deal.promoLabel ?? (
    deal.previousPriceCents !== undefined && deal.previousPriceCents > deal.priceCents
      ? `Save ${storeMoneyText(store, deal.previousPriceCents - deal.priceCents, currency)}`
      : undefined
  )
  return {
    id: `${store.placeId}-platform-${hashString(deal.title + (deal.productUrl ?? ''))}`,
    imageUrl: deal.imageUrl,
    kind: 'deal',
    placeId: store.placeId,
    previousPriceText:
      deal.previousPriceCents !== undefined
        ? storeMoneyText(store, deal.previousPriceCents, currency)
        : undefined,
    priceText: storeMoneyText(store, deal.priceCents, currency),
    productUrl: deal.productUrl ?? sourceUrl,
    retailerId: store.retailerId,
    savingText: [scopeLabel, savingText].filter(Boolean).join(' · ') || undefined,
    soldOut: deal.soldOut,
    sourceUrl: deal.productUrl ?? sourceUrl,
    storeName: store.name,
    title: deal.title,
    validFrom: deal.validFrom,
    validTo: deal.validTo,
  }
}

async function scoutStoreWebsite(
  env: TrolleyScoutEnv,
  store: NearbyStore,
  nowMs: number,
): Promise<ScoutOutcome> {
  if (!store.website) {
    return outcome('permanent_unverified')
  }

  const origin = safeOrigin(store.website)

  if (!origin || isAggregatorHost(new URL(origin).hostname)) {
    return outcome('permanent_unverified')
  }

  const knownRetailerHost = countryFromCode(store.countryCode).code === 'ZA' && store.retailerId
    ? KNOWN_RETAILER_HOSTS[store.retailerId]
    : undefined
  if (knownRetailerHost && safeHost(origin) !== knownRetailerHost) {
    return outcome('permanent_unverified')
  }

  const pathPlan = storeSpecialsPathPlan(
    store.website,
    store.websiteSource === 'country-retailer',
    store.sourceCategory === 'holiday-campaign',
  )
  const cursorKey = `store-paths::${hashString(store.placeId)}`
  const cursorState = await readStorePathCursor(env, cursorKey, pathPlan.length)
  const start = cursorState.start
  const paths = cursorState.resumable
    ? pathPlan.slice(start, start + MAX_PATHS_PER_STORE)
    : pathPlan.slice(0, MAX_PATHS_PER_STORE)
  let nextPath = start
  let sawTransientFailure = false
  let linkedDetailBudget = 2
  // Leaflets found along the way. They are worth storing, but they must never
  // end the search on their own — see below.
  let heldLeaflets: StorePromotion[] = []

  for (const path of paths) {
    const pageUrl = `${origin}${path}`
    const page = await fetchStorePage(pageUrl, env.JINA_API_KEY)

    if (page.status === 'transient_failure') {
      // Keep probing the remaining specials paths — one blocked or flaky
      // path must not write the whole store off for this run.
      sawTransientFailure = true
      continue
    }

    if (cursorState.resumable) {
      nextPath = (nextPath + 1) % pathPlan.length
      await persistStorePathCursor(env, cursorKey, nextPath, nowMs)
    }

    if (page.status !== 'success' || !page.text) {
      continue
    }

    const finalUrl = page.finalUrl ?? pageUrl
    if (!sameOrigin(finalUrl, origin)) {
      continue
    }
    if (!verifyOfficialStorePage(store, page.text, finalUrl)) {
      continue
    }

    const leaflets = extractOfficialLeaflets(store, page.text, finalUrl, origin, nowMs)
    const deals = extractPublicStoreDeals(store, page.text, finalUrl, nowMs)

    // Priced products are what a shopper came for, so they end the search.
    // A leaflet alone must not: a shop running a commerce platform keeps its
    // real markdowns behind that platform's API, and one promotional image on
    // the home page would otherwise be everything we ever stored. That is why
    // a shop with forty live discounts was recorded with a single row.
    if (deals.length > 0) {
      return outcome('success', [...deals, ...leaflets])
    }
    if (leaflets.length > 0 && heldLeaflets.length === 0) {
      heldLeaflets = leaflets
    }

    if (linkedDetailBudget > 0) {
      const detailUrls = extractPromotionDetailUrls(
        page.text,
        finalUrl,
        origin,
        linkedDetailBudget,
      )
      linkedDetailBudget -= detailUrls.length

      for (const detailUrl of detailUrls) {
        const detail = await fetchStorePage(detailUrl, env.JINA_API_KEY)
        if (detail.status === 'transient_failure') {
          sawTransientFailure = true
          continue
        }
        if (detail.status !== 'success' || !detail.text) continue

        const resolvedDetailUrl = detail.finalUrl ?? detailUrl
        if (
          !sameOrigin(resolvedDetailUrl, origin) ||
          !verifyOfficialStorePage(store, detail.text, resolvedDetailUrl)
        ) {
          continue
        }
        const detailLeaflets = extractOfficialLeaflets(
          store,
          detail.text,
          resolvedDetailUrl,
          origin,
          nowMs,
        )
        const detailDeals = extractPublicStoreDeals(
          store,
          detail.text,
          resolvedDetailUrl,
          nowMs,
        )
        if (detailLeaflets.length > 0 || detailDeals.length > 0) {
          return outcome('success', [...detailDeals, ...detailLeaflets])
        }
      }
    }

    // The site's own extraction found nothing, but it may run a hosted deal
    // platform (Klevu et al.) the big chains also use — detect it from this
    // page's HTML (which we already have) and query its deals API.
    const detection = detectDealPlatform(page.text)
    if (detection) {
      const platform =
        detection.platform === 'klevu'
          ? await scoutKlevuPlatform(store, detection, origin)
          : detection.platform === 'constructor'
            ? await scoutConstructorPlatform(store, detection, origin)
            : await scoutAlgoliaPlatform(store, detection, origin)
      if (platform.promotions.length > 0) {
        return outcome('success', [...platform.promotions, ...heldLeaflets])
      }
      if (platform.status === 'transient_failure') {
        sawTransientFailure = true
      }
    }

    const commonCommerce = detectCommonCommercePlatform(page.text)
    if (commonCommerce) {
      const platform = await scoutCommonCommercePlatform(
        store,
        commonCommerce.platform,
        origin,
        detectPageCurrency(page.text),
      )
      if (platform.promotions.length > 0) {
        return outcome('success', [...platform.promotions, ...heldLeaflets])
      }
      if (platform.status === 'transient_failure') {
        sawTransientFailure = true
      }
    }
  }

  // No platform answered, so a leaflet is the best this shop has today.
  if (heldLeaflets.length > 0) {
    return outcome('success', heldLeaflets)
  }

  return outcome(sawTransientFailure ? 'transient_failure' : 'empty')
}

// Fetches a store page directly, then through the jina reader when the site
// blocks datacenter fetches (bot-walled 403s or transient errors) — most
// stores publish their specials publicly, so a blocked direct fetch should
// never be the end of the road. The reader is asked for raw HTML so the
// downstream extraction sees the same markup either way.
async function fetchStorePage(
  pageUrl: string,
  jinaApiKey?: string,
): Promise<FetchOutcome> {
  const direct = await fetchText(pageUrl)
  if (direct.status === 'success') {
    return direct
  }

  const proxied = await fetchText(
    buildJinaReaderUrl(pageUrl),
    {
      'x-return-format': 'html',
      ...(jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : {}),
    },
    true,
  )
  if (proxied.status === 'success' && proxied.text) {
    // Origin checks downstream must see the store's URL, not the reader's.
    return { ...proxied, finalUrl: pageUrl }
  }

  // An empty or failed reader response proves nothing — report the direct
  // failure so transient sites keep their short retry.
  return direct
}

// Queries a detected Klevu store for on-promotion products and maps them to
// promotions tied to this store. Same method Dis-Chem uses, applied generically.
async function scoutKlevuPlatform(
  store: NearbyStore,
  detection: KlevuDetection,
  origin: string,
): Promise<ScoutOutcome> {
  // The search cluster is often only in Klevu's external bootstrap JS, not the
  // page HTML — resolve it from the deterministic bootstrap URL when missing.
  let searchDomain = detection.searchDomain
  if (!searchDomain) {
    const bootstrap = await fetchText(buildKlevuBootstrapUrl(detection.apiKey))
    if (bootstrap.status === 'transient_failure') {
      return outcome('transient_failure')
    }
    searchDomain = bootstrap.status === 'success' && bootstrap.text
      ? extractKlevuSearchDomain(bootstrap.text)
      : undefined
    if (!searchDomain) {
      return outcome('empty')
    }
  }

  const response = await fetchText(buildKlevuDealsUrl({ ...detection, searchDomain }))

  if (response.status === 'transient_failure') {
    return outcome('transient_failure')
  }
  if (response.status !== 'success' || !response.text) {
    return outcome('empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(response.text)
  } catch {
    return outcome('empty')
  }

  const deals = parseKlevuDeals(payload, safeHost(origin)).slice(0, MAX_PLATFORM_DEALS)

  if (deals.length === 0) {
    return outcome('empty')
  }

  return outcome('success', deals.map((deal) => platformDealToPromotion(store, deal, origin)))
}

// Queries a detected Constructor.io store (Woolworths' platform) for
// discounted products via its public search API.
async function scoutConstructorPlatform(
  store: NearbyStore,
  detection: ConstructorDetection,
  origin: string,
): Promise<ScoutOutcome> {
  const response = await fetchText(
    buildConstructorDealsUrl(detection),
    { accept: 'application/json' },
    true,
  )

  if (response.status === 'transient_failure') {
    return outcome('transient_failure')
  }
  if (response.status !== 'success' || !response.text) {
    return outcome('empty')
  }

  let payload: unknown
  try {
    payload = JSON.parse(response.text)
  } catch {
    return outcome('empty')
  }

  const deals = parseConstructorDeals(payload, safeHost(origin)).slice(0, MAX_PLATFORM_DEALS)

  if (deals.length === 0) {
    return outcome('empty')
  }

  return outcome('success', deals.map((deal) => platformDealToPromotion(store, deal, origin)))
}

// Queries a detected Algolia store for discounted products. Only possible when
// the page HTML surfaced the app id, a public search key, and an index name.
async function scoutAlgoliaPlatform(
  store: NearbyStore,
  detection: AlgoliaDetection,
  origin: string,
): Promise<ScoutOutcome> {
  const request = buildAlgoliaDealsRequest(detection)

  if (!request) {
    return outcome('empty')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(request.url, { ...request.init, signal: controller.signal })

    if (response.status >= 500 || response.status === 429) {
      return outcome('transient_failure')
    }
    if (!response.ok) {
      return outcome('empty')
    }

    const deals = parseAlgoliaDeals(await response.json(), safeHost(origin))
      .slice(0, MAX_PLATFORM_DEALS)

    if (deals.length === 0) {
      return outcome('empty')
    }

    return outcome('success', deals.map((deal) => platformDealToPromotion(store, deal, origin)))
  } catch {
    return outcome('transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

async function scoutCommonCommercePlatform(
  store: NearbyStore,
  platform: CommonCommercePlatform,
  origin: string,
  currencyHint?: string,
): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const deals: PlatformDeal[] = []
  const seen = new Set<string>()

  try {
    const pageSize = platform === 'woocommerce'
      ? MAX_WOOCOMMERCE_PAGE_SIZE
      : DEFAULT_COMMON_COMMERCE_PAGE_SIZE
    for (let page = 1; page <= MAX_COMMON_COMMERCE_PAGES; page += 1) {
      const request = buildCommonCommerceDealsRequest(
        platform,
        origin,
        pageSize,
        page,
      )
      if (!request) {
        break
      }
      const response = await fetch(request.url, {
        ...request.init,
        headers: {
          ...request.init.headers,
          'user-agent': BROWSER_UA,
        },
        signal: controller.signal,
      })
      if (
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        return deals.length > 0
          ? commonCommerceOutcome(store, deals, origin)
          : outcome('transient_failure')
      }
      if (!response.ok) {
        break
      }
      const text = await readBoundedBody(response, MAX_BODY_BYTES)
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        // A catalogue page can exceed the read limit (a store was seen serving
        // a single 2.8MB page), leaving the body truncated mid-JSON. That page
        // is unreadable, but the store's other pages are still worth reading,
        // so skip it instead of abandoning the whole catalogue.
        continue
      }
      const pageDeals = parseCommonCommerceDeals(platform, payload, origin)
      for (const deal of pageDeals) {
        const key = deal.productUrl ?? deal.title
        if (!seen.has(key) && deals.length < MAX_PLATFORM_DEALS) {
          seen.add(key)
          deals.push(deal)
        }
      }
      if (
        deals.length >= MAX_PLATFORM_DEALS ||
        commonCommercePayloadItemCount(platform, payload) < pageSize
      ) {
        break
      }
    }
    return deals.length > 0
      ? commonCommerceOutcome(store, deals, origin, currencyHint)
      : outcome('empty')
  } catch (error) {
    if (deals.length > 0) {
      return commonCommerceOutcome(store, deals, origin, currencyHint)
    }
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

function commonCommerceOutcome(
  store: NearbyStore,
  deals: PlatformDeal[],
  origin: string,
  currencyHint?: string,
): ScoutOutcome {
  return outcome(
    'success',
    deals.map((deal) =>
      platformDealToPromotion(
        store,
        currencyHint && !deal.currencyCode ? { ...deal, currencyCode: currencyHint } : deal,
        origin,
        'Online catalogue',
      ),
    ),
  )
}

// Reads TM Pick n Pay's live specials from its custom commerce API. fetchText
// only accepts text/html, so this JSON feed is read with a bounded raw fetch,
// the same way the Shoprite Group browse-by-store API is.
async function scoutTmpnp(store: NearbyStore, nowMs: number): Promise<ScoutOutcome> {
  try {
    const fetchPage = async (page: number): Promise<unknown> => {
        const response = await fetch(buildTmpnpSpecialsUrl(page), {
          headers: { accept: 'application/json', 'user-agent': BROWSER_UA },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        if (!response.ok) {
          throw new Error(`TM Pick n Pay specials returned ${response.status}`)
        }
        return JSON.parse(await readBoundedBody(response, MAX_BODY_BYTES)) as unknown
    }
    const firstPage = await fetchPage(1)
    const lastPage = tmpnpLastPage(firstPage)
    const remainingPages = Array.from(
      { length: Math.max(0, lastPage - 1) },
      (_, index) => index + 2,
    )
    const remainingResults = await mapSettledWithConcurrency(
      remainingPages,
      4,
      fetchPage,
    )
    const pageResults: Array<PromiseSettledResult<unknown>> = [
      { status: 'fulfilled', value: firstPage },
      ...remainingResults,
    ]
    const deals = pageResults
      .flatMap((result) =>
        result.status === 'fulfilled' ? parseTmpnpSpecialDeals(result.value, nowMs) : [],
      )
      .filter(
        (deal, index, all) =>
          all.findIndex(
            (candidate) =>
              (candidate.productUrl ?? candidate.title.toLowerCase()) ===
              (deal.productUrl ?? deal.title.toLowerCase()),
          ) === index,
      )
      .slice(0, MAX_PLATFORM_DEALS)
    if (deals.length === 0) {
      return outcome(
        pageResults.some((result) => result.status === 'rejected')
          ? 'transient_failure'
          : 'empty',
      )
    }

    return outcome(
      'success',
      deals.map((deal) => platformDealToPromotion(store, deal, `https://${TMPNP_STORE_HOST}`)),
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  }
}

function tmpnpLastPage(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 1
  const value = Number((payload as Record<string, unknown>).last_page)
  return Number.isSafeInteger(value) ? Math.max(1, Math.min(30, value)) : 1
}

async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]!) }
      } catch (reason) {
        results[index] = { reason, status: 'rejected' }
      }
    }
  }))
  return results
}

interface TeloneProduct {
  active?: unknown
  id?: unknown
  imageUrl?: unknown
  name?: unknown
  price?: unknown
  productItemTotal?: unknown
}

interface FoodWorldProduct {
  id?: unknown
  images?: unknown
  is_in_stock?: unknown
  name?: unknown
  permalink?: unknown
  prices?: unknown
  slug?: unknown
}

interface HelloKumbaProduct {
  id?: unknown
  in_stock?: unknown
  name?: unknown
  price?: unknown
  price_currency?: unknown
  price_sell_compare?: unknown
  product_images?: unknown
  status?: unknown
}

interface TillPointProduct {
  compare_at_price?: unknown
  currency?: unknown
  id?: unknown
  images?: unknown
  is_available?: unknown
  name?: unknown
  price?: unknown
  slug?: unknown
  stock_quantity?: unknown
  thumbnail?: unknown
}

export function parseTillPointProducts(payload: unknown): PlatformDeal[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((value): PlatformDeal[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const row = value as TillPointProduct
    const title = typeof row.name === 'string' ? row.name.trim() : ''
    const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
    const price = typeof row.price === 'number'
      ? row.price
      : Number.parseFloat(String(row.price ?? ''))
    const compareAt = typeof row.compare_at_price === 'number'
      ? row.compare_at_price
      : Number.parseFloat(String(row.compare_at_price ?? ''))
    const stock = typeof row.stock_quantity === 'number'
      ? row.stock_quantity
      : Number.parseFloat(String(row.stock_quantity ?? ''))
    const images = Array.isArray(row.images)
      ? row.images.filter((image): image is string => typeof image === 'string')
      : []
    const imageUrl = absoluteUrl(
      typeof row.thumbnail === 'string' ? row.thumbnail : images[0],
      TILLPOINT_ORIGIN,
    )

    if (
      row.is_available === false ||
      !title ||
      !slug ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return []
    }

    const priceCents = Math.round(price * 100)
    const previousPriceCents = Number.isFinite(compareAt) && compareAt > price
      ? Math.round(compareAt * 100)
      : undefined

    return [{
      currencyCode: typeof row.currency === 'string'
        ? row.currency.toUpperCase()
        : 'USD',
      imageUrl,
      previousPriceCents,
      priceCents,
      productUrl: `${TILLPOINT_ORIGIN}/p/${encodeURIComponent(slug)}`,
      promoLabel: 'TillPoint online catalogue',
      soldOut: Number.isFinite(stock) ? stock <= 0 : undefined,
      title,
    }]
  })
}

export function parseGetMoreSpecialProducts(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const itemPattern =
    /<li\b[^>]*class=["'][^"']*\bproduct-item\b[^"']*["'][^>]*>[\s\S]*?<\/li>/gi
  let item: RegExpExecArray | null

  while ((item = itemPattern.exec(html)) !== null) {
    const segment = item[0]
    const productLink =
      /<a\b([^>]*class=["'][^"']*\bproduct-item-link\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/i
        .exec(segment)
    const productUrl = absoluteUrl(
      productLink ? attributeValue(productLink[1], ['href']) : undefined,
      GETMORE_SPECIALS_URL,
    )
    const title = productLink ? cleanText(productLink[2]) : ''
    const finalPriceTag =
      /<[^>]*\bdata-price-type=["']finalPrice["'][^>]*>/i.exec(segment)?.[0]
    const oldPriceTag =
      /<[^>]*\bdata-price-type=["']oldPrice["'][^>]*>/i.exec(segment)?.[0]
    const price = Number.parseFloat(
      attributeValue(finalPriceTag ?? '', ['data-price-amount']) ?? '',
    )
    const previousPrice = Number.parseFloat(
      attributeValue(oldPriceTag ?? '', ['data-price-amount']) ?? '',
    )
    const imageTag =
      /<img\b([^>]*class=["'][^"']*\bproduct-image-photo\b[^"']*["'][^>]*)>/i
        .exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag ? attributeValue(imageTag, ['data-src', 'src']) : undefined,
      GETMORE_SPECIALS_URL,
    )

    if (
      !productUrl ||
      safeHost(productUrl) !== GETMORE_HOST ||
      !title ||
      !Number.isFinite(price) ||
      price <= 0 ||
      seen.has(productUrl)
    ) {
      continue
    }

    seen.add(productUrl)
    products.push({
      currencyCode: 'USD',
      imageUrl,
      previousPriceCents:
        Number.isFinite(previousPrice) && previousPrice > price
          ? Math.round(previousPrice * 100)
          : undefined,
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: 'GetMore special offers',
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

export function parseFourHarvestsDeals(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const starts = Array.from(html.matchAll(
    /<div\b[^>]*class=["'][^"']*\bproduct\b[^"']*\btype-product\b[^"']*["'][^>]*>/gi,
  ))

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0
    const next = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(next, start + 35_000))
    const titleLink =
      /<h3\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i
        .exec(segment)
    const productUrl = absoluteUrl(
      titleLink ? attributeValue(titleLink[1], ['href']) : undefined,
      FOUR_HARVESTS_SALE_URL,
    )
    const title = titleLink ? cleanText(titleLink[2]) : ''
    const previousPrice = numberValue(
      cleanText(/<del\b[^>]*>([\s\S]*?)<\/del>/i.exec(segment)?.[1] ?? ''),
    )
    const price = numberValue(
      cleanText(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i.exec(segment)?.[1] ?? ''),
    )
    const imageTag = /<img\b([^>]*)>/i.exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag ? attributeValue(imageTag, ['src', 'data-src']) : undefined,
      FOUR_HARVESTS_SALE_URL,
    )

    if (
      !productUrl ||
      safeHost(productUrl) !== FOUR_HARVESTS_HOST ||
      !title ||
      price === undefined ||
      previousPrice === undefined ||
      previousPrice <= price ||
      seen.has(productUrl)
    ) {
      continue
    }

    seen.add(productUrl)
    products.push({
      currencyCode: 'USD',
      imageUrl,
      previousPriceCents: Math.round(previousPrice * 100),
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: '4 Harvests sale',
      soldOut: /\boutofstock\b|\bout of stock\b/i.test(segment),
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

export function parseTengaiProducts(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const starts = Array.from(html.matchAll(
    /<div\b[^>]*class=["'][^"']*\bproduct-grid-item\b[^"']*\btype-product\b[^"']*["'][^>]*>/gi,
  ))

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0
    const next = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(next, start + 40_000))
    const titleLink =
      /<h3\b[^>]*class=["'][^"']*\bwd-entities-title\b[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i
        .exec(segment)
    const productUrl = absoluteUrl(
      titleLink
        ? decodeHtml(attributeValue(titleLink[1], ['href']) ?? '')
        : undefined,
      TENGAI_SHOP_URL,
    )
    const title = titleLink ? cleanText(titleLink[2]) : ''
    const currentPriceMarkup =
      /<ins\b[^>]*>[\s\S]*?<bdi\b[^>]*>([\s\S]*?)<\/bdi>[\s\S]*?<\/ins>/i
        .exec(segment)?.[1] ??
      /<div\b[^>]*class=["'][^"']*\bwrap-price\b[^"']*["'][^>]*>[\s\S]*?<bdi\b[^>]*>([\s\S]*?)<\/bdi>/i
        .exec(segment)?.[1] ??
      /<span\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>[\s\S]*?<bdi\b[^>]*>([\s\S]*?)<\/bdi>/i
        .exec(segment)?.[1]
    const previousPriceMarkup =
      /<del\b[^>]*>[\s\S]*?<bdi\b[^>]*>([\s\S]*?)<\/bdi>[\s\S]*?<\/del>/i
        .exec(segment)?.[1]
    const currentPriceText = cleanText(currentPriceMarkup ?? '')
    const price = numberValue(currentPriceText)
    const previousPrice = numberValue(cleanText(previousPriceMarkup ?? ''))
    const imageTag = /<img\b([^>]*)>/i.exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag
        ? decodeHtml(attributeValue(imageTag, ['src', 'data-src']) ?? '')
        : undefined,
      TENGAI_SHOP_URL,
    )

    if (
      !productUrl ||
      safeHost(productUrl) !== TENGAI_HOST ||
      !title ||
      price === undefined ||
      price <= 0 ||
      seen.has(productUrl)
    ) {
      continue
    }

    seen.add(productUrl)
    products.push({
      currencyCode: /£/.test(currentPriceText) ? 'GBP' : 'USD',
      imageUrl,
      previousPriceCents:
        previousPrice !== undefined && previousPrice > price
          ? Math.round(previousPrice * 100)
          : undefined,
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: 'Tengai Online catalogue',
      soldOut: /\boutofstock\b|\bout of stock\b/i.test(segment),
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

async function scoutTengai(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const pages = await Promise.all(
    Array.from({ length: TENGAI_PRODUCT_PAGES }, async (_, index) => {
      const url = new URL(TENGAI_SHOP_URL)
      url.searchParams.set('paged', String(index + 1))
      return fetchStorePage(url.toString(), env.JINA_API_KEY)
    }),
  )
  const products = pages
    .flatMap((page) =>
      page.status === 'success' && page.text
        ? parseTengaiProducts(page.text)
        : [],
    )
    .filter(
      (product, index, all) =>
        all.findIndex((candidate) => candidate.productUrl === product.productUrl) === index,
    )
    .slice(0, MAX_PLATFORM_DEALS)

  if (products.length === 0) {
    return outcome(
      pages.some((page) => page.status === 'transient_failure')
        ? 'transient_failure'
        : 'empty',
    )
  }

  return outcome(
    'success',
    products.map((product) =>
      platformDealToPromotion(store, product, TENGAI_SHOP_URL, 'Online catalogue'),
    ),
    TENGAI_ORIGIN,
  )
}

export function parseFirstClassGroceriesProducts(
  payload: unknown,
): PlatformDeal[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const rows = (payload as Record<string, unknown>).products
  if (!Array.isArray(rows)) {
    return []
  }

  return rows.flatMap((value): PlatformDeal[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const row = value as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const title = typeof row.title === 'string'
      ? decodeHtml(row.title).trim()
      : ''
    const variants = Array.isArray(row.variants)
      ? row.variants.filter(
          (variant): variant is Record<string, unknown> =>
            Boolean(variant) && typeof variant === 'object',
        )
      : []
    const variant =
      variants.find((candidate) => candidate.is_available !== false) ??
      variants[0]
    const prices = Array.isArray(variant?.prices)
      ? variant.prices.filter(
          (price): price is Record<string, unknown> =>
            Boolean(price) && typeof price === 'object',
        )
      : []
    const price = prices[0]
    const regularAmount = Number(price?.amount)
    const saleAmount = Number(price?.sale_amount)
    const hasSale =
      Number.isFinite(saleAmount) &&
      saleAmount > 0 &&
      saleAmount < regularAmount
    const currentAmount = hasSale ? saleAmount : regularAmount
    const rawCurrency = typeof price?.currency_code === 'string'
      ? price.currency_code.toUpperCase()
      : 'USD'
    // The live shop selector and displayed prices are USD. Hostinger still
    // returns the retired ZWL code in this store's API metadata.
    const currencyCode = rawCurrency === 'ZWL' ? 'USD' : rawCurrency

    if (
      row.purchasable !== true ||
      !id ||
      !title ||
      !Number.isFinite(currentAmount) ||
      currentAmount <= 0
    ) {
      return []
    }

    return [{
      currencyCode,
      imageUrl: absoluteUrl(
        typeof row.thumbnail === 'string' ? row.thumbnail : undefined,
        FIRST_CLASS_GROCERIES_ORIGIN,
      ),
      previousPriceCents: hasSale ? Math.round(regularAmount) : undefined,
      priceCents: Math.round(currentAmount),
      productUrl:
        `${FIRST_CLASS_GROCERIES_ORIGIN}/product/${encodeURIComponent(id)}`,
      promoLabel:
        typeof row.ribbon_text === 'string' && row.ribbon_text.trim()
          ? row.ribbon_text.trim()
          : 'First Class online catalogue',
      soldOut: row.is_available === false || variant?.is_available === false,
      title,
    }]
  }).slice(0, MAX_PLATFORM_DEALS)
}

async function scoutFirstClassGroceries(
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(FIRST_CLASS_GROCERIES_PRODUCTS_API, {
      headers: {
        accept: 'application/json',
        'user-agent': BROWSER_UA,
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      return outcome(response.status >= 500 ? 'transient_failure' : 'empty')
    }

    const products = parseFirstClassGroceriesProducts(
      JSON.parse(await readBoundedBody(response, MAX_BODY_BYTES)) as unknown,
    )
    if (products.length === 0) {
      return outcome('empty')
    }

    return outcome(
      'success',
      products.map((product) =>
        platformDealToPromotion(
          store,
          product,
          `${FIRST_CLASS_GROCERIES_ORIGIN}/products`,
          'Online catalogue',
        ),
      ),
      FIRST_CLASS_GROCERIES_ORIGIN,
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

export function parseBulkBarrelProducts(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const starts = Array.from(html.matchAll(
    /<div\b[^>]*class=["'][^"']*\bcard\b[^"']*["'][^>]*>/gi,
  ))

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0
    const next = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(next, start + 12_000))
    const title = cleanText(
      /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(segment)?.[1] ?? '',
    )
    const price = numberValue(
      cleanText(/<p\b[^>]*>\s*\$?([\s\S]*?)<\/p>/i.exec(segment)?.[1] ?? ''),
    )
    const imageTag = /<img\b([^>]*)>/i.exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag
        ? decodeHtml(attributeValue(imageTag, ['data-src', 'src']) ?? '')
        : undefined,
      BULK_BARREL_CATALOGUE_URL,
    )
    const key = `${title.toLowerCase()}:${price ?? ''}`

    if (!title || price === undefined || price <= 0 || seen.has(key)) {
      continue
    }

    seen.add(key)
    products.push({
      currencyCode: 'USD',
      imageUrl,
      priceCents: Math.round(price * 100),
      productUrl: BULK_BARREL_CATALOGUE_URL,
      promoLabel: 'Bulk & Barrel catalogue',
      soldOut: false,
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

async function scoutBulkBarrel(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const page = await fetchStorePage(BULK_BARREL_CATALOGUE_URL, env.JINA_API_KEY)
  if (page.status !== 'success' || !page.text) {
    return outcome(
      page.status === 'transient_failure' ? 'transient_failure' : 'empty',
    )
  }

  const products = parseBulkBarrelProducts(page.text)
  if (products.length === 0) {
    return outcome('empty')
  }

  return outcome(
    'success',
    products.map((product) =>
      platformDealToPromotion(
        store,
        product,
        BULK_BARREL_CATALOGUE_URL,
        'Online catalogue',
      ),
    ),
    BULK_BARREL_CATALOGUE_URL,
  )
}

export function parseWatumiraHereOffers(html: string): PlatformDeal[] {
  const text = decodeHtml(stripHtml(html)).replace(/\s+/g, ' ').trim()
  const offers = [
    {
      match:
        /Hampers for Every Budget.{0,260}?from as low as R\s*([0-9][0-9.,]*)/i
          .exec(text),
      title: 'Grocery hampers',
    },
    {
      match:
        /Affordable Construction Supplies.{0,320}?starting from R\s*([0-9][0-9.,]*)/i
          .exec(text),
      title: 'Hardware supplies',
    },
  ]

  return offers.flatMap(({ match, title }): PlatformDeal[] => {
    const price = numberValue(match?.[1])
    if (price === undefined || price <= 0) {
      return []
    }

    const amount = Number.isInteger(price) ? price.toFixed(0) : price.toFixed(2)
    return [{
      currencyCode: 'ZAR',
      imageUrl: undefined,
      priceCents: Math.round(price * 100),
      productUrl: WATUMIRA_HERE_URL,
      promoLabel: `From R${amount}`,
      soldOut: false,
      title,
    }]
  })
}

async function scoutWatumiraHere(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const page = await fetchStorePage(WATUMIRA_HERE_URL, env.JINA_API_KEY)
  if (page.status !== 'success' || !page.text) {
    return outcome(
      page.status === 'transient_failure' ? 'transient_failure' : 'empty',
    )
  }

  const products = parseWatumiraHereOffers(page.text)
  if (products.length === 0) {
    return outcome('empty')
  }

  return outcome(
    'success',
    products.map((product) =>
      platformDealToPromotion(
        store,
        product,
        WATUMIRA_HERE_URL,
        'Online offer',
      ),
    ),
    WATUMIRA_HERE_URL,
  )
}

export function parseZimZoneSpecials(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const starts = Array.from(html.matchAll(
    /<div\b[^>]*class=["'][^"']*\bproduct-item\b[^"']*["'][^>]*>/gi,
  ))

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0
    const next = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(next, start + 45_000))
    const titleLink =
      /<h2\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i
        .exec(segment)
    const productUrl = absoluteUrl(
      titleLink
        ? decodeHtml(attributeValue(titleLink[1], ['href']) ?? '')
        : undefined,
      ZIM_ZONE_ORIGIN,
    )
    const title = titleLink ? cleanText(titleLink[2]) : ''
    const price = numberValue(cleanText(
      /<span\b[^>]*class=["'][^"']*\bactual-price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(segment)?.[1] ?? '',
    ))
    const previousPrice = numberValue(cleanText(
      /<span\b[^>]*class=["'][^"']*\bold-price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(segment)?.[1] ?? '',
    ))
    const imageTag = /<img\b([^>]*)>/i.exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag
        ? decodeHtml(
            attributeValue(imageTag, ['data-lazyloadsrc', 'data-src', 'src']) ?? '',
          )
        : undefined,
      ZIM_ZONE_ORIGIN,
    )
    const ribbon = cleanText(
      /<label\b[^>]*class=["'][^"']*\bribbon-text\b[^"']*["'][^>]*>([\s\S]*?)<\/label>/i
        .exec(segment)?.[1] ?? '',
    )

    if (
      !productUrl ||
      safeHost(productUrl) !== ZIM_ZONE_HOST ||
      !title ||
      price === undefined ||
      price <= 0 ||
      seen.has(productUrl)
    ) {
      continue
    }

    seen.add(productUrl)
    products.push({
      currencyCode: 'ZAR',
      imageUrl,
      previousPriceCents:
        previousPrice !== undefined && previousPrice > price
          ? Math.round(previousPrice * 100)
          : undefined,
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: ribbon || (
        previousPrice !== undefined && previousPrice > price
          ? `${Math.round(((previousPrice - price) / previousPrice) * 100)}% OFF`
          : 'Zim-Zone specials'
      ),
      soldOut: /\bout of stock\b|\bsold out\b|\bunavailable\b/i.test(segment),
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

async function scoutZimZone(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const page = await fetchStorePage(ZIM_ZONE_SPECIALS_URL, env.JINA_API_KEY)
  if (page.status !== 'success' || !page.text) {
    return outcome(
      page.status === 'transient_failure' ? 'transient_failure' : 'empty',
    )
  }

  const products = parseZimZoneSpecials(page.text)
  if (products.length === 0) {
    return outcome('empty')
  }

  return outcome(
    'success',
    products.map((product) =>
      platformDealToPromotion(
        store,
        product,
        ZIM_ZONE_SPECIALS_URL,
        'Zim-Zone specials',
      ),
    ),
    ZIM_ZONE_ORIGIN,
  )
}

export function parseKambudziSpecials(html: string): PlatformDeal[] {
  const products: PlatformDeal[] = []
  const seen = new Set<string>()
  const starts = Array.from(html.matchAll(
    /<div\b[^>]*class=["'][^"']*\bproduct-item\b[^"']*["'][^>]*>/gi,
  ))

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index ?? 0
    const next = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(next, start + 45_000))
    const titleLink =
      /<h2\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i
        .exec(segment)
    const productUrl = absoluteUrl(
      titleLink
        ? decodeHtml(attributeValue(titleLink[1], ['href']) ?? '')
        : undefined,
      KAMBUDZI_ORIGIN,
    )
    const title = titleLink ? cleanText(titleLink[2]) : ''
    const price = numberValue(cleanText(
      /<span\b[^>]*class=["'][^"']*\bactual-price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(segment)?.[1] ?? '',
    ))
    const previousPrice = numberValue(cleanText(
      /<span\b[^>]*class=["'][^"']*\bold-price\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
        .exec(segment)?.[1] ?? '',
    ))
    const imageTag = /<img\b([^>]*)>/i.exec(segment)?.[1]
    const imageUrl = absoluteUrl(
      imageTag
        ? decodeHtml(
            attributeValue(imageTag, ['data-lazyloadsrc', 'data-src', 'src']) ?? '',
          )
        : undefined,
      KAMBUDZI_ORIGIN,
    )

    if (
      !productUrl ||
      safeHost(productUrl) !== KAMBUDZI_HOST ||
      !title ||
      price === undefined ||
      price <= 0 ||
      previousPrice === undefined ||
      previousPrice <= price ||
      seen.has(productUrl)
    ) {
      continue
    }

    seen.add(productUrl)
    products.push({
      currencyCode: 'ZAR',
      imageUrl,
      previousPriceCents: Math.round(previousPrice * 100),
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: `${Math.round(((previousPrice - price) / previousPrice) * 100)}% OFF`,
      soldOut: /\bout of stock\b|\bsold out\b|\bunavailable\b/i.test(segment),
      title,
    })

    if (products.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return products
}

async function scoutKambudzi(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const page = await fetchStorePage(KAMBUDZI_SPECIALS_URL, env.JINA_API_KEY)
  if (page.status !== 'success' || !page.text) {
    return outcome(
      page.status === 'transient_failure' ? 'transient_failure' : 'empty',
    )
  }

  const products = parseKambudziSpecials(page.text)
  if (products.length === 0) {
    return outcome('empty')
  }

  return outcome(
    'success',
    products.map((product) =>
      platformDealToPromotion(
        store,
        product,
        KAMBUDZI_SPECIALS_URL,
        'Kambudzi special',
      ),
    ),
    KAMBUDZI_ORIGIN,
  )
}
function helloKumbaMerchantId(xml: string): string | undefined {
  return /<loc>\s*https:\/\/order\.hellokumba\.com\/m\/hellokumba-kwese\/([a-f0-9]{24})\s*<\/loc>/i
    .exec(xml)?.[1]
}

export function parseHelloKumbaProducts(
  payload: unknown,
  merchantId: string,
): PlatformDeal[] {
  if (!/^[a-f0-9]{24}$/i.test(merchantId) || !payload || typeof payload !== 'object') {
    return []
  }

  const root = payload as Record<string, unknown>
  const data = root.data && typeof root.data === 'object'
    ? root.data as Record<string, unknown>
    : undefined
  const rows = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(root.data)
      ? root.data
      : []

  return rows.flatMap((value): PlatformDeal[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const row = value as HelloKumbaProduct
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const title = typeof row.name === 'string'
      ? decodeHtml(row.name).trim()
      : ''
    const price = typeof row.price === 'number'
      ? row.price
      : Number.parseFloat(String(row.price ?? ''))
    const comparePrice = typeof row.price_sell_compare === 'number'
      ? row.price_sell_compare
      : Number.parseFloat(String(row.price_sell_compare ?? ''))
    const images = Array.isArray(row.product_images)
      ? row.product_images.filter(
          (image): image is Record<string, unknown> =>
            Boolean(image) && typeof image === 'object',
        )
      : []
    const image = images.find((candidate) => candidate.is_cover === true) ?? images[0]
    const imageUrl = absoluteUrl(
      typeof image?.file_url === 'string' ? image.file_url : undefined,
      HELLO_KUMBA_ORIGIN,
    )
    const productUrl = absoluteUrl(
      `/m/hellokumba-kwese/${merchantId}/product/${encodeURIComponent(id)}`,
      HELLO_KUMBA_ORIGIN,
    )

    if (
      row.status === false ||
      !id ||
      !title ||
      !productUrl ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return []
    }

    return [{
      currencyCode: typeof row.price_currency === 'string'
        ? row.price_currency.toUpperCase()
        : 'ZAR',
      imageUrl,
      previousPriceCents:
        Number.isFinite(comparePrice) && comparePrice > price
          ? Math.round(comparePrice * 100)
          : undefined,
      priceCents: Math.round(price * 100),
      productUrl,
      promoLabel: 'Hello Kumba online catalogue',
      soldOut: row.in_stock === false,
      title,
    }]
  })
}

async function scoutHelloKumba(store: NearbyStore): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const sitemapResponse = await fetch(HELLO_KUMBA_MERCHANT_SITEMAP, {
      headers: {
        accept: 'application/xml,text/xml',
        'user-agent': BROWSER_UA,
      },
      signal: controller.signal,
    })
    if (!sitemapResponse.ok) {
      return outcome(sitemapResponse.status >= 500 ? 'transient_failure' : 'empty')
    }
    const sitemap = await readBoundedBody(sitemapResponse, MAX_BODY_BYTES)
    const merchantId = helloKumbaMerchantId(sitemap)
    if (!merchantId) {
      return outcome('empty')
    }

    const pages = await Promise.allSettled(
      Array.from({ length: HELLO_KUMBA_PRODUCT_PAGES }, async (_, index) => {
        const url = new URL(HELLO_KUMBA_PRODUCTS_API)
        url.searchParams.set('merchant_id', merchantId)
        url.searchParams.set('page', String(index + 1))
        url.searchParams.set('per_page', '100')
        const response = await fetch(url, {
          headers: {
            accept: 'application/json',
            'user-agent': BROWSER_UA,
            'x-apm-transaction-id': `trolley-scout-hello-kumba-${index + 1}`,
            'x-tenant': HELLO_KUMBA_HOST,
          },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Hello Kumba products returned ${response.status}`)
        }
        return JSON.parse(await readBoundedBody(response, MAX_BODY_BYTES)) as unknown
      }),
    )
    const products = pages
      .flatMap((page) =>
        page.status === 'fulfilled'
          ? parseHelloKumbaProducts(page.value, merchantId)
          : [],
      )
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.productUrl === product.productUrl) === index,
      )
      .slice(0, MAX_PLATFORM_DEALS)

    if (products.length === 0) {
      return outcome(
        pages.some((page) => page.status === 'rejected')
          ? 'transient_failure'
          : 'empty',
      )
    }

    const merchantUrl =
      `${HELLO_KUMBA_ORIGIN}/m/hellokumba-kwese/${merchantId}`
    return outcome(
      'success',
      products.map((product) =>
        platformDealToPromotion(store, product, merchantUrl, 'Online catalogue'),
      ),
      HELLO_KUMBA_ORIGIN,
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

async function scoutTillPoint(store: NearbyStore): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const homeResponse = await fetch(TILLPOINT_ORIGIN, {
      headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
      signal: controller.signal,
    })
    if (!homeResponse.ok) {
      return outcome(homeResponse.status >= 500 ? 'transient_failure' : 'empty')
    }
    const homeHtml = await readBoundedBody(homeResponse, MAX_BODY_BYTES)
    const entryPath =
      /<script\b[^>]*\bsrc=["']([^"']*\/_expo\/static\/js\/web\/entry-[^"']+\.js)["']/i
        .exec(homeHtml)?.[1]
    const entryUrl = absoluteUrl(entryPath, TILLPOINT_ORIGIN)
    if (!entryUrl || !sameOrigin(entryUrl, TILLPOINT_ORIGIN)) {
      return outcome('empty')
    }

    const bundleResponse = await fetch(entryUrl, {
      headers: { accept: 'application/javascript', 'user-agent': BROWSER_UA },
      signal: controller.signal,
    })
    if (!bundleResponse.ok) {
      return outcome(bundleResponse.status >= 500 ? 'transient_failure' : 'empty')
    }
    const bundle = await readBoundedBody(bundleResponse, MAX_BODY_BYTES)
    const supabaseOrigin =
      /supabaseUrl[\s\S]{0,80}?(https:\/\/[a-z0-9-]+\.supabase\.co)/i
        .exec(bundle)?.[1]
    const anonKey =
      /supabaseAnonKey[\s\S]{0,100}?(eyJ[A-Za-z0-9._-]+)/i.exec(bundle)?.[1]
    if (
      !supabaseOrigin ||
      !safeHost(supabaseOrigin)?.endsWith('.supabase.co') ||
      !anonKey
    ) {
      return outcome('empty')
    }

    const productsUrl = new URL('/rest/v1/products', supabaseOrigin)
    productsUrl.searchParams.set(
      'select',
      'id,name,slug,price,compare_at_price,stock_quantity,is_available,thumbnail,images,currency',
    )
    productsUrl.searchParams.set('is_available', 'eq.true')
    productsUrl.searchParams.set('order', 'created_at.desc')
    productsUrl.searchParams.set('limit', String(MAX_PLATFORM_DEALS))
    const productsResponse = await fetch(productsUrl, {
      headers: {
        accept: 'application/json',
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        'user-agent': BROWSER_UA,
      },
      signal: controller.signal,
    })
    if (!productsResponse.ok) {
      return outcome(productsResponse.status >= 500 ? 'transient_failure' : 'empty')
    }

    const products = parseTillPointProducts(
      JSON.parse(await readBoundedBody(productsResponse, MAX_BODY_BYTES)),
    ).slice(0, MAX_PLATFORM_DEALS)
    return products.length > 0
      ? outcome(
          'success',
          products.map((product) =>
            platformDealToPromotion(
              store,
              product,
              TILLPOINT_ORIGIN,
              'Online catalogue',
            ),
          ),
          TILLPOINT_ORIGIN,
        )
      : outcome('empty')
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

async function scoutGetMore(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const page = await fetchStorePage(GETMORE_SPECIALS_URL, env.JINA_API_KEY)
  if (page.status !== 'success' || !page.text) {
    return outcome(page.status)
  }

  const products = parseGetMoreSpecialProducts(page.text)
  return products.length > 0
    ? outcome(
        'success',
        products.map((product) =>
          platformDealToPromotion(
            store,
            product,
            GETMORE_SPECIALS_URL,
            'Special offers',
          ),
        ),
        'https://getmore.co.zw',
      )
    : outcome('empty')
}

async function scoutFourHarvests(
  env: TrolleyScoutEnv,
  store: NearbyStore,
): Promise<ScoutOutcome> {
  const salePage = await fetchStorePage(
    FOUR_HARVESTS_SALE_URL,
    env.JINA_API_KEY,
  )
  if (salePage.status !== 'success' || !salePage.text) {
    return outcome(salePage.status)
  }

  const idsText = /["']on_sale["']\s*:\s*\[([^\]]+)\]/i
    .exec(salePage.text)?.[1]
  const saleIds = (idsText ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .slice(0, MAX_PLATFORM_DEALS)
  if (saleIds.length === 0) {
    return outcome('empty')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const pageCount = Math.ceil(saleIds.length / FOUR_HARVESTS_PAGE_SIZE)
    const pages = await Promise.allSettled(
      Array.from({ length: pageCount }, async (_, currentPage) => {
        const body = new URLSearchParams({
          action: 'load_more',
          current_page: String(currentPage),
          filter_cat: '',
          is_search: '',
          layered_nav: '',
          max_price: '',
          min_price: '',
          orderby: '',
          per_page: String(FOUR_HARVESTS_PAGE_SIZE),
          s: '',
          shop_view: '',
          taxonomy: '',
          term_id: '',
        })
        for (const id of saleIds) {
          body.append('on_sale[]', id)
        }
        const response = await fetch(
          `${FOUR_HARVESTS_ORIGIN}/wp-admin/admin-ajax.php`,
          {
            body: body.toString(),
            headers: {
              accept: 'text/html',
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              referer: FOUR_HARVESTS_SALE_URL,
              'user-agent': BROWSER_UA,
              'x-requested-with': 'XMLHttpRequest',
            },
            method: 'POST',
            signal: controller.signal,
          },
        )
        if (!response.ok) {
          throw new Error(`4 Harvests sale page returned ${response.status}`)
        }
        return readBoundedBody(response, MAX_BODY_BYTES)
      }),
    )
    const products = pages
      .flatMap((page) =>
        page.status === 'fulfilled'
          ? parseFourHarvestsDeals(page.value)
          : [],
      )
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.productUrl === product.productUrl) === index,
      )
      .slice(0, MAX_PLATFORM_DEALS)

    if (products.length === 0) {
      return outcome(
        pages.some((page) => page.status === 'rejected')
          ? 'transient_failure'
          : 'empty',
      )
    }

    return outcome(
      'success',
      products.map((product) =>
        platformDealToPromotion(
          store,
          product,
          FOUR_HARVESTS_SALE_URL,
          'Online sale',
        ),
      ),
      FOUR_HARVESTS_ORIGIN,
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

export function parseFoodWorldProducts(
  payload: unknown,
  origin = 'https://foodworld.co.zw',
  promoLabel = 'Food World online catalogue',
): PlatformDeal[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((value): PlatformDeal[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const row = value as FoodWorldProduct
    const prices = row.prices && typeof row.prices === 'object'
      ? row.prices as Record<string, unknown>
      : undefined
    const title = typeof row.name === 'string' ? decodeHtml(row.name).trim() : ''
    const minorUnit = Number.parseInt(String(prices?.currency_minor_unit ?? '2'), 10)
    const rawPrice = Number.parseInt(String(prices?.price ?? ''), 10)
    const divisor = 10 ** (Number.isFinite(minorUnit) ? Math.max(0, minorUnit) : 2)
    const priceCents = Number.isFinite(rawPrice)
      ? Math.round((rawPrice / divisor) * 100)
      : Number.NaN
    const rawRegularPrice = Number.parseInt(String(prices?.regular_price ?? ''), 10)
    const previousPriceCents = Number.isFinite(rawRegularPrice)
      ? Math.round((rawRegularPrice / divisor) * 100)
      : undefined
    const permalink = typeof row.permalink === 'string'
      ? row.permalink
      : undefined
    const slug = typeof row.slug === 'string' ? row.slug.trim() : ''
    const productUrl = absoluteUrl(
      permalink || (slug ? `/product/${encodeURIComponent(slug)}/` : undefined),
      origin,
    )
    const images = Array.isArray(row.images) ? row.images : []
    const image = images.find(
      (candidate): candidate is Record<string, unknown> =>
        Boolean(candidate) && typeof candidate === 'object',
    )
    const imageUrl = absoluteUrl(
      typeof image?.src === 'string' ? image.src : undefined,
      origin,
    )
    const currencyCode = typeof prices?.currency_code === 'string'
      ? prices.currency_code.toUpperCase()
      : 'USD'

    if (!title || !productUrl || !Number.isFinite(priceCents) || priceCents <= 0) {
      return []
    }

    return [{
      currencyCode,
      imageUrl,
      previousPriceCents:
        previousPriceCents !== undefined && previousPriceCents > priceCents
          ? previousPriceCents
          : undefined,
      priceCents,
      productUrl,
      promoLabel,
      soldOut: row.is_in_stock === false,
      title,
    }]
  })
}

async function scoutZimbabweWooCommerceCatalogue(
  store: NearbyStore,
  config: { apiUrl: string; label: string; origin: string; shopUrl: string },
): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const pages = await Promise.allSettled(
      Array.from({ length: ZIMBABWE_WOOCOMMERCE_PRODUCT_PAGES }, async (_, index) => {
        const url = new URL(config.apiUrl)
        url.searchParams.set('per_page', String(ZIMBABWE_WOOCOMMERCE_PAGE_SIZE))
        url.searchParams.set('page', String(index + 1))
        url.searchParams.set(
          '_fields',
          'id,name,slug,permalink,prices,images,is_in_stock',
        )
        const response = await fetch(url, {
          headers: {
            accept: 'application/json',
            'user-agent': BROWSER_UA,
          },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Zimbabwe WooCommerce products returned ${response.status}`)
        }
        return JSON.parse(await readBoundedBody(response, MAX_BODY_BYTES)) as unknown
      }),
    )
    const products = pages
      .flatMap((page) =>
        page.status === 'fulfilled'
          ? parseFoodWorldProducts(page.value, config.origin, config.label)
          : [],
      )
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.productUrl === product.productUrl) === index,
      )
      .slice(0, MAX_ZIMBABWE_CATALOGUE_DEALS)

    if (products.length === 0) {
      return outcome(
        pages.some((page) => page.status === 'rejected')
          ? 'transient_failure'
          : 'empty',
      )
    }

    return outcome(
      'success',
      products.map((product) =>
        platformDealToPromotion(
          store,
          product,
          config.shopUrl,
          'Online catalogue',
        ),
      ),
      config.origin,
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

export function parseTeloneProducts(payload: unknown): PlatformDeal[] {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload.flatMap((value): PlatformDeal[] => {
    if (!value || typeof value !== 'object') {
      return []
    }

    const row = value as TeloneProduct
    const id = typeof row.id === 'number' || typeof row.id === 'string'
      ? String(row.id)
      : ''
    const title = typeof row.name === 'string' ? row.name.trim() : ''
    const price = typeof row.price === 'number'
      ? row.price
      : Number.parseFloat(String(row.price ?? ''))
    if (
      row.active === false ||
      !id ||
      !title ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return []
    }

    const stock = typeof row.productItemTotal === 'number'
      ? row.productItemTotal
      : Number.parseFloat(String(row.productItemTotal ?? ''))
    const imageUrl = typeof row.imageUrl === 'string' &&
        /^https?:\/\//i.test(row.imageUrl)
      ? row.imageUrl
      : undefined

    return [{
      currencyCode: 'USD',
      imageUrl,
      priceCents: Math.round(price * 100),
      productUrl: `https://${TELONE_SHOP_HOST}/product/${encodeURIComponent(id)}`,
      promoLabel: 'TelOne Digital Shop',
      soldOut: Number.isFinite(stock) ? stock <= 0 : undefined,
      title,
    }]
  })
}

async function scoutTelone(store: NearbyStore): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(TELONE_PRODUCTS_URL, {
      headers: {
        accept: 'application/json',
        origin: `https://${TELONE_SHOP_HOST}`,
        'user-agent': BROWSER_UA,
      },
      signal: controller.signal,
    })
    if (
      response.status === 408 ||
      response.status === 425 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return outcome('transient_failure')
    }
    if (!response.ok) {
      return outcome('permanent_unverified')
    }

    const products = parseTeloneProducts(
      JSON.parse(await readBoundedBody(response, MAX_BODY_BYTES)),
    )
    return products.length > 0
      ? outcome(
          'success',
          products.map((deal) =>
            platformDealToPromotion(
              store,
              deal,
              `https://${TELONE_SHOP_HOST}/store`,
              'Online catalogue',
            ),
          ),
        )
      : outcome('empty')
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

export function parseSparZimbabweProducts(html: string): PlatformDeal[] {
  const deals: PlatformDeal[] = []
  const seen = new Set<string>()
  const itemPattern =
    /<li\b[^>]*>(?=[\s\S]{0,1200}<a\b[^>]*\bid=["']Content_List_Photo_\d+["'])[\s\S]*?<\/li>/gi
  let item: RegExpExecArray | null

  while ((item = itemPattern.exec(html)) !== null) {
    const segment = item[0]
    const anchorAttributes =
      /<a\b([^>]*\bid=["']Content_List_Photo_\d+["'][^>]*)>/i.exec(segment)?.[1]
    const href = anchorAttributes
      ? attributeValue(anchorAttributes, ['href'])
      : undefined
    const productUrl = absoluteUrl(href, SPAR_ZIMBABWE_PRODUCTS_URL)
    const titleMarkup =
      /<div\b[^>]*class=["'][^"']*\blisting-details\b[^"']*["'][^>]*>\s*<p>([\s\S]*?)<\/p>/i
        .exec(segment)?.[1]
    const priceMarkup =
      /<div\b[^>]*class=["'][^"']*\bproduct-links\b[^"']*["'][^>]*>[\s\S]*?<strong>([\s\S]*?)<\/strong>/i
        .exec(segment)?.[1]
    const title = titleMarkup ? cleanText(titleMarkup) : ''
    const priceText = priceMarkup
      ? cleanText(priceMarkup.replace(/&#(?:36|x24);/gi, '$'))
      : ''
    const price = /^USD\s*\$\s*(\d+(?:\.\d{1,2})?)$/i.exec(priceText)?.[1]

    if (
      !productUrl ||
      !/^https:\/\/www\.spar\.co\.zw\/products\/[^/?#]+\/[^/?#]+/i.test(productUrl) ||
      !title ||
      !price ||
      seen.has(productUrl)
    ) {
      continue
    }

    const style = anchorAttributes
      ? attributeValue(anchorAttributes, ['style'])
      : undefined
    const imageUrl = style
      ? /background-image\s*:\s*url\(\s*["']?(https:\/\/cdn\.spar\.co\.zw\/[^)"']+)["']?\s*\)/i
          .exec(style)?.[1]
      : undefined
    const priceNumber = Number.parseFloat(price)
    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      continue
    }

    seen.add(productUrl)
    deals.push({
      currencyCode: 'USD',
      imageUrl,
      priceCents: Math.round(priceNumber * 100),
      productUrl,
      promoLabel: 'SPAR Zimbabwe online catalogue',
      title,
    })

    if (deals.length >= MAX_PLATFORM_DEALS) {
      break
    }
  }

  return deals
}

async function scoutSparZimbabwe(store: NearbyStore): Promise<ScoutOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const pages = await Promise.allSettled(
      Array.from({ length: SPAR_ZIMBABWE_PRODUCT_PAGES }, async (_, page) => {
        const url = new URL(SPAR_ZIMBABWE_PRODUCTS_URL)
        url.searchParams.set('pg', String(page))
        const response = await fetch(url, {
          headers: {
            accept: 'text/html',
            'user-agent': BROWSER_UA,
          },
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`SPAR Zimbabwe products returned ${response.status}`)
        }
        return readBoundedBody(response, MAX_BODY_BYTES)
      }),
    )
    const products = pages
      .flatMap((page) =>
        page.status === 'fulfilled'
          ? parseSparZimbabweProducts(page.value)
          : [],
      )
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.productUrl === product.productUrl) === index,
      )
      .slice(0, MAX_PLATFORM_DEALS)

    if (products.length === 0) {
      return outcome(
        pages.some((page) => page.status === 'rejected')
          ? 'transient_failure'
          : 'empty',
      )
    }

    return outcome(
      'success',
      products.map((product) =>
        platformDealToPromotion(
          store,
          product,
          SPAR_ZIMBABWE_PRODUCTS_URL,
          'Online catalogue',
        ),
      ),
      'https://www.spar.co.zw',
    )
  } catch (error) {
    return outcome(error instanceof SyntaxError ? 'empty' : 'transient_failure')
  } finally {
    clearTimeout(timeout)
  }
}

function storeMoneyText(store: NearbyStore, cents: number, currencyOverride?: string): string {
  const currencyCode = currencyOverride ?? countryFromCode(store.countryCode).currencyCode
  return currencyCode === 'ZAR'
    ? `R${(cents / 100).toFixed(2)}`
    : `${currencyCode} ${(cents / 100).toFixed(2)}`
}

async function readStorePathCursor(
  env: TrolleyScoutEnv,
  sourceKey: string,
  pathCount: number,
): Promise<{ resumable: boolean; start: number }> {
  try {
    const cursor = await readSourceCursor(env, sourceKey)

    if (!cursor) {
      return { resumable: true, start: 0 }
    }
    if (cursor.kind !== 'page') {
      return { resumable: false, start: 0 }
    }
    return { resumable: true, start: cursor.page % pathCount }
  } catch {
    // Deployments without deal_source_cursors retain the former first-slice
    // behavior until the migration is available.
    return { resumable: false, start: 0 }
  }
}

function storeSpecialsPathPlan(
  website: string,
  preferHomePage = false,
  exactPageOnly = false,
): string[] {
  try {
    const url = new URL(website)
    const exactPath = `${url.pathname || '/'}${url.search}`
    if (exactPageOnly) {
      return [exactPath]
    }
    if (exactPath !== '/' && !SPECIALS_PATHS.includes(exactPath)) {
      return [exactPath, ...SPECIALS_PATHS]
    }
  } catch {
    // The caller already validates the origin; retain the standard path plan.
  }
  // A national online storefront keeps its deals behind a shop platform rather
  // than on a printed specials page, and the platform is identified from any
  // page of the site. Its home page is the one page certain to exist, so try it
  // first — otherwise a Shopify or Magento shop spends several runs collecting
  // 404s from leaflet paths it will never have.
  if (preferHomePage) {
    return ['/', ...SPECIALS_PATHS.filter((path) => path !== '/')]
  }
  return [...SPECIALS_PATHS]
}

async function persistStorePathCursor(
  env: TrolleyScoutEnv,
  sourceKey: string,
  page: number,
  nowMs: number,
): Promise<void> {
  try {
    await writeSourceCursor(env, {
      cursor: { kind: 'page', page },
      sourceKey,
      updatedAt: new Date(nowMs).toISOString(),
    })
  } catch {
    // Cursor storage is optional for older deployments.
  }
}

// Fetches a discovered Shoprite/Checkers branch's own current specials from
// the anonymous browse-by-store API: resolve the nearest branch id from the
// store's coordinates, then read its on-promotion feed and keep only the
// products carrying a real, in-date, in-branch bonus-buy promotion.
async function scoutShopriteGroupBranch(
  store: NearbyStore,
  nowMs: number,
): Promise<ScoutOutcome> {
  const config = store.retailerId ? SHOPRITE_GROUP_CHAINS[store.retailerId] : undefined
  if (
    !config ||
    /\bliquor(?:\s*shop)?\b/i.test(store.name) ||
    !Number.isFinite(store.lat) ||
    !Number.isFinite(store.lon)
  ) {
    return outcome('permanent_unverified')
  }

  const location = storesByLocationRequest(config.host, store.lat, store.lon)
  const stores = await fetchShopriteGroupJson(location.url, location.body)
  if (stores.status !== 'success') {
    return outcome(stores.status)
  }
  const storeId = selectNearestBranchId(stores.json, config, store.name)
  if (!storeId) {
    return outcome('permanent_unverified')
  }

  const promoRequest = onPromotionRequest(config.host, storeId)
  const feed = await fetchShopriteGroupJson(promoRequest.url, promoRequest.body)
  if (feed.status !== 'success') {
    return outcome(feed.status)
  }

  const promotions = parseShopriteGroupPromotions(config.host, storeId, feed.json, nowMs)
    .map((promotion) => shopriteGroupToStorePromotion(store, promotion))
  return promotions.length > 0 ? outcome('success', promotions) : outcome('empty')
}

function shopriteGroupToStorePromotion(
  store: NearbyStore,
  promotion: ShopriteGroupPromotion,
): StorePromotion {
  return {
    id: `${store.placeId}-sg-${hashString(promotion.title + promotion.productUrl)}`,
    imageUrl: promotion.imageUrl,
    kind: 'deal',
    placeId: store.placeId,
    previousPriceText: promotion.previousPriceText,
    priceText: promotion.priceText,
    productUrl: promotion.productUrl,
    retailerId: store.retailerId,
    savingText: promotion.savingText,
    sourceUrl: promotion.productUrl,
    storeName: store.name,
    title: promotion.title,
    validFrom: promotion.validFrom,
    validTo: promotion.validTo,
  }
}

async function fetchShopriteGroupJson(
  url: string,
  body: string,
): Promise<{ status: StoreScoutOutcomeStatus; json?: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      body,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': BROWSER_UA,
      },
      method: 'POST',
      signal: controller.signal,
    })
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      return { status: 'transient_failure' }
    }
    if (!response.ok) {
      return { status: 'permanent_unverified' }
    }
    const text = await readBoundedBody(response, MAX_BODY_BYTES)
    return { json: JSON.parse(text) as unknown, status: 'success' }
  } catch {
    return { status: 'transient_failure' }
  } finally {
    clearTimeout(timeout)
  }
}

async function scoutSparBranch(store: NearbyStore, nowMs: number): Promise<ScoutOutcome> {
  const query = sparSearchTerm(store)
  const searchUrl = `${SPAR_ORIGIN}/stores/search?${new URLSearchParams({
    back: '/specials',
    query,
  }).toString()}`
  const search = await fetchText(searchUrl)

  if (search.status !== 'success' || !search.text) {
    return outcome(search.status)
  }

  const selections = extractSparSelections(search.text, searchUrl)
  const selected = bestSparSelection(selections, store)
  if (!selected) {
    return outcome('permanent_unverified')
  }

  const selection = await fetchText(selected.url, undefined, false, true)
  if (selection.status !== 'success' || !selection.headers) {
    return outcome(selection.status)
  }

  const cookie = responseCookieHeader(selection.headers)
  if (!cookie) {
    return outcome('permanent_unverified')
  }

  const specialsUrl = `${SPAR_ORIGIN}/specials`
  const specials = await fetchText(specialsUrl, { cookie })
  if (specials.status !== 'success' || !specials.text) {
    return outcome(specials.status)
  }

  const links = extractSparSpecialLinks(specials.text, specialsUrl)
  if (links.length === 0) {
    return outcome('empty')
  }

  const dates = extractValidDates(
    stripHtml(specials.text).slice(0, 30_000),
    new Date(nowMs).getUTCFullYear(),
  )
  const promotions = links.map(({ title, url, uuid }, index): StorePromotion => ({
    id: `${store.placeId}-spar-${uuid}`,
    imageUrl: `https://www.spar.co.za/getattachment/${uuid}/img`,
    kind: 'catalogue',
    placeId: store.placeId,
    productUrl: url,
    retailerId: store.retailerId,
    sourceUrl: url,
    storeName: store.name,
    title: title || `${store.name} specials ${index + 1}`,
    validFrom: dates.validFrom,
    validTo: dates.validTo,
  }))

  return outcome('success', promotions)
}

function sparSearchTerm(store: NearbyStore): string {
  const branch = store.name
    .replace(/\b(?:kwik|super)?spar\b|\bsave\s?mor\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return branch || cityFromAddress(store.address ?? '') || store.name
}

function extractSparSelections(html: string, baseUrl: string) {
  const selections: Array<{ label: string; url: string }> = []
  const seen = new Set<string>()
  const pattern = /<a\b[^>]*href=["']([^"']*\/stores\/\d+\/select\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null && selections.length < 50) {
    const url = absoluteUrl(decodeHtml(match[1]), baseUrl)
    if (!url || !sameOrigin(url, SPAR_ORIGIN) || seen.has(url)) {
      continue
    }
    seen.add(url)
    selections.push({ label: cleanText(match[2]), url })
  }
  return selections
}

function bestSparSelection(
  selections: Array<{ label: string; url: string }>,
  store: NearbyStore,
): { label: string; url: string } | undefined {
  const target = normalizeWords(`${store.name} ${store.address ?? ''}`)
  const branchTokens = meaningfulTokens(store.name)

  const ranked = selections
    .map((selection, index) => {
      const label = normalizeWords(selection.label)
      const tokenScore = branchTokens.filter((token) => label.includes(token)).length * 20
      const exactBonus = label.includes(normalizeWords(store.name)) ? 100 : 0
      const contextBonus = meaningfulTokens(selection.label)
        .filter((token) => target.includes(token)).length
      return { index, score: exactBonus + tokenScore + contextBonus, selection }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]

  return ranked && ranked.score > 0 ? ranked.selection : undefined
}

function extractSparSpecialLinks(html: string, baseUrl: string) {
  const links: Array<{ title: string; url: string; uuid: string }> = []
  const seen = new Set<string>()
  const pattern = /<a\b[^>]*href=["']([^"']*\/specials\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/show(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = pattern.exec(html)) !== null && links.length < MAX_PROMOTIONS_PER_PAGE) {
    const uuid = match[2].toLowerCase()
    const url = absoluteUrl(decodeHtml(match[1]), baseUrl)
    if (!url || !sameOrigin(url, SPAR_ORIGIN) || seen.has(uuid)) {
      continue
    }
    seen.add(uuid)
    links.push({ title: cleanText(match[3]), url, uuid })
  }
  return links
}

function responseCookieHeader(headers: Headers): string | undefined {
  const cookieHeaders = typeof (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie ===
      'function'
    ? (headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
    : [headers.get('set-cookie') ?? '']
  const cookies = new Map<string, string>()

  for (const header of cookieHeaders) {
    const pattern = /(?:^|,\s*)([!#$%&'*+.^_`|~0-9A-Za-z-]+)=([^;,\r\n]*)/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(header)) !== null) {
      const name = match[1]
      const value = match[2].trim()
      if (value && !hasUnsafeCookieCharacter(value)) {
        cookies.set(name, `${name}=${value}`)
      }
    }
  }

  return cookies.size > 0 ? [...cookies.values()].join('; ') : undefined
}

function hasUnsafeCookieCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function extractPublicStoreDeals(
  store: NearbyStore,
  html: string,
  sourceUrl: string,
  nowMs: number,
): StorePromotion[] {
  const records = [
    ...embeddedRecords(html),
    ...(store.sourceCategory === 'network-provider'
      ? visibleNetworkPlanRecords(html)
      : []),
    ...visibleProductRecords(html),
  ]
  const promotions: StorePromotion[] = []
  const seen = new Map<string, number>()
  const promotionalPath = isPromotionPath(sourceUrl)

  for (const product of records) {
    const copy = recordValue(product.copy)
    const prices = recordValue(product.prices)
    const pdpUrl = recordValue(product.pdpUrl)
    const colorwayImages = recordValue(product.colorwayImages)
    const title = stringValue(
      product.name ??
        product.title ??
        product.productName ??
        product.displayName ??
        copy?.title,
    )
    const offer = firstOffer(product.offers ?? product.offer)
    const price = firstNumber(
      product.specialPrice,
      product.special_price,
      product.salePrice,
      product.sale_price,
      product.currentPrice,
      product.current_price,
      product.sellingPrice,
      product.selling_price,
      product.promoPrice,
      product.promo_price,
      product.discountedPrice,
      product.discounted_price,
      prices?.currentPrice,
      offer?.price,
      offer?.lowPrice,
      product.price,
    )
    const previousPrice = firstNumber(
      product.previousPrice,
      product.previous_price,
      product.oldPrice,
      product.old_price,
      product.listPrice,
      product.list_price,
      product.retailPrice,
      product.retail_price,
      product.regularPrice,
      product.regular_price,
      product.wasPrice,
      product.was_price,
      product.compareAtPrice,
      product.compare_at_price,
      product.originalPrice,
      product.original_price,
      product.mrp,
      prices?.initialPrice,
      offer?.highPrice,
    )

    if (
      !title ||
      price === undefined ||
      !hasExplicitPromotionProof(product, offer, price, previousPrice)
    ) {
      continue
    }

    const productUrl = absoluteUrl(
      stringValue(
        product.url ??
          product.productUrl ??
          product.product_url ??
          product.canonicalUrl ??
          product.canonical_url ??
          product.permalink ??
          product.link ??
          pdpUrl?.url ??
          offer?.url,
      ),
      sourceUrl,
    )
    const key = `${title.toLowerCase()}::${productUrl ?? sourceUrl}`
    const soldOut = explicitlySoldOut(product, offer)

    const existingIndex = seen.get(key)
    if (existingIndex !== undefined) {
      if (soldOut) {
        promotions[existingIndex].soldOut = true
      }
      continue
    }

    seen.set(key, promotions.length)
    const validFrom = dateValue(
      product.validFrom ??
        product.valid_from ??
        product.startDate ??
        product.start_date ??
        product.promotionStart ??
        product.promotion_start ??
        offer?.validFrom,
    )
    const validTo = dateValue(
      product.validTo ??
        product.valid_to ??
        product.endDate ??
        product.end_date ??
        product.promotionEnd ??
        product.promotion_end ??
        offer?.priceValidUntil ??
        offer?.validTo,
    )
    const currency = stringValue(
      product.priceCurrency ??
        product.price_currency ??
        product.currencyCode ??
        product.currency_code ??
        product.currency ??
        offer?.priceCurrency,
    ) ?? countryFromCode(store.countryCode).currencyCode
    const savingAmount = firstNumber(
      product.discountAmount,
      product.discount_amount,
      product.savingAmount,
      product.saving_amount,
      previousPrice !== undefined && previousPrice > price ? previousPrice - price : undefined,
    )
    const explicitSaving = stringValue(
      product.savingText ??
        product.saving_text ??
        product.discountText ??
        product.discount_text ??
        offer?.savingText,
    )
    promotions.push({
      id: `${store.placeId}-product-${hashString(key)}`,
      imageUrl: absoluteUrl(
        imageValue(
          product.image ??
            product.imageUrl ??
            product.image_url ??
            product.thumbnailUrl ??
            product.thumbnail_url ??
            product.thumbnail ??
            product.primaryImage ??
            product.primary_image ??
            colorwayImages?.portraitURL ??
            offer?.image,
        ),
        sourceUrl,
      ),
      kind: 'deal',
      placeId: store.placeId,
      previousPriceText: previousPrice !== undefined
        ? formatPrice(previousPrice, currency)
        : undefined,
      priceText: formatPrice(price, currency),
      productUrl: productUrl ?? sourceUrl,
      retailerId: store.retailerId,
      savingText: explicitSaving ?? (savingAmount !== undefined && savingAmount > 0
        ? formatSaving(savingAmount, currency)
        : undefined),
      ...(soldOut ? { soldOut: true } : {}),
      sourceUrl,
      storeName: store.name,
      title,
      validTo,
      validFrom: validFrom ?? (promotionalPath
        ? new Date(nowMs).toISOString().slice(0, 10)
        : undefined),
    })

    if (promotions.length >= MAX_PROMOTIONS_PER_PAGE) {
      break
    }
  }

  return promotions
}

function visibleProductRecords(html: string): Record<string, unknown>[] {
  const starts = Array.from(html.matchAll(
    /<(article|li|div|a)\b([^>]*(?:itemtype\s*=\s*["'][^"']*schema\.org\/Product[^"']*["']|data-product-(?:id|name|sku)\s*=|data-testid\s*=\s*["'][^"']*product-tile[^"']*["']|id\s*=\s*["']product-card-[^"']*["']|class\s*=\s*["'][^"']*\b(?:(?:product|deal|promo)-card|product-tile)\b[^"']*["'])[^>]*)>/gi,
  )).slice(0, 120)
  const records: Record<string, unknown>[] = []

  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index]
    const start = match.index ?? 0
    const nextStart = starts[index + 1]?.index ?? html.length
    const segment = html.slice(start, Math.min(nextStart, start + 30_000))
    const attributes = match[2] ?? ''
    const name = visibleItemPropValue(segment, 'name', ['content', 'data-product-name']) ??
      visibleClassText(segment, /(?:product[-_ ]?(?:name|title)|item[-_ ]?title)/i) ??
      attributeValue(attributes, ['data-product-name', 'data-name']) ??
      visibleHeadingText(segment) ??
      visibleProductLabel(segment)
    const priceText = visibleItemPropValue(segment, 'price', ['content', 'value']) ??
      visibleClassText(segment, /(?:sale|special|current|deal)[-_ ]?price|font-jakarta-800/i) ??
      attributeValue(attributes, ['data-sale-price', 'data-special-price', 'data-price']) ??
      accessiblePrice(segment, 'current')
    const price = numberValue(priceText)

    if (!name || price === undefined) {
      continue
    }

    const previousPriceText = visibleClassText(
      segment,
      /(?:was|old|regular|previous|list|original)[-_ ]?price|line-through/i,
    ) ?? attributeValue(attributes, [
      'data-old-price',
      'data-regular-price',
      'data-previous-price',
      'data-was-price',
    ]) ?? accessiblePrice(segment, 'original')
    const promotionText = visibleClassText(
      segment,
      /(?:promo|promotion|deal|discount|saving|special)[-_ ]?(?:badge|label|text)?/i,
    ) ?? attributeValue(attributes, ['data-promotion', 'data-promotion-id', 'data-promo-id'])
    records.push({
      currentPrice: price,
      image: visibleItemPropValue(segment, 'image', ['src', 'data-src', 'content']) ??
        visibleImageUrl(segment),
      name,
      previousPrice: numberValue(previousPriceText),
      priceCurrency: visibleItemPropValue(segment, 'priceCurrency', ['content', 'value']),
      productUrl: visibleItemPropValue(segment, 'url', ['href', 'content']) ??
        visibleProductUrl(segment),
      promotionText,
      ...(visibleSoldOut(segment) ? { soldOut: true } : {}),
      validTo: visibleItemPropValue(segment, 'priceValidUntil', ['content', 'datetime']),
    })
  }

  return records
}

function explicitlySoldOut(
  product: Record<string, unknown>,
  offer?: Record<string, unknown>,
): boolean {
  const variants = Array.isArray(product.variants)
    ? product.variants.filter(
      (variant): variant is Record<string, unknown> => recordValue(variant) !== undefined,
    )
    : []
  if (variants.length > 0) {
    const availability = variants.map(explicitAvailability)
    if (availability.every((value) => value === false)) {
      return true
    }
    if (availability.some((value) => value === true || value === undefined)) {
      return false
    }
  }

  return explicitAvailability(product) === false ||
    (offer !== undefined && explicitAvailability(offer) === false)
}

function explicitAvailability(record: Record<string, unknown>): boolean | undefined {
  if (record.soldOut === true || record.isSoldOut === true || record.is_sold_out === true) {
    return false
  }
  const statedBoolean = [
    record.available,
    record.availableForSale,
    record.isAvailable,
    record.inStock,
    record.is_in_stock,
  ].find((value) => typeof value === 'boolean')
  if (typeof statedBoolean === 'boolean') {
    return statedBoolean
  }

  const status = stringValue(
    record.availability ??
      record.availabilityStatus ??
      record.inventoryStatus ??
      record.stockStatus ??
      record.stock_status,
  )
  if (!status) {
    return undefined
  }
  if (/(?:out[-_\s]?of[-_\s]?stock|sold[-_\s]?out|unavailable|not[-_\s]?available)/i.test(status)) {
    return false
  }
  if (/(?:^|[/#:_\s-])(?:in[-_\s]?stock|available)(?:$|[/#:_\s-])/i.test(status)) {
    return true
  }
  return undefined
}

function visibleSoldOut(segment: string): boolean {
  return /\b(?:sold\s*out|out\s*of\s*stock|currently\s*unavailable)\b/i.test(
    cleanText(segment),
  )
}

const NETWORK_PLAN_SIGNAL =
  /\b(?:airtime|broadband|bundle|calls?|contract|data|fibre|fiber|internet|minutes?|mobile|month(?:ly)?|month-to-month|phone|postpaid|prepaid|roaming|sim|unlimited|wi-?fi)\b|\b\d+(?:\.\d+)?\s*(?:gb|gbps|mb|mbps|tb)\b/i
const GENERIC_NETWORK_TITLE =
  /^(?:all\s+)?(?:broadband|deals?|mobile|offers?|packages?|phone\s+deals?|plans?|products?|shop)$/i

// Carrier pages sell plans and device contracts. Their current monthly price
// is the offer, so a struck-through supermarket-style “was” price is uncommon.
// This parser is enabled only for the country-scoped provider registry.
function visibleNetworkPlanRecords(html: string): Record<string, unknown>[] {
  const candidates: Array<{ index: number; segment: string }> = []
  const cardStarts = Array.from(html.matchAll(
    /<(?:article|li|section|div|a)\b[^>]{0,3000}\b(?:class|data-testid|id)\s*=\s*["'][^"']*\b(?:bundle|deal|device|offer|package|plan|product|tariff)(?:[-_ ]?(?:card|item|tile))?\b[^"']*["'][^>]*>/gi,
  )).slice(0, 160)

  for (let index = 0; index < cardStarts.length; index += 1) {
    const start = cardStarts[index].index ?? 0
    const next = cardStarts[index + 1]?.index ?? html.length
    candidates.push({
      index: start,
      segment: html.slice(start, Math.min(next, start + 24_000)),
    })
  }

  // Some provider home pages use plain layout sections with a heading, price,
  // and link. Heading windows cover those without assuming a framework class.
  const headings = Array.from(html.matchAll(/<h[2-4]\b[^>]*>[\s\S]{0,600}?<\/h[2-4]>/gi))
    .slice(0, 160)
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index ?? 0
    const next = headings[index + 1]?.index ?? html.length
    candidates.push({
      index: start,
      segment: html.slice(start, Math.min(next, start + 8_000)),
    })
  }

  candidates.sort((left, right) => left.index - right.index)
  const records: Record<string, unknown>[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const record = networkPlanRecord(candidate.segment)
    if (!record) continue
    const key = `${record.name ?? ''}::${record.productUrl ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push(record)
    if (records.length >= MAX_PROMOTIONS_PER_PAGE) break
  }

  return records
}

function networkPlanRecord(segment: string): Record<string, unknown> | undefined {
  const text = cleanText(segment)
  if (!NETWORK_PLAN_SIGNAL.test(text)) return undefined

  const rawTitle =
    visibleHeadingText(segment) ??
    attributeValue(segment.slice(0, 3_000), [
      'data-product-name',
      'data-plan-name',
      'aria-label',
      'data-name',
    ]) ??
    visibleProductLabel(segment)
  const title = cleanNetworkPlanTitle(rawTitle)
  const price = networkPlanPrice(text)

  if (!title || !price || GENERIC_NETWORK_TITLE.test(title)) {
    return undefined
  }

  return {
    currentPrice: price.amount,
    image: visibleImageUrl(segment),
    name: title,
    priceCurrency: price.currency,
    productUrl: visibleProductUrl(segment),
    promotionText: 'Official network offer',
  }
}

function cleanNetworkPlanTitle(value: string | undefined): string | undefined {
  const title = cleanText(value ?? '')
    .replace(/^(?:explore|shop|view)(?:\s+(?:deal|details?|offer|plan))?\s+/i, '')
    .replace(
      /\s+(?:from\s+)?(?:R|ZAR|US\$|CA\$|A\$|NZ\$|\$|\u00A3|\u20AC|\u20B9|\u20A6|N\$|KES|KSh|GHS|GH\u20B5|AED|SAR|RM|\u20B1|PHP|Rp|IDR|\u00A5|JPY|R\$|MX\$|AR\$|CLP|COP|S\/)\s*[\d.,\s]+.*$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
  return title.length >= 3 && title.length <= 140 ? title : undefined
}

function networkPlanPrice(
  value: string,
): { amount: number; currency?: string } | undefined {
  const match =
    /(?:\bfrom\s+)?(ZAR|US\$|CA\$|A\$|NZ\$|R\$|MX\$|AR\$|N\$|KES|KSh|GHS|GH\u20B5|AED|SAR|RM|PHP|IDR|JPY|CLP|COP|S\/|R|\$|\u00A3|\u20AC|\u20B9|\u20A6|\u20B1|Rp|\u00A5)\s*([\d][\d\s.,]*)/i
      .exec(value)
  const amount = numberValue(match?.[2])
  if (!match || amount === undefined) return undefined

  const token = match[1].toUpperCase()
  const currencies: Record<string, string> = {
    '\u00A3': 'GBP',
    '\u00A5': 'JPY',
    '\u20AC': 'EUR',
    '\u20B1': 'PHP',
    '\u20B5': 'GHS',
    '\u20B9': 'INR',
    '\u20A6': 'NGN',
    '$': 'USD',
    'A$': 'AUD',
    'AED': 'AED',
    'AR$': 'ARS',
    'CA$': 'CAD',
    'CLP': 'CLP',
    'COP': 'COP',
    'GH\u20B5': 'GHS',
    'GHS': 'GHS',
    'IDR': 'IDR',
    'JPY': 'JPY',
    'KES': 'KES',
    'KSH': 'KES',
    'MX$': 'MXN',
    'N$': 'NAD',
    'NZ$': 'NZD',
    'PHP': 'PHP',
    'R': 'ZAR',
    'R$': 'BRL',
    'RM': 'MYR',
    'RP': 'IDR',
    'S/': 'PEN',
    'SAR': 'SAR',
    'US$': 'USD',
    'ZAR': 'ZAR',
  }

  return { amount, currency: currencies[token] }
}

function visibleItemPropValue(
  segment: string,
  property: string,
  preferredAttributes: string[],
): string | undefined {
  const tagPattern = /<[^>]{1,2000}>/g
  let match: RegExpExecArray | null

  while ((match = tagPattern.exec(segment)) !== null) {
    const tag = match[0]
    const itemProp = attributeValue(tag, ['itemprop'])
    if (!itemProp?.split(/\s+/).some((value) => value.toLowerCase() === property.toLowerCase())) {
      continue
    }
    const attribute = attributeValue(tag, preferredAttributes)
    if (attribute) {
      return decodeHtml(attribute).trim()
    }
    const tagName = /^<([a-z0-9]+)/i.exec(tag)?.[1]
    const closingAt = tagName
      ? segment.toLowerCase().indexOf(`</${tagName.toLowerCase()}>`, tagPattern.lastIndex)
      : -1
    const textEnd = closingAt >= 0
      ? Math.min(closingAt, tagPattern.lastIndex + 500)
      : tagPattern.lastIndex + 500
    const text = cleanText(segment.slice(tagPattern.lastIndex, textEnd))
    if (text) {
      return text
    }
  }
  return undefined
}

function attributeValue(value: string, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(
      `\\b${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`,
      'i',
    )
    const match = pattern.exec(value)
    const result = match?.[1] ?? match?.[2]
    if (result?.trim()) {
      return result.trim()
    }
  }
  return undefined
}

function visibleClassText(segment: string, classPattern: RegExp): string | undefined {
  const pattern = /<([a-z0-9]+)\b([^>]*\bclass\s*=\s*["'][^"']+["'][^>]*)>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment)) !== null) {
    const className = attributeValue(match[2], ['class'])
    if (className && classPattern.test(className)) {
      const closingAt = segment.toLowerCase().indexOf(
        `</${match[1].toLowerCase()}>`,
        pattern.lastIndex,
      )
      const text = cleanText(segment.slice(
        pattern.lastIndex,
        closingAt >= 0 ? Math.min(closingAt, pattern.lastIndex + 800) : pattern.lastIndex + 800,
      ))
      if (text) {
        return text
      }
    }
    classPattern.lastIndex = 0
  }
  return undefined
}

function visibleImageUrl(segment: string): string | undefined {
  const image = /<img\b([^>]*)>/i.exec(segment)
  return image ? attributeValue(image[1], ['src', 'data-src']) : undefined
}

function visibleProductUrl(segment: string): string | undefined {
  const link = /<a\b([^>]*)>/i.exec(segment)
  return link ? attributeValue(link[1], ['href']) : undefined
}

function embeddedRecords(html: string): Record<string, unknown>[] {
  const roots: unknown[] = []
  const nextData = /<script\b[^>]*\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
    .exec(html)?.[1]
  if (nextData && nextData.length <= MAX_EMBEDDED_TOTAL_BYTES) {
    pushParsedJson(roots, nextData)
  }
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  let scriptCount = 0
  let totalBytes = 0

  while (
    (match = scriptPattern.exec(html)) !== null &&
    scriptCount < MAX_EMBEDDED_SCRIPTS &&
    totalBytes < MAX_EMBEDDED_TOTAL_BYTES
  ) {
    scriptCount += 1
    const attributes = match[1]
    const body = match[2].slice(0, MAX_EMBEDDED_SCRIPT_BYTES)
    totalBytes += body.length
    const isJsonScript = /type\s*=\s*["'](?:application\/ld\+json|application\/json)["']/i
      .test(attributes)

    if (isJsonScript) {
      pushParsedJson(roots, body)
    }

    for (const marker of ['window.__INITIAL_STATE__', 'window.__NUXT__', 'window.__STATE__']) {
      let markerAt = body.indexOf(marker)
      while (markerAt >= 0) {
        const equalsAt = body.indexOf('=', markerAt + marker.length)
        if (equalsAt < 0) {
          break
        }
        const json = balancedJson(body, equalsAt + 1)
        if (json) {
          pushParsedJson(roots, json)
        }
        markerAt = body.indexOf(marker, equalsAt + 1)
      }
    }
  }

  const attributePattern =
    /\s[:@]?[a-z][\w:-]*(?:data|state|result|products?|catalog|items?|listing|promotions?|collections?)[\w:-]*\s*=\s*(["'])([\s\S]*?)\1/gi
  let attributeMatch: RegExpExecArray | null
  let attributeCount = 0

  while (
    (attributeMatch = attributePattern.exec(html)) !== null &&
    attributeCount < 8 &&
    totalBytes < MAX_EMBEDDED_TOTAL_BYTES
  ) {
    const body = decodeJsonAttribute(attributeMatch[2]).trim()
    if (
      (body.startsWith('{') || body.startsWith('[')) &&
      body.length <= MAX_EMBEDDED_ATTRIBUTE_BYTES &&
      totalBytes + body.length <= MAX_EMBEDDED_TOTAL_BYTES
    ) {
      attributeCount += 1
      totalBytes += body.length
      pushParsedJson(roots, body)
    }
  }

  const records: Record<string, unknown>[] = []
  const seen = new WeakSet<object>()
  let visited = 0

  const walk = (value: unknown): void => {
    if (visited >= MAX_EMBEDDED_NODES || !value) {
      return
    }
    if (typeof value === 'string') {
      const candidate = value.trim()
      if (
        candidate.length <= MAX_EMBEDDED_SCRIPT_BYTES &&
        (candidate.startsWith('{') || candidate.startsWith('['))
      ) {
        try {
          walk(JSON.parse(candidate))
        } catch {
          // Public page state can contain display copy that resembles JSON.
        }
      }
      return
    }
    if (typeof value !== 'object') {
      return
    }
    if (seen.has(value as object)) {
      return
    }
    seen.add(value as object)
    visited += 1

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item)
      }
      return
    }

    const record = value as Record<string, unknown>
    records.push(record)
    for (const nested of Object.values(record)) {
      walk(nested)
    }
  }

  for (const root of roots) {
    walk(root)
  }
  return records
}

function visibleHeadingText(segment: string): string | undefined {
  const match = /<h[2-4]\b[^>]*>([\s\S]{0,800}?)<\/h[2-4]>/i.exec(segment)
  const text = match ? cleanText(match[1]) : ''
  return text || undefined
}

function visibleProductLabel(segment: string): string | undefined {
  const link = /<a\b([^>]*)>/i.exec(segment)
  const label = link ? attributeValue(link[1], ['aria-label']) : undefined
  return label?.replace(/^view\s+/i, '').trim() || undefined
}

function accessiblePrice(
  segment: string,
  kind: 'current' | 'original',
): string | undefined {
  const pattern = new RegExp(
    `<[^>]+aria-label=["'][^"']*${kind}\\s+price\\s+([^"']+)["'][^>]*>`,
    'i',
  )
  return pattern.exec(segment)?.[1]?.trim()
}

export function extractPromotionDetailUrls(
  html: string,
  pageUrl: string,
  officialOrigin: string,
  limit = 2,
): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const anchorPattern = /<a\b([^>]{0,4000})>([\s\S]{0,1200}?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = anchorPattern.exec(html)) !== null && urls.length < limit) {
    const href = attributeValue(match[1] ?? '', ['href'])
    const url = absoluteUrl(href, pageUrl)
    if (
      !url ||
      url === pageUrl ||
      seen.has(url) ||
      !sameOrigin(url, officialOrigin) ||
      /\.pdf(?:$|[?#])/i.test(url) ||
      !looksLikePromotionSignal(`${href ?? ''} ${cleanText(match[2] ?? '')}`)
    ) {
      continue
    }
    seen.add(url)
    urls.push(url)
  }

  return urls
}

function decodeJsonAttribute(value: string): string {
  return value
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function pushParsedJson(target: unknown[], value: string): void {
  try {
    target.push(JSON.parse(value.trim()))
  } catch {
    // Public pages frequently contain one malformed script among valid ones.
  }
}

function balancedJson(value: string, startAt: number): string | undefined {
  let start = startAt
  while (start < value.length && /\s/.test(value[start])) {
    start += 1
  }
  const opener = value[start]
  if (opener !== '{' && opener !== '[') {
    return undefined
  }

  const stack: string[] = []
  let escaped = false
  let inString = false

  for (let index = start; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{' || character === '[') {
      stack.push(character)
      continue
    }
    if (character === '}' || character === ']') {
      const expected = character === '}' ? '{' : '['
      if (stack.pop() !== expected) {
        return undefined
      }
      if (stack.length === 0) {
        return value.slice(start, index + 1)
      }
    }
  }
  return undefined
}

function hasExplicitPromotionProof(
  product: Record<string, unknown>,
  offer: Record<string, unknown> | undefined,
  price: number,
  previousPrice: number | undefined,
): boolean {
  if (previousPrice !== undefined && previousPrice > price) {
    return true
  }
  const discount = firstNumber(
    product.discountAmount,
    product.discount_amount,
    product.savingAmount,
    product.saving_amount,
    product.discountPercent,
    product.discount_percent,
    product.discountPercentage,
    product.discount_percentage,
    offer?.discountAmount,
  )
  if (discount !== undefined && discount > 0) {
    return true
  }
  if (stringValue(
    product.promotionId ??
      product.promotion_id ??
      product.promoId ??
      product.promo_id ??
      product.promotionCode ??
      product.promotion_code ??
      product.dealId ??
      product.deal_id ??
      product.campaignId ??
      product.campaign_id ??
      offer?.promotionId,
  )) {
    return true
  }
  if (stringValue(
    product.promotionText ??
      product.promotion_text ??
      product.promoText ??
      product.promo_text ??
      product.discountText ??
      product.discount_text ??
      product.savingText ??
      product.saving_text ??
      offer?.promotionText,
  )) {
    return true
  }
  if (
    product.isOnSale === true ||
    product.is_on_sale === true ||
    product.isOnSale === 1 ||
    product.is_on_sale === 1 ||
    (Array.isArray(product.promotions) && product.promotions.length > 0)
  ) {
    return true
  }
  return Boolean(
    dateValue(
      product.validFrom ??
        product.valid_from ??
        product.startDate ??
        product.start_date ??
        product.promotionStart ??
        product.promotion_start ??
        offer?.validFrom,
    ) ||
      dateValue(
        product.validTo ??
          product.valid_to ??
          product.endDate ??
          product.end_date ??
          product.promotionEnd ??
          product.promotion_end ??
          offer?.priceValidUntil ??
          offer?.validTo,
      ),
  )
}

function firstOffer(value: unknown): Record<string, unknown> | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item && typeof item === 'object' ? (item as Record<string, unknown>) : undefined
}

function imageValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return imageValue(value[0])
  }

  if (value && typeof value === 'object') {
    const image = value as Record<string, unknown>
    return stringValue(
      image.url ??
        image.src ??
        image.imageUrl ??
        image.contentUrl ??
        image.cdn_path,
    )
  }

  return stringValue(value)
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return typeof value === 'number' ? String(value) : undefined
}

function numberValue(value: unknown): number | undefined {
  const normalized = typeof value === 'string'
    ? value.replace(/[^0-9.,-]/g, '').replace(',', '.')
    : value
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = numberValue(value)
    if (number !== undefined) {
      return number
    }
  }
  return undefined
}

function dateValue(value: unknown): string | undefined {
  const text = stringValue(value)
  const match = text?.match(/^\d{4}-\d{2}-\d{2}/)
  return match?.[0]
}

function absoluteUrl(value: string | undefined, base: string): string | undefined {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function formatPrice(price: number, currency: string | undefined): string {
  const amount = Number.isInteger(price) ? price.toFixed(0) : price.toFixed(2)
  return currency?.toUpperCase() === 'ZAR' || !currency ? `R${amount}` : `${currency} ${amount}`
}

function formatSaving(saving: number, currency: string | undefined): string {
  return currency?.toUpperCase() === 'ZAR' || !currency
    ? `Save R${saving.toFixed(2)}`
    : `Save ${currency} ${saving.toFixed(2)}`
}

function leafletToPromotion(store: NearbyStore, leaflet: StoreLeaflet): StorePromotion {
  return {
    id: `${store.placeId}-${leaflet.id}`,
    imageUrl: leaflet.imageUrl,
    kind: 'catalogue',
    placeId: store.placeId,
    productUrl: leaflet.documentUrl ?? leaflet.url,
    retailerId: store.retailerId,
    sourceUrl: leaflet.url,
    storeName: store.name,
    title: leaflet.name,
    validFrom: leaflet.validFrom,
    validTo: leaflet.validTo,
  }
}

// A catalogue has to look like a catalogue. A PDF (or a trusted flipbook host)
// is a strong signal by shape and only has to belong to this store. A bare page
// image is a weak one: every scouted page also carries the shop's logo, social
// graphics and decorative photos, and those were being stored — and titled from
// their filename — as if a shopper could shop from them.
const MAX_OFFICIAL_LEAFLETS = 8
// Judge more candidates than we keep. Junk images used to fill the extractor's
// fixed budget and crowd out a real leaflet before it was ever looked at.
const OFFICIAL_LEAFLET_SCAN_LIMIT = 24
const MAX_SCANNED_IMAGE_TAGS = 400
const MAX_SCANNED_HEADINGS = 40
// A catalogue page is a big image. A declared 60x60 or 300x300 box is a tile,
// a badge or a thumbnail.
const MIN_CATALOGUE_IMAGE_EDGE = 400

const IMAGE_DOCUMENT_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|\?)/i

// Brand marks, page chrome and UI furniture: never a shopper catalogue.
const NON_CATALOGUE_IMAGE_PATTERN =
  /(?:^|[^a-z])(?:logos?|brand(?:mark)?|icons?|favicon|header|footer|banner[-_]?sprite|sprites?|placeholder|spinner|loader|avatar|profile|watermark|badge|thumb(?:nail)?)(?:[^a-z]|$)/i

// Image-CDN artefacts: mod_pagespeed rewrites, and the -300x300 / _768x770 size
// suffix a CMS appends to a DERIVED thumbnail — never to an original catalogue
// page. Their presence is proof the file is a resized copy of something else.
const DERIVED_IMAGE_PATTERN = /\.pagespeed\.|[-_.]\d{2,4}x\d{2,4}(?=[-_.]|$)/i

// Filename noise to ignore when asking "is this file just the shop's name?",
// so WordPress's "cropped-cropped-saimart.png" is still recognised as the logo.
const IMAGE_FILENAME_BOILERPLATE = new Set([
  'copy',
  'cropped',
  'default',
  'edited',
  'final',
  'image',
  'img',
  'large',
  'medium',
  'min',
  'mobile',
  'new',
  'opt',
  'optimised',
  'optimized',
  'photo',
  'resized',
  'retina',
  'scaled',
  'site',
  'small',
  'web',
])

// A filename is not a name. "Things to do camping jpg.webp.pagespeed.ce...webp"
// is what a shopper was shown; a plain truthful label is always better.
const FILE_EXTENSION_TITLE_PATTERN = /\.(?:avif|bmp|gif|jpe?g|pdf|png|svg|tiff?|webp)\b/i

interface PageImageMeta {
  alt: string
  height?: number
  width?: number
}

export function extractOfficialLeaflets(
  store: NearbyStore,
  html: string,
  pageUrl: string,
  officialOrigin: string,
  nowMs: number,
): StorePromotion[] {
  const images = pageImageMeta(html, pageUrl)
  const promotionalPage = isGenuinelyPromotionalPage(pageUrl, html)

  return extractRetailerLeafletsFromHtml(
    { retailerId: 'independent' as never, retailerName: store.name, sourceUrl: pageUrl },
    html,
    new Date(nowMs).toISOString(),
    OFFICIAL_LEAFLET_SCAN_LIMIT,
  )
    .filter((leaflet) => {
      const documentUrl = leaflet.documentUrl ?? leaflet.url

      if (isAggregatorHost(safeHost(documentUrl) ?? '')) {
        return false
      }
      if (!IMAGE_DOCUMENT_PATTERN.test(safePathname(documentUrl))) {
        return sameOrigin(documentUrl, officialOrigin) || isTrustedCatalogueUrl(documentUrl)
      }
      return isCatalogueImage(
        store.name,
        documentUrl,
        images.get(documentUrl),
        promotionalPage,
      )
    })
    .slice(0, MAX_OFFICIAL_LEAFLETS)
    .map((leaflet) => {
      const documentUrl = leaflet.documentUrl ?? leaflet.url
      const safeLeaflet = leaflet.imageUrl === documentUrl &&
        !sameOrigin(documentUrl, officialOrigin)
        ? { ...leaflet, documentUrl: pageUrl }
        : leaflet
      return leafletToPromotion(store, {
        ...safeLeaflet,
        name: shopperFacingTitle(store.name, safeLeaflet.name),
      })
    })
}

// A bare image only counts as a catalogue when the page it sits on is genuinely
// promotional AND the image says so itself, through its own path or alt text.
// The former rule read 1.2KB of surrounding markup, so one "Specials" link in a
// site's nav made every image on the page a catalogue — the logo included.
function isCatalogueImage(
  storeName: string,
  documentUrl: string,
  image: PageImageMeta | undefined,
  promotionalPage: boolean,
): boolean {
  if (!promotionalPage) {
    return false
  }

  const pathname = safePathname(documentUrl)
  const filename = decodeUrlText(pathname.split('/').at(-1) ?? '')

  if (
    !filename ||
    NON_CATALOGUE_IMAGE_PATTERN.test(filename) ||
    DERIVED_IMAGE_PATTERN.test(filename) ||
    looksLikeStoreBrandMark(filename, storeName) ||
    !hasPlausibleCatalogueDimensions(image)
  ) {
    return false
  }

  return looksLikePromotionSignal(decodeUrlText(pathname)) ||
    looksLikePromotionSignal(image?.alt ?? '')
}

// "cropped-cropped-saimart.png" on Sai Mart's own site is the shop's logo, not
// its catalogue: once boilerplate is dropped, the filename is only the brand.
function looksLikeStoreBrandMark(filename: string, storeName: string): boolean {
  const brand = normalizeWords(storeName).replace(/ /g, '')
  if (brand.length < 4) {
    return false
  }

  const tokens = normalizeWords(filename.replace(/\.[a-z0-9]+$/i, ''))
    .split(' ')
    .filter((token) => token.length >= 3 && !IMAGE_FILENAME_BOILERPLATE.has(token))

  return tokens.length > 0 &&
    tokens.every((token) => brand.includes(token) || token.includes(brand))
}

function hasPlausibleCatalogueDimensions(image: PageImageMeta | undefined): boolean {
  // Most sites omit width/height, so their absence cannot be held against a
  // candidate — but a declared thumbnail-sized box rules a catalogue out.
  if (!image?.width || !image?.height) {
    return true
  }
  return Math.min(image.width, image.height) >= MIN_CATALOGUE_IMAGE_EDGE
}

// Promotional intent stated by the page itself: its path, or its own headings.
// Deliberately NOT the whole body, which is where nav chrome lives.
function isGenuinelyPromotionalPage(pageUrl: string, html: string): boolean {
  if (isPromotionPath(pageUrl)) {
    return true
  }

  return Array.from(
    html.matchAll(/<(?:h[1-3]|title)\b[^>]*>([\s\S]{0,400}?)<\/(?:h[1-3]|title)>/gi),
  )
    .slice(0, MAX_SCANNED_HEADINGS)
    .some((heading) => looksLikePromotionSignal(cleanText(heading[1] ?? '')))
}

function pageImageMeta(html: string, pageUrl: string): Map<string, PageImageMeta> {
  const meta = new Map<string, PageImageMeta>()
  const pattern = /<img\b([^>]{0,2000})>/gi
  let match: RegExpExecArray | null
  let scanned = 0

  while ((match = pattern.exec(html)) !== null && scanned < MAX_SCANNED_IMAGE_TAGS) {
    scanned += 1
    const attributes = match[1] ?? ''
    const url = absoluteUrl(
      decodeHtml(attributeValue(attributes, ['src', 'data-src']) ?? ''),
      pageUrl,
    )

    if (!url || meta.has(url)) {
      continue
    }

    meta.set(url, {
      alt: cleanText(attributeValue(attributes, ['alt']) ?? ''),
      height: pixelValue(attributeValue(attributes, ['height'])),
      width: pixelValue(attributeValue(attributes, ['width'])),
    })
  }

  return meta
}

function pixelValue(value: string | undefined): number | undefined {
  return value && /^\d+$/.test(value) ? Number(value) : undefined
}

function shopperFacingTitle(storeName: string, title: string | undefined): string {
  const cleaned = (title ?? '').replace(/\s+/g, ' ').trim()
  return cleaned && !FILE_EXTENSION_TITLE_PATTERN.test(cleaned)
    ? cleaned
    : `${storeName} specials`
}

function safePathname(value: string): string {
  try {
    return new URL(value).pathname
  } catch {
    return value
  }
}

function decodeUrlText(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function cataloguePromotion(store: NearbyStore, url: string, title?: string): StorePromotion {
  return {
    id: `${store.placeId}-search-${hashString(url)}`,
    kind: 'catalogue',
    placeId: store.placeId,
    productUrl: url,
    retailerId: store.retailerId,
    sourceUrl: url,
    storeName: store.name,
    title: shopperFacingTitle(store.name, title),
  }
}

function outcome(
  status: StoreScoutOutcomeStatus,
  promotions: StorePromotion[] = [],
  resolvedWebsite?: string,
): ScoutOutcome {
  return { promotions, resolvedWebsite, status }
}

function resolvedWebsiteFrom(attempts: ScoutOutcome[]): string | undefined {
  return attempts.find((attempt) => attempt.resolvedWebsite)?.resolvedWebsite
}

async function fetchText(
  url: string,
  extraHeaders?: Record<string, string>,
  allowPlainText = false,
  manualRedirect = false,
): Promise<FetchOutcome> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        accept: allowPlainText ? 'text/html, text/plain;q=0.9' : 'text/html',
        'user-agent': BROWSER_UA,
        ...extraHeaders,
      },
      redirect: manualRedirect ? 'manual' : 'follow',
      signal: controller.signal,
    })

    if (manualRedirect && response.status >= 300 && response.status < 400) {
      return {
        finalUrl: response.url || url,
        headers: response.headers,
        status: 'success',
        text: '',
      }
    }
    if (response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500) {
      return { headers: response.headers, status: 'transient_failure' }
    }
    if (!response.ok) {
      return { headers: response.headers, status: 'permanent_unverified' }
    }

    const contentType = response.headers.get('content-type') ?? ''
    const permitted = contentType.includes('text/html') ||
      (allowPlainText && contentType.includes('text/plain'))

    if (!permitted) {
      return { headers: response.headers, status: 'permanent_unverified' }
    }

    return {
      finalUrl: response.url || url,
      headers: response.headers,
      status: 'success',
      text: await readBoundedBody(response, MAX_BODY_BYTES),
    }
  } catch {
    return { status: 'transient_failure' }
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return (await response.text()).slice(0, maxBytes)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''

  while (received < maxBytes) {
    const chunk = await reader.read()
    if (chunk.done) {
      break
    }
    const remaining = maxBytes - received
    const value = chunk.value.byteLength > remaining
      ? chunk.value.slice(0, remaining)
      : chunk.value
    received += value.byteLength
    text += decoder.decode(value, { stream: received < maxBytes })

    if (chunk.value.byteLength > remaining) {
      await reader.cancel()
      break
    }
  }

  if (received >= maxBytes) {
    await reader.cancel()
  }

  return text + decoder.decode()
}

function verifyOfficialStorePage(
  store: NearbyStore,
  html: string,
  sourceUrl?: string,
  requireCountryEvidence = false,
): boolean {
  const pageText = normalizeWords(stripHtml(html).slice(0, 100_000))
  if (
    requireCountryEvidence &&
    countryFromCode(store.countryCode).code !== 'ZA' &&
    !hasStoreCountryEvidence(store, sourceUrl, pageText)
  ) {
    return false
  }
  const records = embeddedRecords(html)
  const organizationMatch = records.some((record) => {
    const type = record['@type']
    const types = (Array.isArray(type) ? type : [type]).map((value) =>
      String(value).toLowerCase().split(/[/#]/).at(-1) ?? '',
    )
    return types.some((value) => value === 'organization' || value === 'localbusiness') &&
      namesMatch(store.name, stringValue(record.name))
  })

  if (organizationMatch) {
    return true
  }

  if (
    store.sourceCategory === 'network-provider' &&
    store.websiteSource === 'country-retailer'
  ) {
    // The provider registry already binds this exact official source to the
    // active country. Same-origin checks run before this function.
    return true
  }

  const nameTokens = meaningfulTokens(store.name)
  const nameMatch = nameTokens.length > 0 &&
    nameTokens.filter((token) => pageText.includes(token)).length >= Math.ceil(nameTokens.length * 0.6)
  if (
    store.websiteSource === 'country-retailer' &&
    hasStoreCountryEvidence(store, sourceUrl, pageText)
  ) {
    return true
  }
  const addressMatch = (store.address ?? '')
    .split(',')
    .map(normalizeWords)
    .filter((part) => part.length >= 4 && !/^(south africa|gauteng|western cape|kwazulu natal)$/.test(part))
    .some((part) => pageText.includes(part))

  return nameMatch && addressMatch
}

function hasStoreCountryEvidence(
  store: NearbyStore,
  sourceUrl: string | undefined,
  pageText: string,
): boolean {
  const country = countryFromCode(store.countryCode)
  const host = safeHost(sourceUrl)
  if (host?.endsWith(`.${country.code.toLowerCase()}`)) return true

  const countryName = normalizeWords(store.countryName ?? country.name)
  if (countryName && pageText.includes(countryName)) return true

  const addressParts = (store.address ?? '')
    .split(',')
    .map(normalizeWords)
    .filter((part) => part.length >= 4 && part !== countryName)
  return addressParts.some((part) => pageText.includes(part))
}

function namesMatch(expected: string, actual: string | undefined): boolean {
  if (!actual) {
    return false
  }
  const expectedTokens = meaningfulTokens(expected)
  const actualText = normalizeWords(actual)
  return expectedTokens.length > 0 &&
    expectedTokens.filter((token) => actualText.includes(token)).length >=
      Math.ceil(expectedTokens.length * 0.6)
}

function meaningfulTokens(value: string): string[] {
  return normalizeWords(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !['market', 'store', 'supermarket'].includes(token))
}

function normalizeWords(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function cleanText(value: string): string {
  return decodeHtml(stripHtml(value)).replace(/\s+/g, ' ').trim().slice(0, 180)
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '’')
}

function isPromotionPath(url: string): boolean {
  try {
    return looksLikePromotionSignal(new URL(url).pathname)
  } catch {
    return false
  }
}

function isPromotionalSource(url: string, title: string, html: string): boolean {
  return isPromotionPath(url) ||
    looksLikePromotionSignal(`${title} ${stripHtml(html).slice(0, 5_000)}`)
}

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === new URL(origin).origin
  } catch {
    return false
  }
}

function isAggregatorHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, '')
  return AGGREGATOR_HOSTS.some((aggregator) =>
    normalized === aggregator || normalized.endsWith(`.${aggregator}`),
  )
}

function safeHost(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.hostname.replace(/^www\./, '').toLowerCase()
      : undefined
  } catch {
    return undefined
  }
}

function safeOrigin(website: string): string | undefined {
  try {
    const url = new URL(website)
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    ) ? url.origin : undefined
  } catch {
    return undefined
  }
}
