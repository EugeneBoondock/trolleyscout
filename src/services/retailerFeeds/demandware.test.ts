import { describe, expect, it } from 'vitest'
import {
  DEMANDWARE_SHOPS,
  buildDemandwareGridUrl,
  parseDemandwareGrid,
} from './demandware'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://www.capeunionmart.co.za/c/deals-everyone/',
}
const shop = DEMANDWARE_SHOPS[0]

function tile(
  id: string,
  current = '399.00',
  previous = '1199.00',
): string {
  const facts = JSON.stringify({ id, name: 'K-Way Puffer Jacket', price: current })
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')

  return `<div class="product" data-pid="${id}" data-gtm-impression="${facts}">
    <a href="/products/k-way-puffer-jacket">K-Way Puffer Jacket</a>
    <span class="sales"><span class="value" content="${current}"></span></span>
    <span class="value strike-through">${previous}</span>
    <img data-src="https://media.capeunionmart.co.za/i/capeunionmart/jacket.jpg">
  </div>`
}

describe('parseDemandwareGrid', () => {
  it('reads a markdown when class attributes come before data-pid', () => {
    const page = parseDemandwareGrid(tile('cum-1'), context, shop, 'deals-everyone')

    expect(page.totalCount).toBe(1)
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://media.capeunionmart.co.za/i/capeunionmart/jacket.jpg',
      previousPriceCents: 119_900,
      priceCents: 39_900,
      productId: 'cum-1',
      productUrl: 'https://www.capeunionmart.co.za/products/k-way-puffer-jacket',
      retailerId: 'cape-union-mart',
      savingText: '67% off',
      title: 'K-Way Puffer Jacket',
    })
  })

  it('reports all product tiles even when none is a markdown', () => {
    const page = parseDemandwareGrid(
      `${tile('one', '399.00', 'null')}${tile('two', '499.00', 'null')}`,
      context,
      shop,
      'deals-everyone',
    )

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(2)
  })

  it('treats an empty final grid as the end of the catalogue', () => {
    expect(parseDemandwareGrid('', context, shop, 'deals-everyone')).toMatchObject({
      candidates: [],
      catalogues: [],
      totalCount: 0,
    })
  })

  it('rejects a challenge page instead of treating the shop as empty', () => {
    expect(() => parseDemandwareGrid(
      '<html><title>Attention required</title></html>',
      context,
      shop,
      'deals-everyone',
    )).toThrow('Invalid Demandware grid payload')
  })
})

describe('buildDemandwareGridUrl', () => {
  it('builds the public grid request with a bounded offset', () => {
    expect(buildDemandwareGridUrl(shop, 'deals-everyone', 96)).toBe(
      'https://www.capeunionmart.co.za/on/demandware.store/' +
      'Sites-CUM-Site/en_ZA/Search-UpdateGrid?cgid=deals-everyone&start=96&sz=48',
    )
  })
})
