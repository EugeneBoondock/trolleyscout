import { extractRetailerLeafletsFromHtml } from '../../src/services/scoutSources'
import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  buildStoreSpecialsQuery,
  extractValidDates,
  pickCatalogueSource,
} from '../../src/services/webSearch'
import { searchWeb } from './searchWeb'
import type { StoreLeaflet } from '../../src/types'
import type { TrolleyScoutEnv } from './env'
import {
  recordStoreScout,
  saveStorePromotions,
  shouldScoutStore,
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

// Scouts the stores that ended up with no deals or leaflets — passed in by the
// endpoint. This covers both independents AND big chains we do not have a live
// feed for (SPAR, Woolworths, Food Lover's), giving each a real "this week's
// specials" link found the way a shopper would search for it.
export async function scoutNearbyStores(
  env: TrolleyScoutEnv,
  storesNeedingDeals: NearbyStore[],
  nowMs: number,
): Promise<void> {
  if (!env.DB) {
    return
  }

  const nowIso = new Date(nowMs).toISOString()
  const candidates: NearbyStore[] = []

  for (const store of storesNeedingDeals) {
    if (await shouldScoutStore(env, store.placeId, nowIso)) {
      candidates.push(store)
    }

    if (candidates.length >= MAX_STORES_PER_RUN) {
      break
    }
  }

  for (const store of candidates) {
    // First try the store's own website (independents), then fall back to a web
    // search for the store's catalogue (works for any named store).
    let promotions = store.website ? await scoutStoreWebsite(store, nowMs) : []

    if (promotions.length === 0) {
      promotions = await searchStoreCatalogue(store, nowMs, env.JINA_API_KEY)
    }

    await saveStorePromotions(env, promotions, nowMs)
    await recordStoreScout(env, store, promotions.length, nowMs)
  }
}

// Searches the open web for a store's current catalogue and turns the best
// result into a promotion. Reads the found page (when it is not a PDF) to pick
// up any printed valid-until date so it still expires correctly.
async function searchStoreCatalogue(
  store: NearbyStore,
  nowMs: number,
  jinaApiKey?: string,
): Promise<StorePromotion[]> {
  const area = store.address ? cityFromAddress(store.address) : undefined
  // searchWeb falls back to a reader proxy when DuckDuckGo blocks Worker IPs.
  const results = await searchWeb(buildStoreSpecialsQuery(store.name, area), jinaApiKey)
  const source = pickCatalogueSource(results, store.name)

  if (!source) {
    return []
  }

  let validFrom: string | undefined
  let validTo: string | undefined

  if (source.kind !== 'pdf') {
    const page = await fetchText(source.url)

    if (page) {
      const dates = extractValidDates(stripHtml(page).slice(0, 20_000), new Date(nowMs).getUTCFullYear())
      validFrom = dates.validFrom
      validTo = dates.validTo
    }
  }

  return [
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
  ]
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
async function scoutStoreWebsite(store: NearbyStore, nowMs: number): Promise<StorePromotion[]> {
  if (!store.website) {
    return []
  }

  const origin = safeOrigin(store.website)

  if (!origin) {
    return []
  }

  for (const path of SPECIALS_PATHS.slice(0, MAX_PATHS_PER_STORE)) {
    const pageUrl = `${origin}${path}`
    const html = await fetchText(pageUrl)

    if (!html) {
      continue
    }

    const leaflets = extractRetailerLeafletsFromHtml(
      { retailerId: 'independent' as never, retailerName: store.name, sourceUrl: pageUrl },
      html,
      new Date(nowMs).toISOString(),
    )

    if (leaflets.length > 0) {
      return leaflets.map((leaflet) => leafletToPromotion(store, leaflet))
    }
  }

  return []
}

function leafletToPromotion(store: NearbyStore, leaflet: StoreLeaflet): StorePromotion {
  return {
    id: `${store.placeId}-${leaflet.id}`,
    imageUrl: leaflet.imageUrl,
    kind: 'catalogue',
    placeId: store.placeId,
    productUrl: leaflet.documentUrl ?? leaflet.url,
    sourceUrl: leaflet.url,
    storeName: store.name,
    title: leaflet.name,
    validFrom: leaflet.validFrom,
    validTo: leaflet.validTo,
  }
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': BROWSER_UA },
      redirect: 'follow',
    })

    if (!response.ok) {
      return undefined
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (!contentType.includes('text/html')) {
      return undefined
    }

    // Cap the body so an unexpectedly large page cannot exhaust the request.
    const text = await response.text()
    return text.slice(0, 1_500_000)
  } catch {
    return undefined
  }
}

function safeOrigin(website: string): string | undefined {
  try {
    return new URL(website).origin
  } catch {
    return undefined
  }
}
