// Store logos without any API key: DuckDuckGo's public favicon service serves
// each site's own icon by hostname. Retailers resolve via their first official
// source URL; discovered independents via their website when we found one.

import type { NearbyStore } from './nearbyStores'
import { retailers, retailerById } from '../data/retailers'
import type { Retailer } from '../types'

export function logoUrlForWebsite(website: string | undefined): string | undefined {
  if (!website) {
    return undefined
  }

  try {
    const host = new URL(website).hostname.replace(/^www\./, '')
    return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : undefined
  } catch {
    return undefined
  }
}

export function retailerLogoUrl(retailer: Pick<Retailer, 'sources'>): string | undefined {
  return logoUrlForWebsite(retailer.sources[0]?.url)
}

// Discovered stores: own website first, then the matched chain's site, so a
// "Pick n Pay Express" found by location still shows the Pick n Pay mark.
export function nearbyStoreLogoUrl(store: Pick<NearbyStore, 'website' | 'retailerId'>): string | undefined {
  const own = logoUrlForWebsite(store.website)

  if (own) {
    return own
  }

  const retailer = store.retailerId ? retailerById.get(store.retailerId) : undefined
  return retailer ? retailerLogoUrl(retailer) : undefined
}

export function retailerLogoMap(): Record<string, string> {
  const map: Record<string, string> = {}

  for (const retailer of retailers) {
    const logo = retailerLogoUrl(retailer)

    if (logo) {
      map[retailer.id] = logo
    }
  }

  return map
}
