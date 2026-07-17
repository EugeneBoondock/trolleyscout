import { describe, expect, it } from 'vitest'
import { parseClicksFeed } from './clicks'

describe('parseClicksFeed', () => {
  it('returns only explicitly promoted result rows', () => {
    const page = parseClicksFeed(
      {
        pagination: {
          currentPage: 1,
          pageSize: 2,
          totalNumberOfResults: 5,
          totalPages: 3,
        },
        results: [
          {
            brand: 'Yardley',
            code: '180234',
            images: [
              { format: 'thumbnail', url: '/medias/yardley-small.jpg' },
              { format: 'productListing', url: '/medias/yardley-listing.jpg' },
            ],
            name: 'Stayfast Pressed Powder Deep Beige 04 15g',
            potentialPromotions: [
              {
                code: '202607092032131394',
                description: 'Save 30% until 22 July 2026',
                endDate: '2026-07-22T21:59:59.000Z',
              },
            ],
            price: {
              formattedValue: 'R 249.95',
              grossPriceWithPromotionApplied: 174.965,
            },
            stock: { stockLevelStatus: { code: 'inStock' } },
            url: '/yardley_stayfast-pressed-powder/p/180234',
          },
          {
            brand: 'BST',
            code: 'ordinary-1',
            name: 'Ordinary item',
            potentialPromotions: [],
            price: { formattedValue: 'R 99.00', value: 99 },
            url: '/ordinary/p/ordinary-1',
          },
        ],
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        sourceUrl: 'https://clicks.co.za/promotions',
      },
    )

    expect(page.totalCount).toBe(5)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 2 })
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://clicks.co.za/medias/yardley-listing.jpg',
      priceCents: 17_497,
      previousPriceCents: 24_995,
      productId: '180234',
      productUrl: 'https://clicks.co.za/yardley_stayfast-pressed-powder/p/180234',
      promotionId: '202607092032131394',
      retailerId: 'clicks',
      savingText: 'Save 30% until 22 July 2026',
      scope: { type: 'online' },
      title: 'Yardley Stayfast Pressed Powder Deep Beige 04 15g',
      validTo: '2026-07-22T21:59:59.000Z',
    })
  })

  it('throws for a malformed top-level response', () => {
    const context = clicksContext()

    expect(() => parseClicksFeed(null, context)).toThrow('Invalid Clicks feed payload')
    expect(() => parseClicksFeed({ results: {} }, context)).toThrow(
      'Invalid Clicks feed payload',
    )
  })

  it('rejects inactive and invalid promotion windows', () => {
    const context = clicksContext()

    expect(parseClicksFeed({
      results: [clicksResult('active', { startDate: '2026-07-16', endDate: '2026-07-16' })],
    }, context).candidates).toHaveLength(1)
    expect(parseClicksFeed({
      results: [clicksResult('expired', { endDate: '2026-07-15' })],
    }, context).candidates).toEqual([])
    expect(parseClicksFeed({
      results: [clicksResult('future', { startDate: '2026-07-17' })],
    }, context).candidates).toEqual([])
    expect(parseClicksFeed({
      results: [clicksResult('invalid', { endDate: '32 July' })],
    }, context).candidates).toEqual([])
  })

  it('emits capped compact evidence', () => {
    const page = parseClicksFeed(
      {
        results: [clicksResult('evidence', {
          code: 'CLICKS-EVIDENCE',
          description: 'Save now '.repeat(800),
          endDate: '2026-07-20',
          startDate: '2026-07-15',
        }, { noise: 'x'.repeat(5_000) })],
      },
      clicksContext(),
    )

    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 7_500,
      previousPriceCents: 10_000,
      promotionMarker: 'CLICKS-EVIDENCE',
      scope: 'online',
      sourceId: 'evidence',
      validFrom: '2026-07-15',
      validTo: '2026-07-20',
    })
  })

  it('does not advance an empty final page', () => {
    const page = parseClicksFeed(
      {
        pagination: { currentPage: 2, totalPages: 3, totalNumberOfResults: 4 },
        results: [],
      },
      clicksContext(),
    )

    expect(page.nextCursor).toBeUndefined()
    expect(page.totalCount).toBe(4)
  })
})

function clicksContext() {
  return {
    capturedAt: '2026-07-16T08:00:00.000Z',
    sourceUrl: 'https://clicks.co.za/promotions',
  }
}

function clicksResult(
  id: string,
  promotion: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    brand: 'Brand',
    code: id,
    name: `Product ${id}`,
    potentialPromotions: [{ code: `promo-${id}`, description: 'Save', ...promotion }],
    price: { formattedValue: 'R 100.00', grossPriceWithPromotionApplied: 75 },
    url: `/product/p/${id}`,
    ...overrides,
  }
}
