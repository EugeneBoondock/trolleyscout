import { describe, expect, it } from 'vitest'
import {
  buildTakealotPromotionProductsUrl,
  decodeTakealotCursor,
  encodeTakealotCursor,
  isTakealotPromotionsPayload,
  parseTakealotFeed,
  parseTakealotPromotions,
} from './takealot'

const capturedAt = '2026-07-24T12:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.takealot.com/deals' }

function product(buybox: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    type: 'product_views',
    product_views: {
      badges: { entries: [{ id: 'badge-0', type: 'saving', value: '23% off' }] },
      buybox_summary: buybox,
      core: { id: 91637008, slug: 'hisense-tumble-dryer', title: 'Hisense 8Kg Tumble Dryer' },
      gallery: { images: ['https://media.takealot.com/covers_images/abc/s-{size}.file'] },
      ...extra,
    },
  }
}

const feed = (rows: unknown[]) => ({ sections: { products: { results: rows } } })

describe('parseTakealotFeed', () => {
  it('uses listing_price as the previous price when it is genuinely higher', () => {
    const page = parseTakealotFeed(
      feed([product({ listing_price: 6499, prices: [4999], saving: '23%' })]),
      context,
      { promotionId: 129321 },
    )

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      previousPriceCents: 649_900,
      priceCents: 499_900,
      productId: '91637008',
      productUrl: 'https://www.takealot.com/hisense-tumble-dryer/PLID91637008',
      promotionId: '129321',
      retailerId: 'takealot',
      savingText: '23% off',
      title: 'Hisense 8Kg Tumble Dryer',
    })
  })

  it('never treats the top of a variant price range as a previous price', () => {
    // "From R 109" across variants priced 109-199 is a range, not a discount.
    const page = parseTakealotFeed(
      feed([product({ listing_price: null, prices: [109, 199], saving: 'Up to 26%' })]),
      context,
    )

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
    expect(page.candidates[0].priceCents).toBe(10_900)
    expect(page.candidates[0].savingText).toBe('Up to 26% off')
  })

  it('ignores a listing_price that is not above the selling price', () => {
    const page = parseTakealotFeed(
      feed([product({ listing_price: 4999, prices: [4999] })]),
      context,
    )
    expect(page.candidates[0].previousPriceCents).toBeUndefined()
  })

  it('takes the lowest live price from a range', () => {
    const page = parseTakealotFeed(feed([product({ prices: [299, 149, 199] })]), context)
    expect(page.candidates[0].priceCents).toBe(14_900)
  })

  it('resolves the gallery image to a real size', () => {
    const page = parseTakealotFeed(feed([product({ prices: [100] })]), context)
    expect(page.candidates[0].imageUrl)
      .toBe('https://media.takealot.com/covers_images/abc/s-pdpxl.file')
  })

  it('falls back to a badge when no saving percentage is quoted', () => {
    const page = parseTakealotFeed(feed([product({ prices: [100] })]), context)
    expect(page.candidates[0].savingText).toBe('23% off')
  })

  it('skips products without a usable price, title or slug', () => {
    const page = parseTakealotFeed(
      feed([
        product({ prices: [] }),
        { type: 'product_views', product_views: { core: { id: 1, title: '', slug: 'x' }, buybox_summary: { prices: [10] } } },
        { type: 'product_views', product_views: { core: { id: 2, title: 'No slug', slug: '' }, buybox_summary: { prices: [10] } } },
      ]),
      context,
    )
    expect(page.candidates).toEqual([])
  })

  it('deduplicates a product repeated inside one campaign', () => {
    const row = product({ listing_price: 200, prices: [100] })
    const page = parseTakealotFeed(feed([row, row, row]), context)
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload that is not a product search', () => {
    expect(() => parseTakealotFeed({ nope: true }, context)).toThrow(TypeError)
  })
})

describe('parseTakealotPromotions', () => {
  const promotions = (rows: unknown[]) => ({ status_code: 200, response: rows })

  it('keeps campaigns that are live at capture time', () => {
    const ids = parseTakealotPromotions(
      promotions([
        { promotion_id: 129321, display_name: 'Tech', is_active: true, date_start: '2026-07-24 10:00:00', date_end: '2026-07-29 05:40:00' },
      ]),
      capturedAt,
    )
    expect(ids).toEqual([129321])
  })

  it('drops closed, unstarted and inactive campaigns', () => {
    const ids = parseTakealotPromotions(
      promotions([
        { promotion_id: 1, is_active: true, date_start: '2026-07-01 00:00:00', date_end: '2026-07-10 00:00:00' },
        { promotion_id: 2, is_active: true, date_start: '2026-08-01 00:00:00', date_end: '2026-08-30 00:00:00' },
        { promotion_id: 3, is_active: false, date_start: '2026-07-24 00:00:00', date_end: '2026-07-30 00:00:00' },
      ]),
      capturedAt,
    )
    expect(ids).toEqual([])
  })

  it('deduplicates campaign ids and ignores malformed rows', () => {
    const live = { is_active: true, date_start: '2026-07-24 00:00:00', date_end: '2026-07-30 00:00:00' }
    const ids = parseTakealotPromotions(
      promotions([{ promotion_id: 7, ...live }, { promotion_id: 7, ...live }, null, { promotion_id: 0, ...live }]),
      capturedAt,
    )
    expect(ids).toEqual([7])
  })

  it('recognises the campaign-list payload', () => {
    expect(isTakealotPromotionsPayload({ response: [{ promotion_id: 1 }] })).toBe(true)
    expect(isTakealotPromotionsPayload({ sections: { products: { results: [] } } })).toBe(false)
  })
})

describe('takealot cursor', () => {
  it('round-trips a sweep plan', () => {
    const token = encodeTakealotCursor({ ids: [1, 2, 3], index: 2 })
    expect(decodeTakealotCursor(token)).toEqual({ ids: [1, 2, 3], index: 2 })
  })

  it('rejects the seed token and malformed plans', () => {
    expect(decodeTakealotCursor('campaign-list')).toBeUndefined()
    expect(decodeTakealotCursor('{"i":0,"ids":[]}')).toBeUndefined()
    expect(decodeTakealotCursor('not json')).toBeUndefined()
  })

  it('builds a campaign-filtered product request', () => {
    const url = new URL(buildTakealotPromotionProductsUrl(129321))
    expect(url.host).toBe('api.takealot.com')
    expect(url.searchParams.get('filter')).toBe('Promotions:129321')
  })
})
