import { extractRetailerLeafletsFromHtml } from '../../src/services/scoutSources'
import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  buildDuckDuckGoUrl,
  buildJinaReaderUrl,
  buildStoreSpecialsQuery,
  extractSearchResults,
  extractSearchResultsFromMarkdown,
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
  reconcileSuccessfulStorePromotions,
  recordStoreScout,
  saveStorePromotions,
  shouldScoutStore,
  type StoreScoutOutcomeStatus,
  type StorePromotion,
} from './locationStore'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Common places a South African store publishes its specials. Probed in order;
// the first that yields catalogue links wins.
const SPECIALS_PATHS = [
  '/specials',
  '/specials.html',
  '/promotions',
  '/promotions.php',
  '/deals',
  '/catalogue',
  '/catalogues',
  '/weekly-specials',
  '/',
]

// Keep a location scout cheap and quick: only a few independent stores per run,
// and only those with a website that we have not scouted recently.
const MAX_STORES_PER_RUN = 3
const MAX_PATHS_PER_STORE = 4
const MAX_BODY_BYTES = 1_500_000
const MAX_EMBEDDED_SCRIPT_BYTES = 500_000
const MAX_EMBEDDED_TOTAL_BYTES = 1_000_000
const MAX_EMBEDDED_SCRIPTS = 30
const MAX_EMBEDDED_NODES = 12_000
const MAX_PROMOTIONS_PER_PAGE = 60
const REQUEST_TIMEOUT_MS = 8_000
const SPAR_ORIGIN = 'https://mobile.spar.co.za'
const AGGREGATOR_HOSTS = ['guzzle.co.za', 'tiendeo.co.za', 'cataloguespecials.co.za']

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
export async function scoutNearbyStores(
  env: TrolleyScoutEnv,
  storesNeedingDeals: NearbyStore[],
  nowMs: number,
  maxStores = MAX_STORES_PER_RUN,
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
    const queuedNextScoutAt = (store as NearbyStore & { nextScoutAt?: unknown }).nextScoutAt
    const isDueQueueItem =
      typeof queuedNextScoutAt === 'string' && queuedNextScoutAt <= nowIso

    if (isDueQueueItem || await shouldScoutStore(env, store.placeId, nowIso)) {
      candidates.push(store)
    }

    if (candidates.length >= limit) {
      break
    }
  }

  let savedAnyPromotions = false

  for (const store of candidates) {
    try {
      const outcome = await scoutStore(env, store, nowMs)
      const saved = await saveStorePromotions(env, outcome.promotions, nowMs)
      if (saved && outcome.promotions.length > 0) {
        savedAnyPromotions = true
      }
      if (saved && outcome.status === 'success' && outcome.promotions.length > 0) {
        await reconcileSuccessfulStorePromotions(env, store.placeId, outcome.promotions)
      }
      await recordStoreScout(env, store, outcome.promotions.length, nowMs, outcome.status)
    } catch {
      // A malformed store or unexpected source response is isolated to this
      // queue item so every later due store still receives an attempt.
      await recordStoreScout(env, store, 0, nowMs, 'transient_failure')
    }
  }

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
    if (store.retailerId && sourcesByRetailer.has(store.retailerId)) {
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

async function scoutStore(
  env: TrolleyScoutEnv,
  store: NearbyStore,
  nowMs: number,
): Promise<ScoutOutcome> {
  const attempts: ScoutOutcome[] = []

  if (store.retailerId === 'spar') {
    const spar = await scoutSparBranch(store, nowMs)
    attempts.push(spar)
    if (spar.promotions.length > 0) {
      return spar
    }
  }

  if (store.website) {
    const website = await scoutStoreWebsite(env, store, nowMs)
    attempts.push(website)
    if (website.promotions.length > 0) {
      return website
    }
  }

  const search = await searchStoreCatalogue(store, nowMs, env.JINA_API_KEY)
  attempts.push(search)
  if (search.promotions.length > 0) {
    return search
  }

  if (attempts.some((attempt) => attempt.status === 'transient_failure')) {
    return outcome('transient_failure')
  }
  if (attempts.some((attempt) => attempt.status === 'empty')) {
    return outcome('empty')
  }
  return outcome('permanent_unverified')
}

// Searches the open web for a store's current catalogue and turns the best
// result into a promotion. Reads the found page (when it is not a PDF) to pick
// up any printed valid-until date so it still expires correctly.
async function searchStoreCatalogue(
  store: NearbyStore,
  nowMs: number,
  jinaApiKey?: string,
): Promise<ScoutOutcome> {
  const area = store.address ? cityFromAddress(store.address) : undefined
  const websiteHost = safeHost(store.website)
  const knownRetailerHost = store.retailerId
    ? KNOWN_RETAILER_HOSTS[store.retailerId]
    : undefined
  const verifiedHost = knownRetailerHost ?? websiteHost
  const search = await searchOfficialWeb(
    buildStoreSpecialsQuery(store.name, area, verifiedHost),
    jinaApiKey,
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
    return outcome('success', [cataloguePromotion(store, source.url, source.title)])
  }

  const page = await fetchText(source.url)

  if (page.status !== 'success' || !page.text) {
    return outcome(page.status)
  }

  if (!knownRetailerHost && !verifyOfficialStorePage(store, page.text)) {
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
  const leaflets = officialLeaflets(store, page.text, pageUrl, officialOrigin, nowMs)

  if (deals.length > 0 || leaflets.length > 0) {
    return outcome('success', [...deals, ...leaflets])
  }

  if (!isPromotionalSource(pageUrl, source.title, page.text)) {
    return outcome('empty')
  }

  const dates = extractValidDates(
    stripHtml(page.text).slice(0, 20_000),
    new Date(nowMs).getUTCFullYear(),
  )
  validFrom = dates.validFrom
  validTo = dates.validTo

  return outcome('success', [
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
  ])
}

async function searchOfficialWeb(
  query: string,
  jinaApiKey?: string,
): Promise<{ results: SearchResult[]; status: 'success' | 'empty' | 'transient_failure' }> {
  const directUrl = buildDuckDuckGoUrl(query)
  const direct = await fetchText(directUrl, undefined, true)

  if (direct.status === 'success' && direct.text) {
    const results = extractSearchResults(direct.text)
    if (results.length > 0) {
      return { results, status: 'success' }
    }
  }

  const proxied = await fetchText(
    buildJinaReaderUrl(directUrl),
    jinaApiKey ? { authorization: `Bearer ${jinaApiKey}` } : undefined,
    true,
  )

  if (proxied.status === 'success' && proxied.text) {
    const results = extractSearchResultsFromMarkdown(proxied.text)
    return { results, status: results.length > 0 ? 'success' : 'empty' }
  }

  if (direct.status === 'transient_failure' && proxied.status === 'transient_failure') {
    return { results: [], status: 'transient_failure' }
  }
  return { results: [], status: 'empty' }
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
const MAX_PLATFORM_DEALS = 40

function platformDealToPromotion(
  store: NearbyStore,
  deal: PlatformDeal,
  sourceUrl: string,
): StorePromotion {
  return {
    id: `${store.placeId}-platform-${hashString(deal.title + (deal.productUrl ?? ''))}`,
    imageUrl: deal.imageUrl,
    kind: 'deal',
    placeId: store.placeId,
    previousPriceText:
      deal.previousPriceCents !== undefined
        ? `R${(deal.previousPriceCents / 100).toFixed(2)}`
        : undefined,
    priceText: `R${(deal.priceCents / 100).toFixed(2)}`,
    productUrl: deal.productUrl ?? sourceUrl,
    retailerId: store.retailerId,
    savingText: deal.promoLabel,
    sourceUrl: deal.productUrl ?? sourceUrl,
    storeName: store.name,
    title: deal.title,
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

  const knownRetailerHost = store.retailerId
    ? KNOWN_RETAILER_HOSTS[store.retailerId]
    : undefined
  if (knownRetailerHost && safeHost(origin) !== knownRetailerHost) {
    return outcome('permanent_unverified')
  }

  const pathPlan = storeSpecialsPathPlan(store.website)
  const cursorKey = `store-paths::${hashString(store.placeId)}`
  const cursorState = await readStorePathCursor(env, cursorKey, pathPlan.length)
  const start = cursorState.start
  const paths = cursorState.resumable
    ? pathPlan.slice(start, start + MAX_PATHS_PER_STORE)
    : pathPlan.slice(0, MAX_PATHS_PER_STORE)
  let nextPath = start

  for (const path of paths) {
    const pageUrl = `${origin}${path}`
    const page = await fetchText(pageUrl)

    if (page.status === 'transient_failure') {
      return outcome('transient_failure')
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
    if (!verifyOfficialStorePage(store, page.text)) {
      continue
    }

    const leaflets = officialLeaflets(store, page.text, finalUrl, origin, nowMs)
    const deals = extractPublicStoreDeals(store, page.text, finalUrl, nowMs)

    if (leaflets.length > 0 || deals.length > 0) {
      return outcome('success', [...deals, ...leaflets])
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
        return platform
      }
    }
  }

  return outcome('empty')
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

function storeSpecialsPathPlan(website: string): string[] {
  try {
    const url = new URL(website)
    const exactPath = `${url.pathname || '/'}${url.search}`
    if (exactPath !== '/' && !SPECIALS_PATHS.includes(exactPath)) {
      return [exactPath, ...SPECIALS_PATHS]
    }
  } catch {
    // The caller already validates the origin; retain the standard path plan.
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
  const records = [...embeddedRecords(html), ...visibleProductRecords(html)]
  const promotions: StorePromotion[] = []
  const seen = new Set<string>()
  const promotionalPath = isPromotionPath(sourceUrl)

  for (const product of records) {
    const title = stringValue(
      product.name ?? product.title ?? product.productName ?? product.displayName,
    )
    const offer = firstOffer(product.offers ?? product.offer)
    const price = firstNumber(
      product.specialPrice,
      product.salePrice,
      product.currentPrice,
      product.discountedPrice,
      offer?.price,
      offer?.lowPrice,
      product.price,
    )
    const previousPrice = firstNumber(
      product.previousPrice,
      product.oldPrice,
      product.listPrice,
      product.regularPrice,
      product.wasPrice,
      product.compareAtPrice,
      product.originalPrice,
      product.mrp,
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
      stringValue(product.url ?? product.productUrl ?? product.canonicalUrl ?? offer?.url),
      sourceUrl,
    )
    const key = `${title.toLowerCase()}::${productUrl ?? sourceUrl}`

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    const validFrom = dateValue(
      product.validFrom ?? product.startDate ?? product.promotionStart ?? offer?.validFrom,
    )
    const validTo = dateValue(
      product.validTo ??
        product.endDate ??
        product.promotionEnd ??
        offer?.priceValidUntil ??
        offer?.validTo,
    )
    const currency = stringValue(
      product.priceCurrency ?? product.currency ?? offer?.priceCurrency,
    )
    const savingAmount = firstNumber(
      product.discountAmount,
      product.savingAmount,
      previousPrice !== undefined && previousPrice > price ? previousPrice - price : undefined,
    )
    const explicitSaving = stringValue(
      product.savingText ?? product.discountText ?? offer?.savingText,
    )
    promotions.push({
      id: `${store.placeId}-product-${hashString(key)}`,
      imageUrl: absoluteUrl(
        imageValue(
          product.image ??
            product.imageUrl ??
            product.thumbnailUrl ??
            product.thumbnail ??
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
    /<(article|li|div)\b([^>]*(?:itemtype\s*=\s*["'][^"']*schema\.org\/Product[^"']*["']|data-product-(?:id|name|sku)\s*=|class\s*=\s*["'][^"']*\b(?:product|deal|promo)-card\b[^"']*["'])[^>]*)>/gi,
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
      attributeValue(attributes, ['data-product-name', 'data-name'])
    const priceText = visibleItemPropValue(segment, 'price', ['content', 'value']) ??
      visibleClassText(segment, /(?:sale|special|current|deal)[-_ ]?price/i) ??
      attributeValue(attributes, ['data-sale-price', 'data-special-price', 'data-price'])
    const price = numberValue(priceText)

    if (!name || price === undefined) {
      continue
    }

    const previousPriceText = visibleClassText(
      segment,
      /(?:was|old|regular|previous|list|original)[-_ ]?price/i,
    ) ?? attributeValue(attributes, [
      'data-old-price',
      'data-regular-price',
      'data-previous-price',
      'data-was-price',
    ])
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
      validTo: visibleItemPropValue(segment, 'priceValidUntil', ['content', 'datetime']),
    })
  }

  return records
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
  const pattern = /<([a-z0-9]+)\b([^>]*\bclass\s*=\s*["'][^"']+["'][^>]*)>([\s\S]{0,800}?)<\/\1>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(segment)) !== null) {
    const className = attributeValue(match[2], ['class'])
    if (className && classPattern.test(className)) {
      const text = cleanText(match[3])
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

    for (const marker of ['window.__INITIAL_STATE__', 'window.__NUXT__']) {
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

  const records: Record<string, unknown>[] = []
  const seen = new WeakSet<object>()
  let visited = 0

  const walk = (value: unknown): void => {
    if (visited >= MAX_EMBEDDED_NODES || !value || typeof value !== 'object') {
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
    product.savingAmount,
    product.discountPercent,
    offer?.discountAmount,
  )
  if (discount !== undefined && discount > 0) {
    return true
  }
  if (stringValue(
    product.promotionId ??
      product.promoId ??
      product.promotionCode ??
      product.dealId ??
      product.campaignId ??
      offer?.promotionId,
  )) {
    return true
  }
  if (stringValue(
    product.promotionText ??
      product.promoText ??
      product.discountText ??
      product.savingText ??
      offer?.promotionText,
  )) {
    return true
  }
  return Boolean(
    dateValue(product.validFrom ?? product.startDate ?? product.promotionStart ?? offer?.validFrom) ||
      dateValue(
        product.validTo ??
          product.endDate ??
          product.promotionEnd ??
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
    return stringValue(image.url ?? image.contentUrl)
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

function officialLeaflets(
  store: NearbyStore,
  html: string,
  pageUrl: string,
  officialOrigin: string,
  nowMs: number,
): StorePromotion[] {
  return extractRetailerLeafletsFromHtml(
    { retailerId: 'independent' as never, retailerName: store.name, sourceUrl: pageUrl },
    html,
    new Date(nowMs).toISOString(),
  )
    .filter((leaflet) => {
      const documentUrl = leaflet.documentUrl ?? leaflet.url
      return sameOrigin(documentUrl, officialOrigin) && !isAggregatorHost(safeHost(documentUrl) ?? '')
    })
    .map((leaflet) => leafletToPromotion(store, leaflet))
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
    title: title?.trim() || `${store.name} specials`,
  }
}

function outcome(status: StoreScoutOutcomeStatus, promotions: StorePromotion[] = []): ScoutOutcome {
  return { promotions, status }
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

function verifyOfficialStorePage(store: NearbyStore, html: string): boolean {
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

  const pageText = normalizeWords(stripHtml(html).slice(0, 100_000))
  const nameTokens = meaningfulTokens(store.name)
  const nameMatch = nameTokens.length > 0 &&
    nameTokens.filter((token) => pageText.includes(token)).length >= Math.ceil(nameTokens.length * 0.6)
  const addressMatch = (store.address ?? '')
    .split(',')
    .map(normalizeWords)
    .filter((part) => part.length >= 4 && !/^(south africa|gauteng|western cape|kwazulu natal)$/.test(part))
    .some((part) => pageText.includes(part))

  return nameMatch && addressMatch
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
    return /\/(?:specials?|promotions?|deals?|catalogues?|weekly-specials)(?:[/.?]|$)/i
      .test(new URL(url).pathname)
  } catch {
    return false
  }
}

function isPromotionalSource(url: string, title: string, html: string): boolean {
  return isPromotionPath(url) ||
    /\b(?:specials?|promotions?|deals?|catalogues?|weekly offers?)\b/i
      .test(`${title} ${stripHtml(html).slice(0, 5_000)}`)
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
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined
  } catch {
    return undefined
  }
}
