import { describe, expect, it } from 'vitest'
import { parseMassmartFeed } from './massmart'

describe('parseMassmartFeed', () => {
  it('requires an explicit Game promotion', () => {
    const page = parseMassmartFeed(
      {
        pagination: { currentPage: 0, totalPages: 2, totalResults: 3 },
        products: [
          {
            code: '000000000000502033',
            image: { url: 'https://api-beta-game.walmart.com/medias/coke' },
            name: 'COCA COLA Zero 1.5 L',
            noise: 'x'.repeat(5_000),
            potentialPromotions: [
              { code: '000001080049', description: '3 for R45' },
            ],
            price: { currencyIso: 'ZAR', value: 18 },
            url: '/Groceries-Beverages/p/000000000000502033',
          },
          {
            code: 'ordinary-1',
            name: 'Low ordinary price',
            potentialPromotions: [],
            price: { value: 9.99 },
            url: '/ordinary/p/ordinary-1',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        retailerId: 'game',
        sourceUrl: 'https://www.game.co.za/on-promotion',
      },
    )

    expect(page.totalCount).toBe(3)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 1 })
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://api-beta-game.walmart.com/medias/coke',
      priceCents: 1_800,
      productId: '000000000000502033',
      productUrl: 'https://www.game.co.za/Groceries-Beverages/p/000000000000502033',
      promotionId: '000001080049',
      retailerId: 'game',
      savingText: '3 for R45',
      scope: { type: 'online' },
      title: 'COCA COLA Zero 1.5 L',
    })
    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 1_800,
      promotionMarker: '000001080049',
      scope: 'online',
      sourceId: '000000000000502033',
    })
  })

  it('accepts a Game savings row only when MRP is above the current price', () => {
    const page = parseMassmartFeed(
      {
        pagination: { currentPage: 0, totalPages: 1, totalResults: 3 },
        products: [
          {
            code: 'game-saving-1',
            mrp: { value: 249.99 },
            name: 'Numeric saving product',
            potentialPromotions: [],
            price: { value: 199.99 },
            url: '/numeric-saving/p/game-saving-1',
          },
          {
            code: 'game-ordinary-1',
            mrp: { value: 199.99 },
            name: 'Same price product',
            potentialPromotions: [],
            price: { value: 199.99 },
            url: '/ordinary/p/game-ordinary-1',
          },
          {
            badge: 'Savings',
            code: 'game-unproved-1',
            name: 'Text badge only',
            potentialPromotions: [],
            price: { value: 99.99 },
            url: '/unproved/p/game-unproved-1',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        retailerId: 'game',
        sourceUrl: 'https://www.game.co.za/on-promotion',
      },
    )

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 19_999,
      previousPriceCents: 24_999,
      productId: 'game-saving-1',
      promotionId: 'mrp-saving-game-saving-1',
      savingText: 'Save R50.00',
    })
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      previousPriceCents: 24_999,
      promotionMarker: 'mrp>price',
    })
  })

  it('requires the complete Builders promotion signal', () => {
    const payload = {
      products: [
        {
          itemId: 'BUILDER-100',
          code: '100',
          name: 'True Colour Acrylic PVA 20L',
          noise: 'x'.repeat(5_000),
          url: '/paint/p/100',
          images: [{ format: 'listing', url: '/medias/paint' }],
          price: {
            formattedValue: 'R449',
            isPromotion: true,
            value: 449,
          },
          wasPrice: { formattedValue: 'R619', value: 619 },
          dealSash: 'Save R170',
        },
        {
          itemId: 'ordinary-1',
          name: 'Sash without an explicit flag',
          url: '/ordinary/p/ordinary-1',
          price: { value: 100 },
          wasPrice: { value: 200 },
          dealSash: 'Save R100',
        },
      ],
    }
    const context = {
      capturedAt: '2026-07-16T08:00:00.000Z',
      retailerId: 'builders' as const,
      sourceUrl: 'https://www.builders.co.za/promotions',
      validTo: '2026-07-20',
    }

    const page = parseMassmartFeed(payload, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.builders.co.za/medias/paint',
      priceCents: 44_900,
      previousPriceCents: 61_900,
      productId: 'BUILDER-100',
      productUrl: 'https://www.builders.co.za/paint/p/100',
      promotionId: 'Save R170',
      retailerId: 'builders',
      savingText: 'Save R170',
      title: 'True Colour Acrylic PVA 20L',
      validTo: '2026-07-20',
    })
    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 44_900,
      previousPriceCents: 61_900,
      promotionMarker: 'Save R170',
      scope: 'online',
      sourceId: 'BUILDER-100',
      validTo: '2026-07-20',
    })

    expect(parseMassmartFeed(payload, { ...context, validTo: '2026-07-15' }).candidates).toEqual([])
    expect(parseMassmartFeed(payload, { ...context, validTo: undefined }).candidates).toEqual([])
  })

  it('requires a Makro numeric promotion signal', () => {
    const page = parseMassmartFeed(
      {
        products: [
          {
            finalPrice: 429,
            imageUrl: 'https://www.makro.co.za/medias/whiskas',
            mrp: 499,
            noise: 'x'.repeat(5_000),
            productId: 'MKR-1',
            title: 'Whiskas Dry Adult Cat Food',
            totalDiscount: 0,
            url: '/whiskas/p/MKR-1',
          },
          {
            finalPrice: 299,
            productId: 'MKR-2',
            title: 'Promoted Product',
            totalDiscount: 9,
            url: '/product/p/MKR-2',
          },
          {
            badge: 'Hot deal',
            finalPrice: 100,
            mrp: 100,
            productId: 'ordinary-1',
            title: 'Ordinary Product',
            totalDiscount: 0,
            url: '/ordinary/p/ordinary-1',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        retailerId: 'makro',
        sourceUrl: 'https://www.makro.co.za/promotions',
      },
    )

    expect(page.candidates).toHaveLength(2)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.makro.co.za/medias/whiskas',
      priceCents: 42_900,
      previousPriceCents: 49_900,
      productId: 'MKR-1',
      productUrl: 'https://www.makro.co.za/whiskas/p/MKR-1',
      promotionId: 'MKR-1',
      retailerId: 'makro',
      title: 'Whiskas Dry Adult Cat Food',
    })
    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 42_900,
      previousPriceCents: 49_900,
      promotionMarker: 'mrp>finalPrice',
      scope: 'online',
      sourceId: 'MKR-1',
    })
    expect(page.candidates[1]).toMatchObject({
      priceCents: 29_900,
      previousPriceCents: undefined,
      productId: 'MKR-2',
    })
  })

  it('throws for a malformed top-level response', () => {
    const context = {
      capturedAt: '2026-07-16T08:00:00.000Z',
      retailerId: 'game' as const,
      sourceUrl: 'https://www.game.co.za/on-promotion',
    }

    expect(() => parseMassmartFeed(null, context)).toThrow('Invalid Massmart feed payload')
    expect(() => parseMassmartFeed({ products: {} }, context)).toThrow(
      'Invalid Massmart feed payload',
    )
  })

  it('rejects inactive or invalid source windows', () => {
    const payload = {
      products: [{
        code: 'dated-game',
        name: 'Dated Game deal',
        potentialPromotions: [{ code: 'GAME-DATED' }],
        price: { value: 10 },
        url: '/dated-game',
      }],
    }
    const context = {
      capturedAt: '2026-07-16T08:00:00.000Z',
      retailerId: 'game' as const,
      sourceUrl: 'https://www.game.co.za/on-promotion',
    }

    expect(parseMassmartFeed(payload, { ...context, validFrom: '2026-07-17' }).candidates).toEqual([])
    expect(parseMassmartFeed(payload, { ...context, validTo: '2026-07-15' }).candidates).toEqual([])
    expect(parseMassmartFeed(payload, { ...context, validTo: 'invalid' }).candidates).toEqual([])
  })
})
