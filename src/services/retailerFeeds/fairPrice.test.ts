import { describe, expect, it } from 'vitest'

import { buildFairPriceGraphqlQuery, parseFairPriceFeed } from './fairPrice'

const context = {
  capturedAt: '2026-07-22T08:00:00.000Z',
  page: 1,
  sourceUrl: 'https://www.fairprice.co.za/',
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Heater - Homestar - 10 Bar',
    price_range: {
      minimum_price: {
        discount: { amount_off: 100 },
        final_price: { value: 400 },
        regular_price: { currency: 'ZAR', value: 500 },
      },
    },
    sku: '54-170',
    small_image: { url: 'https://www.fairprice.co.za/media/catalog/product/h.jpg' },
    stock_status: 'IN_STOCK',
    url_key: 'heater-homestar-10-bar-54-170',
    ...overrides,
  }
}

function payload(items: unknown[], totalCount = items.length) {
  return { data: { products: { items, total_count: totalCount } } }
}

describe('parseFairPriceFeed', () => {
  it('keeps in-stock markdowns with both prices and a product link', () => {
    const page = parseFairPriceFeed(payload([product()]), context)

    expect(page.candidates).toEqual([expect.objectContaining({
      imageUrl: 'https://www.fairprice.co.za/media/catalog/product/h.jpg',
      priceCents: 40_000,
      previousPriceCents: 50_000,
      productId: 'fair-price-54-170',
      productUrl: 'https://www.fairprice.co.za/heater-homestar-10-bar-54-170',
      retailerId: 'fair-price',
      savingText: 'Save R100.00',
      scope: { type: 'national' },
      sourceKind: 'structured',
      title: 'Heater - Homestar - 10 Bar',
    })])
    expect(page.catalogues).toEqual([])
  })

  it('skips full-price, out-of-stock, and incomplete rows', () => {
    const page = parseFairPriceFeed(payload([
      product({
        price_range: {
          minimum_price: {
            discount: { amount_off: 0 },
            final_price: { value: 500 },
            regular_price: { currency: 'ZAR', value: 500 },
          },
        },
      }),
      product({ sku: '99-001', stock_status: 'OUT_OF_STOCK' }),
      product({ sku: '99-002', url_key: '' }),
      product({ name: '', sku: '99-003' }),
      'not-a-record',
    ]), context)

    expect(page.candidates).toEqual([])
  })

  it('pages until the reported total is exhausted', () => {
    const first = parseFairPriceFeed(payload([product()], 341), context)
    expect(first.nextCursor).toEqual({ kind: 'page', page: 2 })

    const last = parseFairPriceFeed(
      payload([product()], 341),
      { ...context, page: 4 },
    )
    expect(last.nextCursor).toBeUndefined()
  })

  it('rejects a malformed response outright', () => {
    expect(() => parseFairPriceFeed({ data: {} }, context))
      .toThrow('Invalid Fair Price product response')
  })
})

describe('buildFairPriceGraphqlQuery', () => {
  it('asks for the page of products with both price points', () => {
    const body = JSON.parse(buildFairPriceGraphqlQuery(3)) as { query: string }

    expect(body.query).toContain('currentPage:3')
    expect(body.query).toContain('regular_price')
    expect(body.query).toContain('final_price')
  })
})
