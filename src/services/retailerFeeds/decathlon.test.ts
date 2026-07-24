import { describe, expect, it } from 'vitest'
import { buildDecathlonPricesDropUrl, parseDecathlonFeed } from './decathlon'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.decathlon.co.za/prices-drop' }

function hit(overrides: Record<string, unknown> = {}) {
  return {
    brand: 'KIPRUN',
    id_code_model: '8929140',
    image_url: 'https://contents.mediadecathlon.com/p2906701/k$abc/prod.jpg?f=520x520',
    objectID: '5476802',
    percentoff: 42,
    prix: 229,
    product_name: 'Run 100 Men\'s Half-Zip Long-Sleeved T-shirt - Grey',
    regular: 399,
    sku: '153a08dd-ec9e-4aa6-a075-920de5b9ebf3',
    thumb_url: 'https://contents.mediadecathlon.com/p2906701/k$abc/prod.jpg?f=40x40',
    url: 'https://www.decathlon.co.za/p/357727-123362-kiprun-run-100.html',
    ...overrides,
  }
}

const feed = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  current_page: 3,
  pagination: {
    rel_next: 'https://www.decathlon.co.za/prices-drop?page=4',
    rel_prev: 'https://www.decathlon.co.za/prices-drop?page=2',
    total_items: 4624,
  },
  resultHits: rows,
  ...extra,
})

describe('parseDecathlonFeed', () => {
  it('turns a real price drop into cents with the regular price struck through', () => {
    const page = parseDecathlonFeed(feed([hit()]), context, { page: 3 })

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://contents.mediadecathlon.com/p2906701/k$abc/prod.jpg?f=520x520',
      previousPriceCents: 39_900,
      priceCents: 22_900,
      productId: '5476802',
      productUrl: 'https://www.decathlon.co.za/p/357727-123362-kiprun-run-100.html',
      promotionId: 'prices-drop',
      retailerId: 'decathlon',
      savingText: '42% off',
      scope: { type: 'online' },
      title: 'KIPRUN Run 100 Men\'s Half-Zip Long-Sleeved T-shirt - Grey',
    })
    expect(page.totalCount).toBe(4624)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 4 })
  })

  it('drops full-price stock the listing happens to carry', () => {
    // The prices-drop listing mixes in items whose regular equals prix; those
    // are not deals and must never gain an invented was-price.
    const page = parseDecathlonFeed(
      feed([
        hit({ objectID: 'full-price', percentoff: 0, prix: 499, regular: 499 }),
        hit({ objectID: 'inverted', percentoff: 0, prix: 499, regular: 399 }),
      ]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('drops hits that are missing a price, title or official link', () => {
    const page = parseDecathlonFeed(
      feed([
        hit({ objectID: 'no-price', prix: 0 }),
        hit({ objectID: 'no-title', brand: '', product_name: '' }),
        hit({ objectID: 'offsite', url: 'https://example.com/p/thing.html' }),
      ]),
      context,
    )

    expect(page.candidates).toEqual([])
  })

  it('honours a discount window that has closed or not opened', () => {
    const live = parseDecathlonFeed(
      feed([hit({ discount_end_date: '2026-07-30', discount_start_date: '2026-07-20' })]),
      context,
    )
    const closed = parseDecathlonFeed(
      feed([hit({ discount_end_date: '2026-07-20' })]),
      context,
    )
    const unopened = parseDecathlonFeed(
      feed([hit({ discount_start_date: '2026-08-01' })]),
      context,
    )

    expect(live.candidates[0].validTo).toBe('2026-07-30')
    expect(closed.candidates).toEqual([])
    expect(unopened.candidates).toEqual([])
  })

  it('falls back to the thumbnail and computes a percentage without one quoted', () => {
    const page = parseDecathlonFeed(
      feed([hit({ image_url: '', percentoff: 0, prix: 200, regular: 400 })]),
      context,
    )

    expect(page.candidates[0].imageUrl)
      .toBe('https://contents.mediadecathlon.com/p2906701/k$abc/prod.jpg?f=40x40')
    expect(page.candidates[0].savingText).toBe('50% off')
  })

  it('deduplicates a product repeated across the page', () => {
    const page = parseDecathlonFeed(feed([hit(), hit(), hit()]), context)
    expect(page.candidates).toHaveLength(1)
  })

  it('stops paging on the last page', () => {
    const page = parseDecathlonFeed(
      feed([hit()], { pagination: { rel_next: null, total_items: 4624 } }),
      context,
    )

    expect(page.nextCursor).toBeUndefined()
  })

  it('rejects a payload that is not the price-drop listing', () => {
    expect(() => parseDecathlonFeed({ nope: true }, context)).toThrow(TypeError)
    expect(() => parseDecathlonFeed(null, context)).toThrow('Invalid Decathlon feed payload')
  })
})

describe('buildDecathlonPricesDropUrl', () => {
  it('asks the listing for JSON at a given page', () => {
    const url = new URL(buildDecathlonPricesDropUrl(7))

    expect(url.host).toBe('www.decathlon.co.za')
    expect(url.pathname).toBe('/prices-drop')
    expect(url.searchParams.get('ajax')).toBe('1')
    expect(url.searchParams.get('page')).toBe('7')
  })

  it('never asks for a page below the first', () => {
    expect(new URL(buildDecathlonPricesDropUrl(0)).searchParams.get('page')).toBe('1')
  })
})
