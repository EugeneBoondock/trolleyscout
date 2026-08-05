import { retailerById } from '../data/retailers'
import type { DiscoveryRun, DiscoveredDeal, Retailer, StoreLeaflet } from '../types'
import type { NearbyStoreResult } from './apiClient'

export interface DiscoveredStoreGroup {
  branchCount: number
  branches: NearbyStoreResult[]
  displayName: string
  dealCount: number
  id: string
  catalogueCount: number
  logoUrl?: string
  nearestDistanceM?: number
  promotionCount: number
  retailerId?: string
}

interface MutableStoreGroup {
  branches: NearbyStoreResult[]
  id: string
  retailerId?: string
}

export function groupDiscoveredStores(
  stores: NearbyStoreResult[],
  marketplace?: DiscoveryRun,
): DiscoveredStoreGroup[] {
  const groups: MutableStoreGroup[] = []
  const knownGroups = new Map<string, MutableStoreGroup>()
  const unknownHostGroups = new Map<string, MutableStoreGroup>()
  const unknownNameGroups = new Map<string, MutableStoreGroup>()

  for (const store of stores) {
    const canonicalName = normalizeFullStoreName(store.name)

    if (store.retailerId) {
      const existing = knownGroups.get(store.retailerId)

      if (existing) {
        existing.branches.push(store)
        continue
      }

      const group: MutableStoreGroup = {
        branches: [store],
        id: `retailer:${store.retailerId}`,
        retailerId: store.retailerId,
      }
      knownGroups.set(store.retailerId, group)
      groups.push(group)
      continue
    }

    const host = verifiedWebsiteHost(store.website)
    const brandName = conservativeBrandName(canonicalName)
    const existing = (brandName ? unknownNameGroups.get(brandName) : undefined)
      ?? (host ? unknownHostGroups.get(host) : undefined)

    if (existing) {
      existing.branches.push(store)
      continue
    }

    const group: MutableStoreGroup = {
      branches: [store],
      id: host ? `website:${host}` : brandName ? `name:${slug(brandName)}` : `store:${store.placeId}`,
    }

    if (brandName) {
      unknownNameGroups.set(brandName, group)
    }

    if (host) {
      unknownHostGroups.set(host, group)
    }

    groups.push(group)
  }

  return groups
    .map((group) => toPublicGroup(group, marketplace))
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
}

function toPublicGroup(group: MutableStoreGroup, marketplace?: DiscoveryRun): DiscoveredStoreGroup {
  const retailer = group.retailerId
    ? retailerById.get(group.retailerId as Retailer['id'])
    : undefined
  const displayName = retailer?.name ?? cleanIndependentName(group.branches)
  const marketplaceDeals = marketplace?.deals.filter((deal) =>
    matchesMarketplaceStore(group.retailerId, displayName, deal.retailerId, deal.retailerName),
  ) ?? []
  const marketplaceCatalogues = marketplace?.leaflets?.filter((leaflet) =>
    matchesMarketplaceStore(group.retailerId, displayName, leaflet.retailerId, leaflet.retailerName),
  ) ?? []
  const branchDeals = group.branches.flatMap((branch) => branch.deals ?? [])
  const branchCatalogues = group.branches.flatMap((branch) => branch.leaflets ?? [])
  const dealCount = uniqueDeals([...branchDeals, ...marketplaceDeals]).length
  const catalogueCount = uniqueCatalogues([...branchCatalogues, ...marketplaceCatalogues]).length
  const countedPromotions = dealCount + catalogueCount
  const branchPromotionCount = uniqueGroupPromotionCount(group.branches)

  return {
    branchCount: group.branches.length,
    branches: group.branches,
    displayName,
    dealCount,
    id: group.id,
    catalogueCount,
    logoUrl: group.branches.find((branch) => branch.logoUrl)?.logoUrl,
    nearestDistanceM: group.branches.reduce<number | undefined>(
      (nearest, branch) => branch.distanceM === undefined
        ? nearest
        : nearest === undefined
          ? branch.distanceM
          : Math.min(nearest, branch.distanceM),
      undefined,
    ),
    promotionCount: Math.max(countedPromotions, branchPromotionCount),
    retailerId: group.retailerId,
  }
}

function uniqueDeals(deals: DiscoveredDeal[]): DiscoveredDeal[] {
  const seen = new Set<string>()
  return deals.filter((deal) => seen.add(
    deal.id || `${deal.productUrl ?? deal.sourceUrl}:${deal.title}`,
  ))
}

function uniqueCatalogues(catalogues: StoreLeaflet[]): StoreLeaflet[] {
  const seen = new Set<string>()
  return catalogues.filter((catalogue) => seen.add(
    catalogue.id || `${catalogue.url}:${catalogue.name}`,
  ))
}

function matchesMarketplaceStore(
  groupRetailerId: string | undefined,
  groupName: string,
  contentRetailerId: string | undefined,
  contentRetailerName: string,
): boolean {
  const groupId = canonicalRetailerId(groupRetailerId)
  const contentId = canonicalRetailerId(contentRetailerId)
  if (groupId && contentId) return groupId === contentId
  return normalizeFullStoreName(groupName) === normalizeFullStoreName(contentRetailerName)
}

function canonicalRetailerId(value: string | undefined): string | undefined {
  const id = value?.trim().toLocaleLowerCase('en-ZA')
  if (!id) return undefined
  if (id === 'picknpay' || id === 'pnp') return 'pick-n-pay'
  return id
}

function uniqueGroupPromotionCount(branches: NearbyStoreResult[]): number {
  const promotions = branches.flatMap((branch) => branch.promotions ?? [])
  if (promotions.length === 0) {
    return branches.reduce(
      (total, branch) => total + (branch.promotionCount ?? 0),
      0,
    )
  }

  return new Set(promotions.map((promotion) =>
    promotion.id ||
    `${promotion.kind}:${promotion.productUrl ?? promotion.sourceUrl}:${promotion.title}`,
  )).size
}

function cleanIndependentName(branches: NearbyStoreResult[]): string {
  return branches
    .map((branch) => branch.name.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .sort((left, right) => left.length - right.length || left.localeCompare(right))[0] ?? 'Independent store'
}

export function normalizeFullStoreName(name: string): string {
  return name
    .normalize('NFKD')
    .toLocaleLowerCase('en-ZA')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function verifiedWebsiteHost(website: string | undefined): string | undefined {
  if (!website) {
    return undefined
  }

  try {
    const url = new URL(website)

    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
      return undefined
    }

    const host = url.hostname.toLocaleLowerCase('en-ZA').replace(/^www\./, '').replace(/\.$/, '')
    return host.includes('.') ? host : undefined
  } catch {
    return undefined
  }
}

function slug(value: string): string {
  return value.replace(/\s+/g, '-') || 'independent-store'
}

function conservativeBrandName(value: string): string | undefined {
  const genericNames = new Set([
    'convenience store',
    'grocery store',
    'market',
    'mini market',
    'shop',
    'spaza',
    'spaza shop',
    'store',
    'supermarket',
  ])

  return value && !genericNames.has(value) ? value : undefined
}
