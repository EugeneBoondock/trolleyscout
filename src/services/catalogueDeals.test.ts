import { describe, expect, it } from 'vitest'
import {
  extractCatalogueDeals,
  extractVisionCatalogueDeals,
} from './catalogueDeals'

describe('extractCatalogueDeals', () => {
  it('turns catalogue text into source-backed deal rows', () => {
    const deals = extractCatalogueDeals({
      capturedAt: '2026-07-15T12:00:00.000Z',
      imageUrl: 'https://retailer.test/catalogue-cover.jpg',
      markdown: `
# Weekly savings

Tastic Long Grain Rice 2kg R29.99 was R39.99

Koo Baked Beans 400g
R16,99

Call 0800 123 456 for help
      `,
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://retailer.test/catalogue.pdf',
    })

    expect(deals).toHaveLength(2)
    expect(deals[0]).toMatchObject({
      imageUrl: 'https://retailer.test/catalogue-cover.jpg',
      previousPriceText: 'R39.99',
      priceText: 'R29.99',
      retailerName: 'Shoprite',
      sourceLabel: 'Catalogue scan',
      title: 'Tastic Long Grain Rice 2kg',
    })
    expect(deals[1]).toMatchObject({
      priceText: 'R16.99',
      title: 'Koo Baked Beans 400g',
    })
  })

  it('deduplicates repeated rows and ignores lines without product text', () => {
    const deals = extractCatalogueDeals({
      capturedAt: '2026-07-15T12:00:00.000Z',
      markdown: 'R20.00\nMilk 2L R24.99\nMilk 2L R24.99',
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://retailer.test/catalogue.pdf',
    })

    expect(deals).toHaveLength(1)
    expect(deals[0].title).toBe('Milk 2L')
  })

  it('reads vision descriptions whose price omits the rand symbol', () => {
    const deals = extractCatalogueDeals({
      capturedAt: '2026-07-15T12:00:00.000Z',
      markdown: `
* **Chicken:** A central promotion for a 5kg pack of Chicken Mixed Portions, priced at **199.99**.
* **Vegetables:** A bag of **Mixed Vegetables** priced at **34.99**.
      `,
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://retailer.test/catalogue.pdf',
    })

    expect(deals).toHaveLength(2)
    expect(deals[0]).toMatchObject({
      priceText: 'R199.99',
      title: '5kg pack of Chicken Mixed Portions',
    })
    expect(deals[1]).toMatchObject({
      priceText: 'R34.99',
      title: 'Mixed Vegetables',
    })
  })
})

describe('extractVisionCatalogueDeals', () => {
  it('keeps named products and rejects saving banners', () => {
    const deals = extractVisionCatalogueDeals({
      capturedAt: '2026-07-15T00:00:00.000Z',
      imageUrl: 'https://example.com/page.webp',
      markdown: JSON.stringify({
        deals: [
          { title: 'SAVE', price: 'R50' },
          { title: 'Ritebrand Mixed Chicken Portions 5kg', price: '199.99' },
          {
            previousPrice: 'R89.99',
            price: 'R69.99',
            title: 'Sunfoil Pure Sunflower Oil 2L',
          },
        ],
      }),
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://example.com/catalogue',
    })

    expect(deals).toHaveLength(2)
    expect(deals[0]).toMatchObject({
      imageUrl: 'https://example.com/page.webp',
      priceText: 'R199.99',
      title: 'Ritebrand Mixed Chicken Portions 5kg',
    })
    expect(deals[1]).toMatchObject({
      previousPriceText: 'R89.99',
      priceText: 'R69.99',
      title: 'Sunfoil Pure Sunflower Oil 2L',
    })
  })

  it('accepts JSON wrapped in a code fence', () => {
    const deals = extractVisionCatalogueDeals({
      capturedAt: '2026-07-15T00:00:00.000Z',
      markdown: '```json\n{"deals":[{"title":"Albany Bread 700g","price":"R15.99"}]}\n```',
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceUrl: 'https://example.com/catalogue',
    })

    expect(deals).toHaveLength(1)
    expect(deals[0].title).toBe('Albany Bread 700g')
  })
})
