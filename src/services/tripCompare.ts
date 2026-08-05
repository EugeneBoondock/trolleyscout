import type { CountryOption, ProductComparisonResult, RetailerProductSearchMatch } from '../types'

export const MAX_TRIP_ITEMS = 8

export interface TripItemPrice {
  match?: RetailerProductSearchMatch
  query: string
}

export interface TripStoreTotal {
  missingQueries: string[]
  pricedItemCount: number
  retailerId: string
  retailerName: string
  totalCents: number
}

export interface TripComparison {
  bestOneStore?: TripStoreTotal
  convenienceCostCents?: number
  country?: CountryOption
  isComplete: boolean
  items: TripItemPrice[]
  pricedItemCount: number
  splitStoreCount: number
  splitTotalCents: number
  stores: TripStoreTotal[]
}

export function parseTripQueries(value: string, limit = MAX_TRIP_ITEMS): string[] {
  const seen = new Set<string>()
  const queries: string[] = []
  for (const line of value.split(/\r?\n/)) {
    const query = line.trim().replace(/^[\s\-â€¢\d.)]+/, '').trim()
    const key = query.toLocaleLowerCase()
    if (query.length < 2 || seen.has(key)) continue
    seen.add(key)
    queries.push(query)
    if (queries.length >= limit) break
  }
  return queries
}

export function buildTripComparison(results: ProductComparisonResult[]): TripComparison {
  const items: TripItemPrice[] = results.map((result) => ({
    match: cheapestPricedMatch(result.matches),
    query: result.query,
  }))
  const storeIds = new Set(results.flatMap((result) => result.matches.map((match) => match.retailerId)))
  const stores = [...storeIds].map((retailerId) => {
    const matches = results.map((result) => ({
      match: result.matches.find((candidate) => candidate.retailerId === retailerId),
      query: result.query,
    }))
    const priced = matches.filter(
      (entry): entry is { match: RetailerProductSearchMatch & { priceCents: number }; query: string } =>
        entry.match?.priceCents !== undefined,
    )
    return {
      missingQueries: matches.filter((entry) => entry.match?.priceCents === undefined).map((entry) => entry.query),
      pricedItemCount: priced.length,
      retailerId,
      retailerName: matches.find((entry) => entry.match)?.match?.retailerName ?? retailerId,
      totalCents: priced.reduce((total, entry) => total + entry.match.priceCents, 0),
    }
  }).sort((left, right) => {
    if (left.pricedItemCount !== right.pricedItemCount) return right.pricedItemCount - left.pricedItemCount
    if (left.totalCents !== right.totalCents) return left.totalCents - right.totalCents
    return left.retailerName.localeCompare(right.retailerName)
  })

  const completeStores = stores
    .filter((store) => store.pricedItemCount === results.length && results.length > 0)
    .sort((left, right) => left.totalCents - right.totalCents)
  const bestOneStore = completeStores[0]
  const pricedItemCount = items.filter((item) => item.match?.priceCents !== undefined).length
  const splitTotalCents = items.reduce((total, item) => total + (item.match?.priceCents ?? 0), 0)
  const splitStoreCount = new Set(
    items.map((item) => item.match?.retailerId).filter((id): id is string => Boolean(id)),
  ).size
  const isComplete = results.length > 0 && pricedItemCount === results.length

  return {
    bestOneStore,
    convenienceCostCents: isComplete && bestOneStore
      ? Math.max(0, bestOneStore.totalCents - splitTotalCents)
      : undefined,
    country: results[0]?.country,
    isComplete,
    items,
    pricedItemCount,
    splitStoreCount,
    splitTotalCents,
    stores,
  }
}

function cheapestPricedMatch(matches: RetailerProductSearchMatch[]): RetailerProductSearchMatch | undefined {
  return matches
    .filter((match) => match.priceCents !== undefined)
    .sort((left, right) => left.priceCents! - right.priceCents!)[0]
}
