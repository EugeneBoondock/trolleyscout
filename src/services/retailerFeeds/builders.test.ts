import { describe, expect, it } from 'vitest'
import { parseBuildersFeed } from './builders'

const context = {
  capturedAt: '2026-07-17T08:00:00.000Z',
  sourceUrl: 'https://www.builders.co.za/deals-occ',
}

describe('parseBuildersFeed', () => {
  it('normalizes the verified Builders deal response and keeps only proven active deals', () => {
    const page = parseBuildersFeed({
      pagination: {
        currentPage: 0,
        pageSize: 100,
        totalPages: 2,
        totalResults: 4,
      },
      products: [
        {
          code: 'BUILDER-100',
          dealSash: 'R 200 OFF',
          images: [{ format: 'listing', url: '/medias/paint.jpg' }],
          name: 'True Colour Acrylic PVA 20L',
          price: {
            formattedValue: 'R 2,299.00',
            isPromotion: true,
            priceValidUntil: '2026/12/31',
            value: 2_299,
          },
          url: '/paint/p/BUILDER-100',
          wasPrice: { formattedValue: 'R 2,499.00', value: 2_499 },
        },
        {
          code: 'ordinary-1',
          dealSash: 'R 50 OFF',
          name: 'Ordinary product',
          price: { isPromotion: false, priceValidUntil: '2026/12/31', value: 50 },
          url: '/ordinary/p/ordinary-1',
          wasPrice: { value: 100 },
        },
        {
          code: 'no-sash-1',
          name: 'Promotion without sash proof',
          price: { isPromotion: true, priceValidUntil: '2026/12/31', value: 50 },
          url: '/no-sash/p/no-sash-1',
          wasPrice: { value: 100 },
        },
        {
          code: 'expired-1',
          dealSash: 'R 50 OFF',
          name: 'Expired promotion',
          price: { isPromotion: true, priceValidUntil: '2026/07/16', value: 50 },
          url: '/expired/p/expired-1',
          wasPrice: { value: 100 },
        },
      ],
    }, context)

    expect(page).toMatchObject({
      nextCursor: { kind: 'page', page: 1 },
      totalCount: 4,
    })
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.builders.co.za/medias/paint.jpg',
      priceCents: 229_900,
      previousPriceCents: 249_900,
      productId: 'BUILDER-100',
      productUrl: 'https://www.builders.co.za/paint/p/BUILDER-100',
      promotionId: 'R 200 OFF',
      retailerId: 'builders',
      savingText: 'R 200 OFF',
      sourceUrl: context.sourceUrl,
      validTo: '2026-12-31',
    })
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 229_900,
      previousPriceCents: 249_900,
      promotionMarker: 'R 200 OFF',
      sourceId: 'BUILDER-100',
      validTo: '2026-12-31',
    })
  })

  it('rejects malformed dates and product URLs outside Builders', () => {
    const product = {
      code: 'BUILDER-200',
      dealSash: 'R 20 OFF',
      name: 'Builder product',
      price: { isPromotion: true, priceValidUntil: '2026/13/40', value: 80 },
      url: '/product/p/BUILDER-200',
      wasPrice: { value: 100 },
    }

    expect(parseBuildersFeed({ products: [product] }, context).candidates).toEqual([])
    expect(parseBuildersFeed({
      products: [{
        ...product,
        price: { ...product.price, priceValidUntil: '2026/12/31' },
        url: 'https://example.com/pretend-deal',
      }],
    }, context).candidates).toEqual([])
  })
})
