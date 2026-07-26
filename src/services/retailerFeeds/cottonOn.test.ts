import { describe, expect, it } from 'vitest'
import {
  buildCottonOnGridUrl,
  parseCottonOnGrid,
} from './cottonOn'

const context = {
  capturedAt: '2026-07-26T08:00:00.000Z',
  sourceUrl: 'https://cottonon.com/ZA/sale/',
}

function tile(id: string, current = '449.25', previous = '599.00'): string {
  return `<div class="product-tile" data-itemid="${id}">
    <a class="thumb-link"
      href="https://cottonon.com/ZA/plush-hoodie/${id}.html"
      title="Plush Oversized Hoodie">
      <img src="https://cottonon.com/dw/image/v2/BBDS_PRD/hoodie.jpg?sw=400&amp;sh=600">
    </a>
    <div class="product-pricing"
      aria-label="Standard Price ZAR ${previous}, Sale Price ZAR ${current}">
      <span class="product-standard-price" data-salesprice="${previous}">R${previous}</span>
      <span class="product-sales-price" data-standardprice="${current}">R${current}</span>
    </div>
  </div>`
}

describe('parseCottonOnGrid', () => {
  it('reads Cotton On sale prices from their reversed data attributes', () => {
    const page = parseCottonOnGrid(tile('6338358-09'), context)

    expect(page.totalCount).toBe(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://cottonon.com/dw/image/v2/BBDS_PRD/hoodie.jpg?sw=400&sh=600',
      previousPriceCents: 59_900,
      priceCents: 44_925,
      productId: '6338358-09',
      productUrl: 'https://cottonon.com/ZA/plush-hoodie/6338358-09.html',
      retailerId: 'cotton-on',
      savingText: '25% off',
      title: 'Plush Oversized Hoodie',
    })
  })

  it('counts full-price tiles so pagination can continue', () => {
    const page = parseCottonOnGrid(
      `${tile('one', '599.00', '599.00')}${tile('two', '699.00', '699.00')}`,
      context,
    )

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(2)
  })

  it('rejects unrelated HTML', () => {
    expect(() => parseCottonOnGrid('<html>blocked</html>', context))
      .toThrow('Invalid Cotton On grid payload')
  })
})

describe('buildCottonOnGridUrl', () => {
  it('uses Cotton On South Africa sale pagination', () => {
    expect(buildCottonOnGridUrl(48)).toBe(
      'https://cottonon.com/ZA/sale/?start=48&sz=48',
    )
  })
})
