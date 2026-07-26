import { describe, expect, it } from 'vitest'
import {
  buildWootwareSearchRequest,
  buildWootwareSpecialsUrl,
  decodeWootwareDataLayer,
  parseWootwareFeed,
  parseWootwareSearchFeed,
} from './wootware'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = {
  capturedAt,
  sourceUrl: 'https://www.wootware.co.za/computer-hardware/open-box-reburbished-specials',
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    discount: 300,
    index: 0,
    item_brand: 'ASUS',
    item_id: 'ASU-MB-P0126',
    item_name: 'TUF Gaming B650-PLUS WIFI Motherboard',
    price: '2699.00',
    ...overrides,
  }
}

const dataLayerHtml = (items: unknown[]) =>
  '<html><body><script>window.dataLayer = window.dataLayer || [];\n' +
  'dataLayer.push({"ecommerce":null});\n' +
  `dataLayer.push({"event":"view_item_list","ecommerce":{"items":${JSON.stringify(items)}}});` +
  '</script></body></html>'

describe('decodeWootwareDataLayer', () => {
  it('lifts the GA4 items array out of the inline script', () => {
    const decoded = decodeWootwareDataLayer(dataLayerHtml([item()])) as { items: unknown[] }

    expect(decoded.items).toHaveLength(1)
    expect(decoded.items[0]).toMatchObject({ item_id: 'ASU-MB-P0126', discount: 300 })
  })

  it('ignores unrelated items arrays on the page', () => {
    const decoded = decodeWootwareDataLayer(
      '<script>var menu = {"items":[{"label":"Deals"}]};</script>' + dataLayerHtml([item()]),
    ) as { items: unknown[] }

    expect(decoded.items).toHaveLength(1)
  })

  it('joins the server-rendered product link and image to its GA4 item', () => {
    const html = `
      <link rel="next" href="${context.sourceUrl}?p=2">
      <li class="item">
        <h2 class="product-name">
          <a href="https://www.wootware.co.za/tuf-gaming-b650-plus.html"
             title="TUF Gaming B650-PLUS WIFI Motherboard">
            TUF Gaming B650-PLUS WIFI Motherboard
          </a>
        </h2>
        <img
          data-src="https://www.wootware.co.za/media/catalog/product/tuf.jpg"
          alt="TUF Gaming B650-PLUS WIFI Motherboard">
      </li>
      ${dataLayerHtml([item({ item_name: 'TUF Gaming B650-PLUS WIFI Motherboard' })])}
    `
    const decoded = decodeWootwareDataLayer(html) as {
      items: Record<string, unknown>[]
      nextPage?: number
    }

    expect(decoded.nextPage).toBe(2)
    expect(decoded.items[0]).toMatchObject({
      item_image: 'https://www.wootware.co.za/media/catalog/product/tuf.jpg',
      item_url: 'https://www.wootware.co.za/tuf-gaming-b650-plus.html',
    })
  })

  it('rejects a page with no GA4 product items', () => {
    // A Cloudflare interstitial looks exactly like this to the decoder.
    expect(() => decodeWootwareDataLayer('<html><body>Just a moment...</body></html>'))
      .toThrow('Invalid Wootware dataLayer response')
    expect(() => decodeWootwareDataLayer(dataLayerHtml([])))
      .toThrow('Invalid Wootware dataLayer response')
  })
})

describe('parseWootwareFeed', () => {
  it('treats GA4 discount as rands off, so the previous price is price + discount', () => {
    const page = parseWootwareFeed({ items: [item()] }, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      // R2 699.00 paid, R300.00 off, so R2 999.00 before.
      previousPriceCents: 299_900,
      priceCents: 269_900,
      productId: 'ASU-MB-P0126',
      promotionId: 'open-box-specials',
      retailerId: 'wootware',
      savingText: 'Save R300.00',
      scope: { type: 'online' },
      title: 'ASUS TUF Gaming B650-PLUS WIFI Motherboard',
    })
    // The rand amount is never mistaken for the previous price itself.
    expect(page.candidates[0].previousPriceCents).not.toBe(30_000)
  })

  it('yields nothing when there are no rands off', () => {
    const page = parseWootwareFeed({
      items: [
        item({ discount: 0, item_id: 'zero' }),
        item({ discount: undefined, item_id: 'absent' }),
        item({ discount: -50, item_id: 'negative' }),
      ],
    }, context)

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(3)
  })

  it('sends a shopper to the listing when GA4 carries no product link', () => {
    const page = parseWootwareFeed({ items: [item()] }, context)

    expect(page.candidates[0].productUrl).toBe(context.sourceUrl)
  })

  it('prefers an official product link when the payload carries one', () => {
    const page = parseWootwareFeed({
      items: [item({ item_url: 'https://www.wootware.co.za/tuf-gaming-b650-plus.html' })],
    }, context)

    expect(page.candidates[0].productUrl)
      .toBe('https://www.wootware.co.za/tuf-gaming-b650-plus.html')
  })

  it('reads a numeric price as readily as the string form', () => {
    const page = parseWootwareFeed({
      items: [item({ discount: 149.5, price: 1299.99 })],
    }, context)

    expect(page.candidates[0].priceCents).toBe(129_999)
    expect(page.candidates[0].previousPriceCents).toBe(144_949)
  })

  it('deduplicates a repeated item id', () => {
    const page = parseWootwareFeed({ items: [item(), item()] }, context)
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload without an items array', () => {
    expect(() => parseWootwareFeed({ items: 'none' }, context))
      .toThrow('Invalid Wootware feed payload')
    expect(() => parseWootwareFeed(null, context)).toThrow(TypeError)
  })

  it('continues to the next server-rendered catalogue page', () => {
    expect(parseWootwareFeed({ items: [item()], nextPage: 2 }, context).nextCursor)
      .toEqual({ kind: 'page', page: 2 })
    expect(buildWootwareSpecialsUrl(2)).toBe(`${context.sourceUrl}?p=2`)
  })
})

describe('Wootware Algolia feed', () => {
  const searchHit = {
    CurrentPrice: 5_199,
    IsOnPromotion: true,
    Manufacturer: ['XPG'],
    Name: '[RECERTIFIED] XPG GAMMIX S70 BLADE 2TB NVMe SSD',
    OriginalPrice: 9_499,
    ProductId: 54_501,
    Sku: 'AGAMMIXS70B-2T-CS',
    'Stock Condition': 'Refurbished',
    ThumbnailUrl:
      'https://www.wootware.co.za/media/catalog/product/cache/1/small_image/xpg.jpg',
    Url:
      'https://www.wootware.co.za/recertified-xpg-gammix-s70-blade-2tb.html',
    objectID: '54501',
  }

  it('requests only open-box and refurbished stock from the official search index', () => {
    const request = buildWootwareSearchRequest(2)
    const body = JSON.parse(String(request.init.body))

    expect(request.url).toContain('algolia.net/1/indexes/production_products_index/query')
    expect(request.init.method).toBe('POST')
    expect(request.init.headers).toMatchObject({
      'x-algolia-application-id': 'ZWADJY9VJG',
    })
    expect(body).toMatchObject({
      facetFilters: [['Stock Condition:Open Box', 'Stock Condition:Refurbished']],
      hitsPerPage: 100,
      page: 2,
      query: '',
    })
  })

  it('maps current official search prices, product links, and images', () => {
    const page = parseWootwareSearchFeed({
      hits: [searchHit],
      nbHits: 78,
      nbPages: 1,
      page: 0,
    }, context)

    expect(page.totalCount).toBe(78)
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: searchHit.ThumbnailUrl,
      previousPriceCents: 949_900,
      priceCents: 519_900,
      productId: '54501',
      productUrl: searchHit.Url,
      retailerId: 'wootware',
      savingText: '45% off',
      scope: { type: 'online' },
      title: searchHit.Name,
    })
  })

  it('drops non-markdowns and untrusted product media', () => {
    const page = parseWootwareSearchFeed({
      hits: [
        { ...searchHit, CurrentPrice: 9_499, objectID: 'same-price' },
        {
          ...searchHit,
          ThumbnailUrl: 'https://tracker.example/product.jpg',
          Url: 'https://tracker.example/product',
          objectID: 'bad-urls',
        },
      ],
      nbHits: 2,
      nbPages: 1,
      page: 0,
    }, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: undefined,
      productUrl: context.sourceUrl,
    })
  })

  it('uses the search page count for bounded pagination', () => {
    const page = parseWootwareSearchFeed({
      hits: [searchHit],
      nbHits: 178,
      nbPages: 2,
      page: 0,
    }, context)

    expect(page.nextCursor).toEqual({ kind: 'page', page: 1 })
  })
})
