import { describe, expect, it } from 'vitest'
import { decodeBobshopProductCards, parseBobshopFeed } from './bobshop'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = { capturedAt, sourceUrl: 'https://www.bobshop.co.za/' }

function card(overrides: Record<string, unknown> = {}) {
  return {
    amount: 261,
    closeTime: '2026-07-26T23:45:00+02:00',
    condition: 'NEW',
    // Bob Shop leaves this at 0 even on listings that carry a real RRP.
    discountPercentage: 0,
    images: [{
      image: 'https://img.bobshop.co.za/f_auto/user/2721349/charger.png',
      thumbnail: 'https://img.bobshop.co.za/dpr_1.0,f_auto/user/2721349/charger.png',
    }],
    openTime: '2026-07-24T15:00:00+02:00',
    recommendedRetailPrice: 1250,
    seller: { userAlias: 'Wisedeals', userId: 2_721_349, verified: true },
    title: '12V 6A Intelligent Pulse Repair Battery Charger',
    tradeId: 688_627_239,
    type: 'ENGLISH_AUCTION',
    url: 'https://www.bobshop.co.za/12v-6a-intelligent-pulse-repair-battery-charger/p/688627239',
    ...overrides,
  }
}

const cardsHtml = (cards: unknown[]) =>
  '<html><body>' +
  cards
    .map((value) => `<script type="application/json">${JSON.stringify(value)}</script>`)
    .join('') +
  '</body></html>'

describe('decodeBobshopProductCards', () => {
  it('reads one JSON block per product card', () => {
    const decoded = decodeBobshopProductCards(
      cardsHtml([card(), card({ tradeId: 2 })]),
    ) as { cards: unknown[] }

    expect(decoded.cards).toHaveLength(2)
  })

  it('ignores embedded JSON that is not a product card', () => {
    const decoded = decodeBobshopProductCards(
      '<script type="application/json">{"@context":"https://schema.org"}</script>' +
        cardsHtml([card()]),
    ) as { cards: unknown[] }

    expect(decoded.cards).toHaveLength(1)
  })

  it('rejects a page with no product cards', () => {
    expect(() => decodeBobshopProductCards('<html><body>Nothing</body></html>'))
      .toThrow('Invalid Bob Shop card response')
  })
})

describe('parseBobshopFeed', () => {
  it('strikes through the recommended retail price when it is above the asking price', () => {
    const page = parseBobshopFeed({ cards: [card()] }, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://img.bobshop.co.za/f_auto/user/2721349/charger.png',
      previousPriceCents: 125_000,
      priceCents: 26_100,
      productId: '688627239',
      productUrl:
        'https://www.bobshop.co.za/12v-6a-intelligent-pulse-repair-battery-charger/p/688627239',
      promotionId: 'bobshop-featured',
      retailerId: 'bobshop',
      savingText: '79% off',
      scope: { type: 'online' },
      termsText: 'Auction listing from Wisedeals',
      title: '12V 6A Intelligent Pulse Repair Battery Charger',
      validFrom: '2026-07-24T15:00:00+02:00',
      validTo: '2026-07-26T23:45:00+02:00',
    })
  })

  it('yields nothing without a recommended retail price above the asking price', () => {
    const page = parseBobshopFeed({
      cards: [
        card({ recommendedRetailPrice: undefined, tradeId: 1 }),
        card({ recommendedRetailPrice: 261, tradeId: 2 }),
        card({ recommendedRetailPrice: 100, tradeId: 3 }),
      ],
    }, context)

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(3)
  })

  it('prefers the percentage Bob Shop quotes when it is real', () => {
    const page = parseBobshopFeed({ cards: [card({ discountPercentage: 75 })] }, context)
    expect(page.candidates[0].savingText).toBe('75% off')
  })

  it('drops listings that have closed or have not opened', () => {
    const closed = parseBobshopFeed({
      cards: [card({ closeTime: '2026-07-24T23:45:00+02:00' })],
    }, context)
    const unopened = parseBobshopFeed({
      cards: [card({ openTime: '2026-07-26T15:00:00+02:00' })],
    }, context)

    expect(closed.candidates).toEqual([])
    expect(unopened.candidates).toEqual([])
  })

  it('falls back to the listing id in the product path', () => {
    const page = parseBobshopFeed({ cards: [card({ tradeId: undefined })] }, context)
    expect(page.candidates[0].productId).toBe('688627239')
  })

  it('drops cards whose link leaves Bob Shop', () => {
    const page = parseBobshopFeed({
      cards: [card({ url: 'https://example.com/p/688627239' })],
    }, context)

    expect(page.candidates).toEqual([])
  })

  it('labels a fixed-price listing as Buy Now', () => {
    const page = parseBobshopFeed({ cards: [card({ type: 'BUY_NOW' })] }, context)
    expect(page.candidates[0].termsText).toBe('Buy Now listing from Wisedeals')
  })

  it('rejects a payload without a cards array', () => {
    expect(() => parseBobshopFeed({ cards: {} }, context))
      .toThrow('Invalid Bob Shop feed payload')
    expect(() => parseBobshopFeed(null, context)).toThrow(TypeError)
  })
})
