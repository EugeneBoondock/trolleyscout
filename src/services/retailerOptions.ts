import type {
  DiscoveredDeal,
  Retailer,
  RetailerOfferStatus,
  StoreLeaflet,
} from '../types'

interface RetailerPickerOption {
  catalogueCount?: number
  count: number
  id: string
  name: string
  offerStatus?: RetailerOfferStatus
}

interface MutableRetailerOption extends RetailerPickerOption {
  catalogueCount: number
}

export function buildRetailerPickerOptions(
  deals: readonly DiscoveredDeal[],
  leaflets: readonly StoreLeaflet[],
  retailerCatalog: readonly Pick<Retailer, 'id' | 'name' | 'offerStatus'>[] = [],
): RetailerPickerOption[] {
  const options = new Map<string, MutableRetailerOption>()
  const retailerIdByName = new Map<string, string>()

  for (const retailer of retailerCatalog) {
    const id = retailer.id.trim()
    const name = retailer.name.trim()
    if (!id || !name) continue

    options.set(id, {
      catalogueCount: 0,
      count: 0,
      id,
      name,
      offerStatus: retailer.offerStatus,
    })
    retailerIdByName.set(retailerNameKey(name), id)
  }

  for (const deal of deals) {
    const suppliedId = deal.retailerId.trim()
    const name = deal.retailerName.trim()
    const id = options.has(suppliedId)
      ? suppliedId
      : retailerIdByName.get(retailerNameKey(name)) ?? suppliedId
    if (!id || !name) continue

    const option = options.get(id)
    if (option) {
      option.count += 1
    } else {
      options.set(id, { catalogueCount: 0, count: 1, id, name })
    }
    retailerIdByName.set(retailerNameKey(name), id)
  }

  for (const leaflet of leaflets) {
    const name = leaflet.retailerName.trim()
    const suppliedId = leaflet.retailerId.trim()
    const nameId = retailerIdByName.get(retailerNameKey(name))
    const id = options.has(suppliedId)
      ? suppliedId
      : nameId ?? (suppliedId || retailerSlug(name))
    if (!id || !name) continue

    const option = options.get(id)
    if (option) {
      option.catalogueCount += 1
    } else {
      options.set(id, {
        catalogueCount: 1,
        count: 0,
        id,
        name,
      })
    }
    retailerIdByName.set(retailerNameKey(name), id)
  }

  return Array.from(options.values())
    .sort((left, right) => left.name.localeCompare(right.name))
}

function retailerNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function retailerSlug(value: string): string {
  return retailerNameKey(value).replace(/\s+/g, '-')
}
