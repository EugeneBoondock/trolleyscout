import type { StoreLeaflet } from '../types'

export interface CatalogueGroup {
  retailerId: string
  retailerName: string
  leaflets: StoreLeaflet[]
}

export type CatalogueSort = 'latest' | 'oldest' | 'store'

function dateTime(value: string | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function compareLeafletsMostRecent(left: StoreLeaflet, right: StoreLeaflet): number {
  const leftCaptured = dateTime(left.capturedAt)
  const rightCaptured = dateTime(right.capturedAt)
  const leftValidFrom = dateTime(left.validFrom)
  const rightValidFrom = dateTime(right.validFrom)
  const leftPrimary = leftValidFrom === Number.NEGATIVE_INFINITY ? leftCaptured : leftValidFrom
  const rightPrimary = rightValidFrom === Number.NEGATIVE_INFINITY ? rightCaptured : rightValidFrom
  if (leftPrimary !== rightPrimary) return rightPrimary > leftPrimary ? 1 : -1
  if (leftCaptured !== rightCaptured) return rightCaptured > leftCaptured ? 1 : -1

  const retailerDifference = left.retailerName.localeCompare(right.retailerName)
  if (retailerDifference !== 0) return retailerDifference
  return left.name.localeCompare(right.name)
}

export function sortLeafletsMostRecent(leaflets: StoreLeaflet[]): StoreLeaflet[] {
  return [...leaflets].sort(compareLeafletsMostRecent)
}

export function sortLeaflets(
  leaflets: StoreLeaflet[],
  sort: CatalogueSort = 'latest',
): StoreLeaflet[] {
  if (sort === 'oldest') {
    return [...leaflets].sort((left, right) => compareLeafletsMostRecent(right, left))
  }
  if (sort === 'store') {
    return [...leaflets].sort((left, right) => {
      const storeDifference = left.retailerName.localeCompare(right.retailerName)
      return storeDifference || compareLeafletsMostRecent(left, right)
    })
  }
  return sortLeafletsMostRecent(leaflets)
}

export function groupLeafletsByRetailer(
  leaflets: StoreLeaflet[],
  sort: CatalogueSort = 'latest',
): CatalogueGroup[] {
  const byRetailer = new Map<string, CatalogueGroup>()
  const sortedLeaflets = sortLeaflets(leaflets, sort)

  for (const leaflet of sortedLeaflets) {
    const key = leaflet.retailerId || leaflet.retailerName.toLowerCase()
    const group = byRetailer.get(key)

    if (group) {
      group.leaflets.push(leaflet)
    } else {
      byRetailer.set(key, {
        leaflets: [leaflet],
        retailerId: key,
        retailerName: leaflet.retailerName,
      })
    }
  }

  return Array.from(byRetailer.values())
}
