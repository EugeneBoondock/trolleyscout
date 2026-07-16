// Background gap-scout for a location tile: finds supermarkets the OSM data
// behind Geoapify does not know (Frontline Hyper and friends) via a keyless
// DuckDuckGo search, geocodes them, and merges them into the tile's cached
// store list so the next visitor sees them. Once merged they show up empty,
// which makes the existing catalogue scout find their specials automatically.

import {
  buildAreaStoresQuery,
  buildGeoapifyGeocodeUrl,
  buildGeoapifyReverseUrl,
  extractAreaName,
  extractCandidateStoreNames,
  mapGeocodedStore,
  mergeStores,
} from '../../src/services/areaStoreScout'
import type { NearbyStore } from '../../src/services/nearbyStores'
import { buildDuckDuckGoUrl, extractSearchResults } from '../../src/services/webSearch'
import type { TrolleyScoutEnv } from './env'
import { recordStoreScout, shouldScoutStore, writeCachedStores } from './locationStore'

const MAX_GEOCODES_PER_RUN = 4

export async function scoutAreaStores(
  env: TrolleyScoutEnv,
  tileKey: string,
  lat: number,
  lon: number,
  existingStores: NearbyStore[],
  nowMs: number,
): Promise<void> {
  if (!env.DB || !env.GEOAPIFY_API_KEY) {
    return
  }

  // The scout log doubles as a per-tile rate limit: one area sweep a day.
  const areaMarker: NearbyStore = { lat, lon, name: '__area-scout__', placeId: `area:${tileKey}` }

  if (!(await shouldScoutStore(env, areaMarker.placeId, new Date(nowMs).toISOString()))) {
    return
  }

  const area = extractAreaName(await fetchJson(buildGeoapifyReverseUrl(lat, lon, env.GEOAPIFY_API_KEY)))

  if (!area) {
    await recordStoreScout(env, areaMarker, 0, nowMs)
    return
  }

  const searchHtml = await fetchText(buildDuckDuckGoUrl(buildAreaStoresQuery(area)))
  const candidates = searchHtml
    ? extractCandidateStoreNames(
        extractSearchResults(searchHtml),
        existingStores.map((store) => store.name),
      )
    : []

  const found: NearbyStore[] = []

  for (const name of candidates.slice(0, MAX_GEOCODES_PER_RUN)) {
    const payload = await fetchJson(
      buildGeoapifyGeocodeUrl(`${name} ${area}`, lat, lon, env.GEOAPIFY_API_KEY),
    )
    found.push(mapGeocodedStore(name, payload, { area, lat, lon }))
  }

  if (found.length > 0) {
    await writeCachedStores(env, tileKey, mergeStores(existingStores, found), nowMs)
  }

  await recordStoreScout(env, areaMarker, found.length, nowMs)
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    return response.ok ? await response.json() : undefined
  } catch {
    return undefined
  }
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    })

    return response.ok ? (await response.text()).slice(0, 1_500_000) : undefined
  } catch {
    return undefined
  }
}
