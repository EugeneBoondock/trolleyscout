import { describe, expect, expectTypeOf, it } from 'vitest'
import { parseRetailerSlug } from './types'
import type {
  RetailerDealCandidate,
  RetailerFeedPrice,
  RetailerSlug,
} from './types'
import { parseWoolworthsFeed } from './woolworths'
import type { WoolworthsFeedContext } from './woolworths'

describe('parseWoolworthsFeed', () => {
  it('uses required normalized prices and validated retailer slugs', () => {
    expect(parseRetailerSlug('near-me-market-42')).toBe('near-me-market-42')
    expect(parseRetailerSlug('Near Me Market')).toBeUndefined()
    expect(parseRetailerSlug(' leading-space')).toBeUndefined()
    expectTypeOf<RetailerDealCandidate>().toMatchTypeOf<{
      priceCents: number
      retailerId: RetailerSlug
    }>()
    expectTypeOf<RetailerFeedPrice>().toMatchTypeOf<{
      listId: string
      priceCents: number
    }>()
  })

  it('keeps promotion identity, media, price lists, links, and the next offset', () => {
    const page = parseWoolworthsFeed(
      {
        response: {
          num_results: 2,
          total_num_results: 5,
          results: [
            {
              data: {
                id: '6009211875253',
                description: 'Chuckles Malt Crunch 250 g',
                url: '/prod/Food/Snacks/Chocolate/Chuckles-Malt-Crunch-250-g/_/A-6009211875253',
                image_url: 'https://images.woolworthsstatic.co.za/chuckles.jpg',
                promo: 'WW-2026-0716-CHUCKLES',
                p10: 64.99,
                p30: 59.99,
                p60: 'R 62.49',
                p30_wp: 74.99,
              },
            },
            {
              data: {
                id: 'ordinary-1',
                description: 'Ordinary price item',
                url: '/prod/ordinary-1',
                p10: 20,
              },
            },
          ],
        },
      },
      {
        capturedAt: '2026-07-16T08:00:00.000Z',
        offset: 0,
        pageSize: 24,
        priceList: 'p30',
        sourceUrl: 'https://www.woolworths.co.za/cat?promotion=save-this-week',
      },
    )

    expect(page.totalCount).toBe(5)
    expect(page.nextCursor).toEqual({ kind: 'offset', offset: 2 })
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      capturedAt: '2026-07-16T08:00:00.000Z',
      imageUrl: 'https://images.woolworthsstatic.co.za/chuckles.jpg',
      priceCents: 5_999,
      previousPriceCents: 7_499,
      productId: '6009211875253',
      productUrl:
        'https://www.woolworths.co.za/prod/Food/Snacks/Chocolate/Chuckles-Malt-Crunch-250-g/_/A-6009211875253',
      promotionId: 'WW-2026-0716-CHUCKLES',
      retailerId: 'woolworths',
      scope: { type: 'online' },
      sourceUrl: 'https://www.woolworths.co.za/cat?promotion=save-this-week',
      title: 'Chuckles Malt Crunch 250 g',
    })
    expect(page.candidates[0].prices).toEqual([
      { listId: 'p10', priceCents: 6_499 },
      { listId: 'p30', previousPriceCents: 7_499, priceCents: 5_999 },
      { listId: 'p60', priceCents: 6_249 },
    ])
  })

  it('advances by returned rows when the provider omits a returned count', () => {
    const context = woolworthsContext({ offset: 4, pageSize: 24 })
    const partialPage = parseWoolworthsFeed(
      {
        response: {
          total_num_results: 10,
          results: [woolworthsResult('one'), woolworthsResult('two')],
        },
      },
      context,
    )
    const finalPage = parseWoolworthsFeed(
      {
        response: {
          total_num_results: 6,
          results: [woolworthsResult('one'), woolworthsResult('two')],
        },
      },
      context,
    )
    const emptyPage = parseWoolworthsFeed(
      { response: { total_num_results: 10, results: [] } },
      context,
    )

    expect(partialPage.nextCursor).toEqual({ kind: 'offset', offset: 6 })
    expect(finalPage.nextCursor).toBeUndefined()
    expect(emptyPage.nextCursor).toBeUndefined()
  })

  it('throws for a malformed top-level response', () => {
    expect(() => parseWoolworthsFeed(null, woolworthsContext())).toThrow(
      'Invalid Woolworths feed payload',
    )
    expect(() => parseWoolworthsFeed(
      { response: { results: {} } },
      woolworthsContext(),
    )).toThrow('Invalid Woolworths feed payload')
  })

  it('keeps only promotions active at the Johannesburg date boundary', () => {
    const payload = {
      response: {
        total_num_results: 1,
        results: [woolworthsResult('dated', {
          promo: {
            id: 'WW-DATED',
            startDate: '2026-07-16',
            endDate: '2026-07-16',
          },
        })],
      },
    }

    expect(parseWoolworthsFeed(payload, woolworthsContext({
      capturedAt: '2026-07-16T21:59:59.999Z',
    })).candidates).toHaveLength(1)
    expect(parseWoolworthsFeed(payload, woolworthsContext({
      capturedAt: '2026-07-16T22:00:00.000Z',
    })).candidates).toEqual([])
    expect(parseWoolworthsFeed(
      {
        response: {
          total_num_results: 1,
          results: [woolworthsResult('future', {
            promo: { id: 'WW-FUTURE', startDate: '2026-07-17' },
          })],
        },
      },
      woolworthsContext(),
    ).candidates).toEqual([])
    expect(parseWoolworthsFeed(
      {
        response: {
          total_num_results: 1,
          results: [woolworthsResult('invalid', {
            promo: { id: 'WW-INVALID', endDate: 'not-a-date' },
          })],
        },
      },
      woolworthsContext(),
    ).candidates).toEqual([])
  })

  it('emits capped compact evidence', () => {
    const page = parseWoolworthsFeed(
      {
        response: {
          total_num_results: 1,
          results: [woolworthsResult('evidence', {
            noise: 'x'.repeat(5_000),
            p30: 59.99,
            p30_wp: 74.99,
            promo: {
              description: 'Save now '.repeat(800),
              endDate: '2026-07-20',
              id: 'WW-EVIDENCE',
              startDate: '2026-07-15',
            },
          })],
        },
      },
      woolworthsContext({ priceList: 'p30' }),
    )

    expect(page.candidates[0].evidenceText.length).toBeLessThanOrEqual(512)
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 5_999,
      previousPriceCents: 7_499,
      promotionMarker: 'WW-EVIDENCE',
      scope: 'online',
      sourceId: 'evidence',
      validFrom: '2026-07-15',
      validTo: '2026-07-20',
    })
  })

  it('accepts the live Constructor.io shape where promo is an array of strings', () => {
    // Mirrors the browse API response captured from wpkmgeuco-zone.cnstrc.com.
    const page = parseWoolworthsFeed(
      {
        response: {
          num_results: 1,
          total_num_results: 8067,
          results: [
            {
              value: 'Mixed Vegetables 400 g',
              data: {
                id: '20149116',
                description: 'Mixed Vegetables 400 g',
                url: 'prod/Food/Fresh-Vegetables/Mixed-Vegetables-400-g/_/A-20149116',
                image_url: 'https://assets.woolworthsstatic.co.za/Mixed-Vegetables.jpg',
                promo: ['Buy any 2 save R10 Classic Veg Bags'],
                p10: 43.99,
                p30: 43.99,
                p60: 43.99,
              },
            },
          ],
        },
      },
      { capturedAt: '2026-07-16T08:00:00.000Z', offset: 0, sourceUrl: 'https://example.test' },
    )

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      promotionId: 'Buy any 2 save R10 Classic Veg Bags',
      savingText: 'Buy any 2 save R10 Classic Veg Bags',
      priceCents: 4399,
      productUrl:
        'https://www.woolworths.co.za/prod/Food/Fresh-Vegetables/Mixed-Vegetables-400-g/_/A-20149116',
    })
    expect(page.totalCount).toBe(8067)
  })
})

function woolworthsContext(overrides: Partial<WoolworthsFeedContext> = {}): WoolworthsFeedContext {
  return {
    capturedAt: '2026-07-16T08:00:00.000Z',
    offset: 0,
    pageSize: 24,
    priceList: 'p10',
    sourceUrl: 'https://www.woolworths.co.za/cat?promotion=save-this-week',
    ...overrides,
  }
}

function woolworthsResult(id: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      description: `Product ${id}`,
      id,
      p10: 10,
      promo: `promo-${id}`,
      url: `/prod/${id}`,
      ...overrides,
    },
  }
}

describe('woolworths prices with no markdown', () => {
  // Woolworths writes "no previous price" as 0 rather than leaving the field
  // out, and every multibuy line is priced that way: "buy any 3 for R55" marks
  // nothing down, the saving arrives at the till. Read literally, that zero
  // became a was-price of R0.00 on all 1,765 Woolworths deals on record.
  const multibuy = {
    response: {
      num_results: 1,
      total_num_results: 1,
      results: [
        {
          data: {
            description: 'Penne Pasta 500 g',
            id: '6009189404924',
            image_url: 'https://images.woolworthsstatic.co.za/penne.jpg',
            p10: 22.99,
            p10_wp: 0,
            promo: ['Buy any 3 for R55 Everyday Pasta'],
            url: 'prod/Food/Penne-Pasta-500-g/_/A-6009189404924',
          },
          value: 'Penne Pasta 500 g',
        },
      ],
    },
  }

  it('publishes a multibuy with its offer and no invented was-price', () => {
    const page = parseWoolworthsFeed(multibuy, {
      capturedAt: '2026-07-25T10:00:00.000Z',
      offset: 0,
      pageSize: 100,
      sourceUrl: 'https://www.woolworths.co.za/cat/Food/_/N-1z13sk5',
    })

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      priceCents: 2299,
      savingText: 'Buy any 3 for R55 Everyday Pasta',
    })
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
    expect(page.candidates[0].prices?.[0].previousPriceCents).toBeUndefined()
  })

  it('still reads a real markdown when Woolworths sets one', () => {
    const page = parseWoolworthsFeed(
      {
        response: {
          num_results: 1,
          total_num_results: 1,
          results: [
            {
              data: { ...multibuy.response.results[0].data, p10_wp: 29.99 },
              value: 'Penne Pasta 500 g',
            },
          ],
        },
      },
      {
        capturedAt: '2026-07-25T10:00:00.000Z',
        offset: 0,
        pageSize: 100,
        sourceUrl: 'https://www.woolworths.co.za/cat/Food/_/N-1z13sk5',
      },
    )

    expect(page.candidates[0]).toMatchObject({ previousPriceCents: 2999, priceCents: 2299 })
  })
})
