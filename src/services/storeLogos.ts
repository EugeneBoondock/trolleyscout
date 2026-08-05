// Store logos without any API key: DuckDuckGo's public favicon service serves
// each site's own icon by hostname. Retailers resolve via their first official
// source URL; discovered independents via their website when we found one.

import type { NearbyStore } from './nearbyStores'
import { retailers, retailerById } from '../data/retailers'
import type { Retailer } from '../types'

const CATALOGUE_LOGO_ORIGIN =
  'https://img.offers-cdn.net/assets/uploads/stores/za/logos/200x72_webp'

// These public catalogue-directory logos are checked before release. Several
// South African retailer sites do not expose a usable favicon, which left an
// empty brand tile in catalogue and store views.
const verifiedRetailerLogoSlugs: Partial<Record<Retailer['id'], string>> = {
  ackermans: 'ackermans',
  boxer: 'boxer',
  checkers: 'checkers',
  clicks: 'clicks',
  game: 'game',
  'ok-foods': 'ok-foods',
  pep: 'pep',
  'pick-n-pay': 'pick-n-pay',
  shoprite: 'shoprite',
  spar: 'spar',
  usave: 'usave',
  woolworths: 'woolworths',
}

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

export function retailerLogoUrl(
  retailer: Pick<Retailer, 'id' | 'sources'>,
): string | undefined {
  const verifiedSlug = verifiedRetailerLogoSlugs[retailer.id]
  if (verifiedSlug) {
    return `${CATALOGUE_LOGO_ORIGIN}/${verifiedSlug}.webp`
  }
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
