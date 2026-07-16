import { extractRetailerLeafletsFromHtml } from '../../src/services/scoutSources'
import type { NearbyStore } from '../../src/services/nearbyStores'
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

export async function scoutNearbyStores(
  env: TrolleyScoutEnv,
  stores: NearbyStore[],
  nowMs: number,
): Promise<void> {
  if (!env.DB) {
    return
  }

  const nowIso = new Date(nowMs).toISOString()
  const candidates: NearbyStore[] = []

  for (const store of stores) {
    // Known chains already have their deals via the shared snapshot; only
    // independent stores with a website need their own site scouted.
    if (store.retailerId || !store.website) {
      continue
    }

    if (await shouldScoutStore(env, store.placeId, nowIso)) {
      candidates.push(store)
    }

    if (candidates.length >= MAX_STORES_PER_RUN) {
      break
    }
  }

  for (const store of candidates) {
    const promotions = await scoutStoreWebsite(store, nowMs)
    await saveStorePromotions(env, promotions, nowMs)
    await recordStoreScout(env, store, promotions.length, nowMs)
  }
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
