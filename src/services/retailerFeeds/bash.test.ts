import { describe, expect, it } from 'vitest'
import {
  BASH_STOREFRONTS,
  buildBashSaleUrl,
  decodeBashNextData,
  parseBashFeed,
} from './bash'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://bash.com/sportscene/offers-sale',
}
const shop = BASH_STOREFRONTS[0]

function payload(page = 1, pages = 16) {
  return {
    props: {
      pageProps: {
        fallback: {
          '/search?page=1&persistentFilters=store:sportscene': {
            data: {
              items: [{
                assets: [{
                  sizes: {
                    full: 'https://thefoschini.vtexassets.com/arquivos/sneaker.jpg',
                  },
                }],
                id: 'c7135465-154c-4db4-8258-9d9825e1f12a',
                name: 'New Balance U471 Sneaker',
                path: '/new-balance-u471-sneaker/123/p',
                retailPrice: 29995,
                sellingPrice: 14900,
                vtexId: '123',
              }],
              page,
              pages,
              total: 471,
            },
          },
        },
      },
    },
  }
}

describe('decodeBashNextData', () => {
  it('reads the server-rendered catalogue data', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${
      JSON.stringify(payload())
    }</script>`
    expect(decodeBashNextData(html)).toEqual(payload())
  })

  it('rejects a page without Next data', () => {
    expect(() => decodeBashNextData('<html></html>')).toThrow('Invalid Bash sale response')
  })
})

describe('parseBashFeed', () => {
  it('maps Bash prices, links, images, and the next page', () => {
    const page = parseBashFeed(payload(), context, shop)

    expect(page.totalCount).toBe(471)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 1 })
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://thefoschini.vtexassets.com/arquivos/sneaker.jpg',
      previousPriceCents: 29_995,
      priceCents: 14_900,
      productId: '123',
      productUrl: 'https://bash.com/new-balance-u471-sneaker/123/p',
      retailerId: 'sportscene',
      savingText: '50% off',
      title: 'New Balance U471 Sneaker',
    })
  })

  it('stops after the final page', () => {
    expect(parseBashFeed(payload(16, 16), context, shop).nextCursor).toBeUndefined()
  })
})

describe('buildBashSaleUrl', () => {
  it('registers each TFG storefront with its live sale route', () => {
    expect(BASH_STOREFRONTS).toEqual([
      expect.objectContaining({
        path: '/sportscene/offers-sale',
        retailerId: 'sportscene',
        storeKey: 'sportscene',
      }),
      expect.objectContaining({
        path: '/totalsports/offers-sale/sale',
        retailerId: 'totalsports',
        storeKey: 'totalsports',
      }),
      expect.objectContaining({
        path: '/archive/offers-sale',
        retailerId: 'archive',
        storeKey: 'archive',
      }),
      expect.objectContaining({
        path: '/sneaker-factory/deals',
        retailerId: 'sneaker-factory',
        storeKey: 'sneaker-factory',
      }),
      expect.objectContaining({
        path: '/jet/sale',
        retailerId: 'jet',
        storeKey: 'jet',
      }),
    ])
  })

  it('requests the selected storefront page', () => {
    expect(buildBashSaleUrl(shop, 2)).toBe(
      'https://bash.com/sportscene/offers-sale?page=2',
    )
  })
})
