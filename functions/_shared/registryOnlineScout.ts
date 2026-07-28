import type { NearbyStore } from '../../src/services/nearbyStores'
import {
  getOnlineStoreCountryCodes,
  getOnlineStoreSources,
} from '../../src/services/onlineStoreRegistry'
import {
  getNetworkProviderCountryCodes,
  getNetworkProviderSources,
} from '../../src/services/networkProviderRegistry'
import {
  getSadcCountryCodes,
  getSadcRetailSources,
} from '../../src/services/sadcSourceRegistry'
import { countryFromCode } from './countryContext'

// The near-me scout only reaches retailers with a physical branch Geoapify can
// return. Many verified shops are online-only (or online-first) — they have a
// website and live specials but no branch to be discovered near a shopper. This
// turns every registered storefront into a national online store so the
// scheduled scout runs the same deal detector on it and its deals land in
// store_promotions, scoped to the country.
//
// Stores carry no coordinates (they are national, not a pinned branch) and are
// never persisted to discovered_stores — they are handed straight to
// scoutNearbyStores in memory, which paces them through store_scout_log.

export function buildRegistryOnlineStores(
  countryCodes: string[] = allRegisteredCountryCodes(),
): NearbyStore[] {
  const perCountry = countryCodes.map((code) => {
    const country = countryFromCode(code)
    const seenSources = new Set<string>()
    const usedPlaceIds = new Set<string>()
    const stores: NearbyStore[] = []

    const sources: Array<{
      name: string
      retailerId?: NearbyStore['retailerId']
      sourceCategory?: NearbyStore['sourceCategory']
      url: string
    }> = [
      ...getNetworkProviderSources(code).map((source) => ({
        name: source.name,
        retailerId: source.retailerId,
        sourceCategory: 'network-provider' as const,
        url: source.url,
      })),
      ...getSadcRetailSources(code).map((source) => ({
        name: source.retailerName,
        url: source.url,
      })),
      ...getOnlineStoreSources(code).map((source) => ({
        name: source.name,
        url: source.url,
      })),
    ]

    for (const source of sources) {
      const host = safeHost(source.url)
      const sourceKey = `${host}:${canonicalRetailerKey(source.name)}`
      if (!host || seenSources.has(sourceKey)) {
        continue
      }
      seenSources.add(sourceKey)

      const basePlaceId = `online:${country.code.toLowerCase()}:${host}`
      let placeId = basePlaceId
      if (usedPlaceIds.has(placeId)) {
        const retailerSuffix = safeSlug(source.name)
        placeId = `${basePlaceId}:${retailerSuffix}`
        let collision = 2
        while (usedPlaceIds.has(placeId)) {
          placeId = `${basePlaceId}:${retailerSuffix}-${collision}`
          collision += 1
        }
      }
      usedPlaceIds.add(placeId)

      stores.push({
        countryCode: country.code,
        countryName: country.name,
        lat: 0,
        lon: 0,
        name: source.name,
        placeId,
        retailerId: source.retailerId,
        sourceCategory: source.sourceCategory,
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

function allRegisteredCountryCodes(): string[] {
  return [
    ...new Set([
      ...getSadcCountryCodes(),
      ...getOnlineStoreCountryCodes(),
      ...getNetworkProviderCountryCodes(),
    ]),
  ]
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

function safeSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'store'
}

function canonicalRetailerKey(value: string): string {
  const key = value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) =>
      token &&
      ![
        'group',
        'online',
        'official',
        'store',
        'stores',
        'wholesaler',
        'wholesalers',
        'zimbabwe',
      ].includes(token),
    )
    .join('-')
  return key || safeSlug(value)
}
