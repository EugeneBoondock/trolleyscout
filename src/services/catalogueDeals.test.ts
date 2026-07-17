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
          { box: box(), title: 'SAVE', price: 'R50' },
          { box: box(), title: 'Ritebrand Mixed Chicken Portions 5kg', price: '199.99' },
          {
            box: box(0.52, 0.2),
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

  it('rejects scene descriptions and banner fragments, keeps real names', () => {
    const deals = extractVisionCatalogueDeals({
      capturedAt: '2026-07-15T00:00:00.000Z',
      imageUrl: 'https://example.com/page.webp',
      markdown: JSON.stringify({
        deals: [
          { box: box(), title: 'red boxed product is displayed at the top right', price: 'R69.99' },
          { box: box(), title: 'green bag of mixed vegetables is shown on the left', price: 'R34.99' },
          { box: box(), title: 'Any 3 for', price: 'R290' },
          { box: box(), title: 'Various food or household items are shown', price: 'R110' },
          { box: box(), title: 'Huggies Baby Soft Diapers Size 4 44s', price: 'R179.99' },
        ],
      }),
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://example.com/catalogue',
    })

    expect(deals).toHaveLength(1)
    expect(deals[0].title).toBe('Huggies Baby Soft Diapers Size 4 44s')
  })

  it('accepts JSON wrapped in a code fence', () => {
    const deals = extractVisionCatalogueDeals({
      capturedAt: '2026-07-15T00:00:00.000Z',
      markdown: '```json\n{"deals":[{"title":"Albany Bread 700g","price":"R15.99","box":{"x":0.1,"y":0.1,"width":0.2,"height":0.2}}]}\n```',
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceUrl: 'https://example.com/catalogue',
    })

    expect(deals).toHaveLength(1)
    expect(deals[0].title).toBe('Albany Bread 700g')
  })

  it('keeps a meaningful normalized crop, clamps harmless error, and rejects unsafe boxes', () => {
    const deals = extractVisionCatalogueDeals({
      capturedAt: '2026-07-15T00:00:00.000Z',
      documentFingerprint: 'f'.repeat(64),
      imageUrl: 'https://example.com/page0002_3.webp',
      markdown: JSON.stringify({
        deals: [
          {
            box: { height: 0.25, width: 0.2, x: -0.0000001, y: 0.75 },
            price: 'R15.99',
            title: 'Albany Bread 700g',
          },
          {
            box: { height: 0.01, width: 0.01, x: 0.2, y: 0.2 },
            price: 'R20.00',
            title: 'Tiny Product',
          },
          {
            box: { height: 0.2, width: 0.2, x: 0.9, y: 0.2 },
            price: 'R30.00',
            title: 'Outside Product',
          },
          {
            box: { height: 0.2, width: Number.NaN, x: 0.1, y: 0.1 },
            price: 'R40.00',
            title: 'Malformed Product',
          },
        ],
      }),
      pageDeepLink: 'https://example.com/catalogue/index.html#page=2',
      pageNumber: 2,
      retailerId: 'checkers',
      retailerName: 'Checkers',
      sourceUrl: 'https://example.com/catalogue/index.html',
    })

    expect(deals).toHaveLength(1)
    expect(deals[0]).toMatchObject({
      catalogueDeepLink: 'https://example.com/catalogue/index.html#page=2',
      catalogueFingerprint: 'f'.repeat(64),
      imageCrop: { height: 0.25, width: 0.2, x: 0, y: 0.75 },
      pageNumber: 2,
    })
  })
})

function box(x = 0.1, y = 0.1) {
  return { height: 0.2, width: 0.2, x, y }
}
