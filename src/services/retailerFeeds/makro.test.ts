import { describe, expect, it } from 'vitest'
import { decodeMakroInitialState, parseMakroFeed } from './makro'

const context = {
  capturedAt: '2026-07-17T08:00:00.000Z',
  sourceUrl: 'https://www.makro.co.za/catalogues-store',
}

describe('Makro catalogue feed', () => {
  it('extracts one balanced initial-state object from official page HTML', () => {
    const state = makroState([makroProduct()])
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify({
      ...state,
      text: 'A title with } inside',
    })}; window.after = {"ignored":true};</script>`

    expect(decodeMakroInitialState(html)).toMatchObject(state)
    expect(() => decodeMakroInitialState(
      '<script>window.__INITIAL_STATE__ = {"pageDataV4":{}}</script>',
    )).toThrow(/Makro/)
  })

  it('reads verified ProductSummaryValue cards and rejects ordinary-price rows', () => {
    const page = parseMakroFeed(makroState([
      makroProduct(),
      makroProduct({
        baseUrl: '/ordinary-product/p/ordinary-1',
        id: 'ordinary-1',
        itemId: 'ordinary-item-1',
        pricing: {
          finalPrice: { value: 43.95 },
          mrp: { value: 43.95 },
          totalDiscount: 0,
        },
        smartUrl: 'https://www.makro.co.za/ordinary-product/p/ordinary-1',
        titles: { title: 'Ordinary product' },
      }),
      makroProduct({
        baseUrl: 'https://example.com/pretend-deal',
        id: 'external-1',
        smartUrl: 'https://example.com/pretend-deal',
      }),
    ]), context)

    expect(page.totalCount).toBe(3)
    expect(page.nextCursor).toBeUndefined()
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://www.makro.co.za/asset/rukmini/fccp/416/416/product.jpeg?q=80',
      priceCents: 2_995,
      previousPriceCents: 3_295,
      productId: 'RICH26RXXVNPPTA3',
      productUrl: 'https://www.makro.co.za/tastic-boiled-rice-parboiled/p/itmd5218db46b3eb?pid=RICH26RXXVNPPTA3',
      retailerId: 'makro',
      sourceUrl: context.sourceUrl,
      title: 'Tastic Boiled Rice (Parboiled)',
    })
    expect(JSON.parse(page.candidates[0].evidenceText)).toMatchObject({
      priceCents: 2_995,
      previousPriceCents: 3_295,
      promotionMarker: 'mrp>finalPrice',
      sourceId: 'RICH26RXXVNPPTA3',
    })
  })
})

function makroState(products: unknown[]) {
  return {
    pageDataV4: {
      page: {
        data: {
          ROOT: {
            2: {
              widget: {
                data: {
                  renderableComponents: products.map((value) => ({
                    rcType: 'productCard',
                    value,
                  })),
                },
              },
            },
          },
        },
      },
    },
  }
}

function makroProduct(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: '/tastic-boiled-rice-parboiled/p/itmd5218db46b3eb?pid=RICH26RXXVNPPTA3',
    id: 'RICH26RXXVNPPTA3',
    itemId: 'ITMD5218DB46B3EB',
    media: {
      images: [{
        url: 'https://www.makro.co.za/asset/rukmini/fccp/{@width}/{@height}/product.jpeg?q={@quality}',
      }],
    },
    pricing: {
      finalPrice: { decimalValue: '29.95', value: 29.95 },
      mrp: { decimalValue: '32.95', value: 32.95 },
      totalDiscount: 9,
    },
    productAction: {
      action: { params: { productId: 'RICH26RXXVNPPTA3' } },
      tracking: { itemName: 'Tastic Boiled Rice (Parboiled)' },
    },
    smartUrl: 'http://www.makro.co.za/tastic-boiled-rice-parboiled/p/itmd5218db46b3eb?pid=RICH26RXXVNPPTA3',
    titles: { title: 'Tastic Boiled Rice (Parboiled)' },
    type: 'ProductSummaryValue',
    ...overrides,
  }
}
