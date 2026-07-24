import { describe, expect, it } from 'vitest'
import { decodeLootNextData, parseLootFeed } from './loot'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.loot.co.za/sale' }

function product(overrides: Record<string, unknown> = {}) {
  return {
    code: 'zfjr-8498-g580',
    fullTitle: 'A Student\'s Approach To Taxation In South Africa (Paperback)',
    // Loot's `link` addresses its web service, not the shop.
    link: { uri: '/ws/services/v1/public/product/zfjr-8498-g580' },
    listPrice: 1133,
    name: 'A Student\'s Approach To Taxation In South Africa',
    price: 899,
    shareLink: {
      relationship: 'WebRelative',
      uri: '/product/a-oosthuizen-a-student-s-approach/zfjr-8498-g580',
    },
    slug: 'a-oosthuizen-a-student-s-approach',
    // Thumbnails are protocol-relative on the wire.
    thumbnail: { url: '//media.loot.co.za/images/x200/641159172960179215.jpg' },
    ...overrides,
  }
}

const nextData = (blocks: unknown[]) => ({
  props: { pageProps: { initialProps: { category: { featuredContent: blocks } } } },
})

const feed = (products: unknown[]) => nextData([
  { template: 'banner' },
  { products, template: 'rail' },
])

describe('decodeLootNextData', () => {
  it('reads the embedded Next.js payload', () => {
    const html = '<html><body><script id="__NEXT_DATA__" type="application/json">' +
      `${JSON.stringify(feed([product()]))}</script></body></html>`

    expect(decodeLootNextData(html)).toEqual(feed([product()]))
  })

  it('rejects a page with no payload or an unreadable one', () => {
    expect(() => decodeLootNextData('<html></html>')).toThrow('Invalid Loot sale response')
    expect(() => decodeLootNextData(
      '<script id="__NEXT_DATA__" type="application/json">{broken</script>',
    )).toThrow('Invalid Loot sale response')
  })
})

describe('parseLootFeed', () => {
  it('collects products across every featured rail and strikes through listPrice', () => {
    const page = parseLootFeed(
      nextData([
        { products: [product()], template: 'rail' },
        { template: 'banner' },
        { products: [product({ code: 'second', listPrice: 99, price: 79 })], template: 'rail' },
      ]),
      context,
    )

    expect(page.candidates).toHaveLength(2)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://media.loot.co.za/images/x200/641159172960179215.jpg',
      previousPriceCents: 113_300,
      priceCents: 89_900,
      productId: 'zfjr-8498-g580',
      productUrl:
        'https://www.loot.co.za/product/a-oosthuizen-a-student-s-approach/zfjr-8498-g580',
      promotionId: 'loot-sale',
      retailerId: 'loot',
      savingText: '21% off',
      scope: { type: 'online' },
      title: 'A Student\'s Approach To Taxation In South Africa (Paperback)',
    })
    expect(page.candidates[1].priceCents).toBe(7900)
  })

  it('yields nothing when listPrice is not above the selling price', () => {
    const page = parseLootFeed(
      feed([
        product({ code: 'level', listPrice: 899 }),
        product({ code: 'below', listPrice: 799 }),
        product({ code: 'absent', listPrice: null }),
      ]),
      context,
    )

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(3)
  })

  it('never publishes the web-service path as a product link', () => {
    const page = parseLootFeed(
      feed([product({ shareLink: undefined, slug: '' })]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('builds a product link from the slug and code when shareLink is absent', () => {
    const page = parseLootFeed(feed([product({ shareLink: undefined })]), context)

    expect(page.candidates[0].productUrl)
      .toBe('https://www.loot.co.za/product/a-oosthuizen-a-student-s-approach/zfjr-8498-g580')
  })

  it('reads a deal countdown as an exact instant and drops it once passed', () => {
    const live = parseLootFeed(
      feed([product({ dealEndDate: Date.parse('2026-07-26T21:59:59.000Z') })]),
      context,
    )
    const expired = parseLootFeed(
      feed([product({ dealEndDate: Date.parse('2026-07-24T21:59:59.000Z') })]),
      context,
    )

    expect(live.candidates[0].validTo).toBe('2026-07-26T21:59:59.000Z')
    expect(expired.candidates).toEqual([])
  })

  it('deduplicates the same product code across rails', () => {
    const page = parseLootFeed(
      nextData([{ products: [product()] }, { products: [product()] }]),
      context,
    )

    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload without the sale category', () => {
    expect(() => parseLootFeed({ props: {} }, context))
      .toThrow('Invalid Loot feed payload')
    expect(() => parseLootFeed(null, context)).toThrow(TypeError)
  })
})
