import type { DealSiteItem } from '../../src/services/dealSites'
import type { DiscoveredDeal, DiscoverySourceResult } from '../../src/types'
import type { OrganizationPublication } from './organizationPublicationStore'

const BUSINESS_PORTAL_URL = 'https://org.trolleyscout.co.za'
const WINDOW_URL = 'https://trolleyscout.co.za/window'

export function organizationPublicationsToDiscoveryDeals(
  publications: OrganizationPublication[],
): DiscoveredDeal[] {
  return publications
    .filter((publication) =>
      publication.kind !== 'post' &&
      (publication.placement === 'marketplace' || publication.placement === 'both'),
    )
    .map((publication) => ({
      capturedAt: publication.updatedAt,
      evidenceText: publication.bodyText,
      expiresAt: publication.endsAt,
      id: publication.id,
      imageUrl: publication.imageUrl,
      previousPriceText: money(publication.previousPriceCents, publication.currencyCode),
      priceText: money(publication.priceCents, publication.currencyCode),
      productUrl: publication.targetUrl ?? windowPublicationUrl(publication.id),
      retailerId: `organization:${publication.organizationSlug}`,
      retailerName: publication.organizationName,
      savingText: savingText(publication),
      soldOut: publication.soldOut || undefined,
      sourceLabel: `${publication.organizationName} business post`,
      sourceUrl: BUSINESS_PORTAL_URL,
      title: publication.title,
      validFrom: publication.startsAt,
      validTo: publication.endsAt,
    }))
}

export function organizationPublicationsToWindowItems(
  publications: OrganizationPublication[],
): DealSiteItem[] {
  return publications
    .filter((publication) =>
      publication.placement === 'window' || publication.placement === 'both',
    )
    .map((publication) => ({
      category: publication.kind === 'post' ? 'Business post' : labelForKind(publication.kind),
      expiresAt: publication.endsAt,
      id: publication.id,
      imageUrl: publication.imageUrl,
      images: publication.imageUrl ? [publication.imageUrl] : undefined,
      previousPriceText: money(publication.previousPriceCents, publication.currencyCode),
      priceText: money(publication.priceCents, publication.currencyCode),
      productUrl: publication.targetUrl ?? windowPublicationUrl(publication.id),
      retailerName: publication.organizationName,
      savingText: savingText(publication),
      source: 'trolleyscout-business',
      sourceLabel: `${publication.organizationName} · ${labelForKind(publication.kind)}`,
      title: publication.title,
    }))
}

export function organizationPublicationDiscoverySource(
  publications: OrganizationPublication[],
  checkedAt: string,
): DiscoverySourceResult | undefined {
  const itemCount = organizationPublicationsToDiscoveryDeals(publications).length
  if (itemCount === 0) return undefined

  return {
    checkedAt,
    itemCount,
    retailerId: 'trolleyscout-business',
    retailerName: 'Trolley Scout businesses',
    sourceLabel: 'Verified business posts',
    sourceUrl: BUSINESS_PORTAL_URL,
    status: 'found',
    statusText: `Found ${itemCount} current business post${itemCount === 1 ? '' : 's'}.`,
  }
}

function money(cents: number | undefined, currency = 'ZAR') {
  if (cents === undefined) return undefined
  const symbol = currency.toUpperCase() === 'ZAR' ? 'R' : `${currency.toUpperCase()} `
  return `${symbol}${(cents / 100).toFixed(2)}`
}

function savingText(publication: OrganizationPublication) {
  if (publication.offerText) return publication.offerText
  if (
    publication.priceCents !== undefined &&
    publication.previousPriceCents !== undefined &&
    publication.previousPriceCents > publication.priceCents
  ) {
    return `Save ${money(
      publication.previousPriceCents - publication.priceCents,
      publication.currencyCode,
    )}`
  }
  return undefined
}

function labelForKind(kind: OrganizationPublication['kind']) {
  return {
    deal: 'Deal',
    post: 'Post',
    promotion: 'Promotion',
    special: 'Special',
  }[kind]
}

function windowPublicationUrl(publicationId: string) {
  const url = new URL(WINDOW_URL)
  url.searchParams.set('publication', publicationId)
  return url.toString()
}
