import { describe, expect, it } from 'vitest'
import { extractCatalogueDeals } from './catalogueDeals'

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
})
