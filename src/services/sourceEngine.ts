import type { Retailer, SourceKind, VerifiedOffer } from '../types'

export function filterRetailers(
  retailers: Retailer[],
  filters: {
    query: string
    sourceKind: SourceKind | 'all'
  },
) {
  const query = filters.query.trim().toLowerCase()

  return retailers.filter((retailer) => {
    const queryHit =
      query.length === 0 ||
      [
        retailer.name,
        retailer.shortName,
        retailer.group,
        retailer.program,
        retailer.sourceNote,
        ...retailer.sources.flatMap((source) => [source.label, source.kind, source.url]),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)

    const kindHit =
      filters.sourceKind === 'all' ||
      retailer.sources.some((source) => source.kind === filters.sourceKind)

    return queryHit && kindHit
  })
}

export function countSources(retailers: Retailer[]) {
  return retailers.reduce((total, retailer) => total + retailer.sources.length, 0)
}

export function countVerifiedOffers(offers: VerifiedOffer[]) {
  return offers.filter((offer) => Boolean(offer.sourceUrl && offer.capturedAt && offer.title)).length
}

export function getSourceKinds(retailers: Retailer[]) {
  return Array.from(
    new Set(retailers.flatMap((retailer) => retailer.sources.map((source) => source.kind))),
  ).sort()
}
