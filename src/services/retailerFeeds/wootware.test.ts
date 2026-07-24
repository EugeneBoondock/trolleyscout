import { describe, expect, it } from 'vitest'
import { decodeWootwareDataLayer, parseWootwareFeed } from './wootware'

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
})
