import { describe, expect, it } from 'vitest'
import type { StoreLeaflet } from '../../src/types'
import type { StoredDealItem } from './dealItemStore'
import {
  buildScoutContext,
  mapScoutAnswer,
  normalizeScoutChatRequest,
} from './scoutChat'

function deal(overrides: Partial<StoredDealItem>): StoredDealItem {
  return {
    capturedAt: '2026-07-26T10:00:00.000Z',
    contentFingerprint: 'fingerprint',
    countryCode: 'ZA',
    createdAt: '2026-07-26T10:00:00.000Z',
    currencyCode: 'ZAR',
    evidenceText: 'Official product feed.',
    expiresAt: '2026-07-27T10:00:00.000Z',
    id: 'deal-1',
    lastSeenAt: '2026-07-26T10:00:00.000Z',
    priceCents: 7999,
    previousPriceCents: 10999,
    productId: 'coffee-1',
    productUrl: 'https://retailer.test/coffee',
    promotionId: 'promo-1',
    retailerId: 'checkers',
    savingText: 'Save R30',
    scope: { type: 'online' },
    sourceKey: 'checkers::specials',
    sourceKind: 'structured',
    sourceUrl: 'https://retailer.test/specials',
    status: 'active',
    title: 'Ground coffee 250g',
    updatedAt: '2026-07-26T10:00:00.000Z',
    ...overrides,
  }
}

const catalogue: StoreLeaflet = {
  capturedAt: '2026-07-26T10:00:00.000Z',
  id: 'catalogue-1',
  imageUrl: 'https://retailer.test/catalogue.webp',
  name: 'Weekly catalogue',
  pages: [
    {
      height: 0,
      imageUrl: 'https://retailer.test/page-1.webp',
      pageNumber: 1,
      width: 0,
    },
    {
      height: 0,
      imageUrl: 'https://retailer.test/page-2.webp',
      pageNumber: 2,
      width: 0,
    },
  ],
  retailerId: 'checkers',
  retailerName: 'Checkers',
  url: 'https://retailer.test/catalogue',
  validFrom: '2026-07-24',
  validTo: '2026-07-31',
}

describe('normalizeScoutChatRequest', () => {
  it('trims the message and keeps only the newest bounded history', () => {
    const result = normalizeScoutChatRequest({
      message: '  Find coffee deals  ',
      history: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? 'user' : 'assistant',
        text: `Turn ${index}`,
      })),
    })

    expect(result.message).toBe('Find coffee deals')
    expect(result.history).toHaveLength(8)
    expect(result.history[0].text).toBe('Turn 4')
  })

  it('rejects empty and oversized shopper messages', () => {
    expect(() => normalizeScoutChatRequest({ message: '   ' })).toThrow('Enter a message')
    expect(() => normalizeScoutChatRequest({ message: 'x'.repeat(601) })).toThrow('600 characters')
  })
})

describe('buildScoutContext', () => {
  it('keeps in-stock deals, ranks real savings, and carries catalogue pages', () => {
    const context = buildScoutContext(
      [
        deal({ id: 'small-save', priceCents: 9000, previousPriceCents: 10000 }),
        deal({ id: 'sold-out', soldOut: true, priceCents: 1000, previousPriceCents: 10000 }),
        deal({ id: 'large-save', priceCents: 3000, previousPriceCents: 10000 }),
      ],
      [catalogue],
      'ZAR',
    )

    expect(context.deals.map((item) => item.id)).toEqual(['large-save', 'small-save'])
    expect(context.deals[0]).toMatchObject({
      priceText: 'R30.00',
      previousPriceText: 'R100.00',
    })
    expect(context.catalogues[0]).toMatchObject({
      id: 'catalogue-1',
      pageCount: 2,
      pageImageUrls: [
        'https://retailer.test/page-1.webp',
        'https://retailer.test/page-2.webp',
      ],
    })
  })

  it('keeps a remote page list and does not describe a cover as the full catalogue', () => {
    const pagesUrl =
      'https://trolleyscout.co.za/api/catalogue-pages?flyer=3703321&store=boxer'
    const context = buildScoutContext(
      [],
      [{
        ...catalogue,
        pages: [catalogue.pages![0]],
        pagesUrl,
      }],
      'ZAR',
    )

    expect(context.catalogues[0]).toMatchObject({
      id: 'catalogue-1',
      pageCount: 0,
      pageImageUrls: ['https://retailer.test/page-1.webp'],
      pagesUrl,
    })
  })

  it('does not describe a multi-page PDF cover as a one-page catalogue', () => {
    const context = buildScoutContext(
      [],
      [{
        ...catalogue,
        documentUrl: 'https://cdn.retailer.test/weekly-catalogue.pdf',
        pages: [catalogue.pages![0]],
      }],
      'ZAR',
    )

    expect(context.catalogues[0]).toMatchObject({
      id: 'catalogue-1',
      pageCount: 0,
      pageImageUrls: ['https://retailer.test/page-1.webp'],
    })
  })

  it('selects safe shopper fields and turns personal offers into trusted cards', () => {
    const context = buildScoutContext([], [], 'ZAR', {
      basket: {
        items: [{
          deal: {
            imageUrl: 'https://retailer.test/basket.webp',
            priceText: 'R49.99',
            productUrl: 'https://retailer.test/basket',
            retailerName: 'Basket Store',
            secretNote: 'do not copy',
            title: 'Basket cereal',
          },
          quantity: 2,
        }],
      },
      favouriteStores: [{
        displayName: 'Favourite Market',
        id: 'favourite-market',
        savedAt: 1_800_000_000_000,
      }],
      followedStores: [{
        retailerId: 'followed-store',
        retailerName: 'Followed Store',
        sourceUrl: 'https://retailer.test/specials',
      }],
      recentPropertySearches: ['Cape Town', 'Cape Town', 12],
      savedDeals: [{
        id: 'saved-row',
        priceText: 'R89.99',
        productUrl: 'https://retailer.test/saved',
        retailerName: 'Saved Store',
        title: 'Saved coffee',
      }],
      savedProperties: [{
        accountId: 'must-not-appear',
        bedrooms: 3,
        listingType: 'sale',
        listingUrl: 'https://property.test/home',
        location: 'Cape Town',
        portalName: 'Property Portal',
        priceText: 'R2 500 000',
        title: 'Saved family home',
      }],
      windowShoppingSaves: [{
        productUrl: 'https://retailer.test/window',
        retailerName: 'Window Store',
        soldOut: true,
        title: 'Saved sneakers',
      }],
    })

    expect(context.shopper).toMatchObject({
      basket: [{
        dealId: 'personal:basket:0',
        quantity: 2,
        title: 'Basket cereal',
      }],
      favouriteStores: [{ id: 'favourite-market', name: 'Favourite Market' }],
      followedStores: [{ id: 'followed-store', name: 'Followed Store' }],
      properties: {
        recentSearches: ['Cape Town'],
        saved: [{
          bedrooms: 3,
          location: 'Cape Town',
          title: 'Saved family home',
        }],
      },
      savedDeals: [{ dealId: 'personal:saved:0', title: 'Saved coffee' }],
      windowShoppingSaves: [{
        dealId: 'personal:window:0',
        soldOut: true,
        title: 'Saved sneakers',
      }],
    })
    expect(context.deals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'personal:saved:0', title: 'Saved coffee' }),
      expect.objectContaining({ id: 'personal:window:0', soldOut: true }),
      expect.objectContaining({ id: 'personal:basket:0', title: 'Basket cereal' }),
    ]))
    expect(JSON.stringify(context)).not.toContain('must-not-appear')
    expect(JSON.stringify(context)).not.toContain('secretNote')
  })
})

describe('mapScoutAnswer', () => {
  it('maps model-selected IDs back to the trusted cards and ignores invented IDs', () => {
    const context = buildScoutContext([deal({ id: 'deal-1' })], [catalogue], 'ZAR')
    const answer = mapScoutAnswer({
      reply: 'Coffee is cheapest in the deal shown below.',
      dealIds: ['invented', 'deal-1'],
      catalogueIds: ['catalogue-1', 'invented-catalogue'],
      followUps: ['Show breakfast deals'],
    }, context)

    expect(answer.deals.map((item) => item.id)).toEqual(['deal-1'])
    expect(answer.catalogues.map((item) => item.id)).toEqual(['catalogue-1'])
    expect(answer.followUps).toEqual(['Show breakfast deals'])
  })
})
