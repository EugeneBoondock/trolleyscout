import { describe, expect, it } from 'vitest'
import type { OrganizationPublication } from './organizationPublicationStore'
import {
  organizationPublicationsToDiscoveryDeals,
  organizationPublicationsToWindowItems,
  organizationPublicationDiscoverySource,
} from './organizationPublicationFeed'

const basePublication: OrganizationPublication = {
  bodyText: 'Fresh produce available from the Orlando West branch this weekend.',
  createdAt: '2026-07-26T08:00:00.000Z',
  createdBy: 'member-1',
  currencyCode: 'ZAR',
  endsAt: '2026-08-02T18:00:00.000Z',
  id: 'org-pub-1',
  imageAlt: 'A crate of ripe tomatoes',
  imageUrl: 'https://images.example.co.za/tomatoes.webp',
  kind: 'deal',
  locationIds: ['location-1'],
  organizationId: 'org-1',
  organizationName: 'Fresh Market',
  organizationSlug: 'fresh-market',
  placement: 'both',
  previousPriceCents: 5999,
  priceCents: 3999,
  startsAt: '2026-07-27T06:00:00.000Z',
  status: 'live',
  targetUrl: 'https://fresh.example.co.za/tomatoes',
  title: 'Fresh tomato tray',
  updatedAt: '2026-07-26T09:00:00.000Z',
}

describe('organization publication feed mapping', () => {
  it('maps commercial marketplace publications to shopper deals', () => {
    const [deal] = organizationPublicationsToDiscoveryDeals([basePublication])

    expect(deal).toEqual(expect.objectContaining({
      evidenceText: basePublication.bodyText,
      id: basePublication.id,
      previousPriceText: 'R59.99',
      priceText: 'R39.99',
      productUrl: basePublication.targetUrl,
      retailerId: 'organization:fresh-market',
      retailerName: 'Fresh Market',
      savingText: 'Save R20.00',
      validFrom: basePublication.startsAt,
      validTo: basePublication.endsAt,
    }))
  })

  it('keeps posts out of the marketplace and includes them in Window Shopping', () => {
    const post: OrganizationPublication = {
      ...basePublication,
      kind: 'post',
      placement: 'window',
      priceCents: undefined,
      previousPriceCents: undefined,
      targetUrl: undefined,
      title: 'Meet our Saturday bakers',
    }

    expect(organizationPublicationsToDiscoveryDeals([post])).toEqual([])
    expect(organizationPublicationsToWindowItems([post])).toEqual([
      expect.objectContaining({
        id: post.id,
        productUrl: 'https://trolleyscout.co.za/window?publication=org-pub-1',
        retailerName: 'Fresh Market',
        source: 'trolleyscout-business',
        title: post.title,
      }),
    ])
  })

  it('honours placement when building each consumer surface', () => {
    const marketplaceOnly = { ...basePublication, placement: 'marketplace' as const }
    const windowOnly = { ...basePublication, id: 'org-pub-2', placement: 'window' as const }

    expect(organizationPublicationsToDiscoveryDeals([marketplaceOnly, windowOnly]).map((item) => item.id))
      .toEqual(['org-pub-1'])
    expect(organizationPublicationsToWindowItems([marketplaceOnly, windowOnly]).map((item) => item.id))
      .toEqual(['org-pub-2'])
  })

  it('reports an available discovery source only when marketplace posts exist', () => {
    expect(organizationPublicationDiscoverySource(
      [basePublication],
      '2026-07-26T10:00:00.000Z',
    )).toEqual(expect.objectContaining({
      itemCount: 1,
      sourceLabel: 'Verified business posts',
      status: 'found',
    }))
    expect(organizationPublicationDiscoverySource([], '2026-07-26T10:00:00.000Z'))
      .toBeUndefined()
  })
})
