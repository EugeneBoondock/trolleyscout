import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  getSadcCountryCodes,
  getSadcRetailSources,
} from '../../src/services/sadcSourceRegistry'
import { countryFromCode } from './countryContext'

// The near-me scout only reaches retailers with a physical branch Geoapify can
// return. Many verified country-registry shops are online-only (or online-first)
// — they have a website and live specials but no branch to be discovered near a
// shopper. This turns each registry retail source into a national online store
// so the scheduled scout runs the same deal detector on it and its deals land
// in store_promotions, scoped to the country.
//
// Stores carry no coordinates (they are national, not a pinned branch) and are
// never persisted to discovered_stores — they are handed straight to
// scoutNearbyStores in memory, which paces them through store_scout_log.

export function buildRegistryOnlineStores(
  countryCodes: string[] = getSadcCountryCodes(),
): NearbyStore[] {
  const perCountry = countryCodes.map((code) => {
    const country = countryFromCode(code)
    const seen = new Set<string>()
    const stores: NearbyStore[] = []

    for (const source of getSadcRetailSources(code)) {
      const host = safeHost(source.url)
      if (!host || seen.has(host)) {
        continue
      }
      seen.add(host)
      stores.push({
        countryCode: country.code,
        countryName: country.name,
        lat: 0,
        lon: 0,
        name: source.retailerName,
        placeId: `online:${country.code.toLowerCase()}:${host}`,
        website: source.url,
        // Verify the page as a directory-matched chain page, not a branch, so a
        // national storefront is accepted without a branch address.
        websiteSource: 'country-retailer',
      })
    }

    return stores
  })

  // Round-robin across countries so a per-run scout cap never starves the
  // countries that sort last.
  const interleaved: NearbyStore[] = []
  const longest = perCountry.reduce((max, list) => Math.max(max, list.length), 0)
  for (let index = 0; index < longest; index += 1) {
    for (const list of perCountry) {
      const store = list[index]
      if (store) {
        interleaved.push(store)
      }
    }
  }

  return interleaved
}

function safeHost(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.hostname.replace(/^www\./, '').toLowerCase()
      : undefined
  } catch {
    return undefined
  }
}
