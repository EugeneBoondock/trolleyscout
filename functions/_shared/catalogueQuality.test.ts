import { describe, expect, it } from 'vitest'
import {
  extractCatalogueDeals,
  extractVisionCatalogueDeals,
} from '../../src/services/catalogueDeals'
import {
  catalogueDealRejection,
  isAmbiguousRandAmount,
  keepTrustworthyCatalogueDeals,
  segmentCatalogueMarkdown,
} from './catalogueQuality'

const capturedAt = '2026-07-24T09:00:00.000Z'

function readPdfCatalogue(markdown: string) {
  return keepTrustworthyCatalogueDeals(
    extractCatalogueDeals({
      capturedAt,
      markdown: segmentCatalogueMarkdown(markdown),
      retailerId: 'walmart',
      retailerName: 'Walmart',
      sourceUrl: 'https://www.massmart.test/walmart-catalogue.pdf',
    }, 200),
    'pdf-text',
  )
}

function readVisionCatalogue(deals: unknown[]) {
  return keepTrustworthyCatalogueDeals(
    extractVisionCatalogueDeals({
      capturedAt,
      markdown: JSON.stringify({ deals }),
      retailerId: 'shoprite',
      retailerName: 'Shoprite',
      sourceUrl: 'https://specials.shoprite.test/current/index.html',
    }),
    'vision',
  )
}

function visionDeal(overrides: Record<string, unknown>) {
  return {
    box: { height: 0.2, width: 0.2, x: 0.1, y: 0.1 },
    price: 'R29.99',
    title: 'Tastic Long Grain Parboiled Rice 2kg',
    ...overrides,
  }
}

describe('catalogueDealRejection', () => {
  // Every one of these was stored as a priced product by the live Walmart scan.
  it.each([
    ['page furniture', 'Page 5', 'page-furniture'],
    ['page furniture without a space', 'Page4', 'page-furniture'],
    [
      'a printing disclaimer',
      'location. Photographic images used in advertising may not accurately represent the actual colour of the product due to printing limitations',
      'too-long',
    ],
    [
      'credit small print',
      'includes card fees, customer protection insurance and interest at',
      'boilerplate',
    ],
    [
      'welded products and their prices',
      '75”QLED/4KUSBX 2HDMIX 3eachR10999R9999190 cm (75”) QLED Google TV• Model: 75Q6600 (850033761)152 cm (60”) QLED Smart TV• Model: 60Q6600H (850033690)',
      'too-long',
    ],
    ['a price line read as a name', 'R14995each', 'embedded-price'],
    ['a pack size', '85 g', 'unreadable'],
    ['a quantity', '80’s', 'unreadable'],
    ['a brand banner', 'GREAT VALUE', 'brand-banner'],
    ['a price qualifier', 'per 2-pack', 'qualifier-only'],
    [
      'two design runs glued together',
      'Whole RotisserieChicken,2 x Chips and 1.5 L CokeAuto WashingPowder(All variants)2 kg',
      'welded-run',
    ],
    ['a catalogue code glued to a size', 'Charcoal Braai(831582)4 kg', 'welded-run'],
    ['a neighbouring brand glued to a product', 'ECONO2-PlyToilet Tissue18’s', 'welded-run'],
    ['a pack size glued to a product', 'Cheese900 g', 'welded-run'],
  ])('rejects %s', (_label, title, reason) => {
    expect(catalogueDealRejection({ priceText: 'R99', title }, 'pdf-text')).toBe(reason)
  })

  it('keeps a readable product name with a price it can trust', () => {
    expect(catalogueDealRejection(
      { previousPriceText: 'R39.99', priceText: 'R29.99', title: 'Tastic Long Grain Rice 2kg' },
      'pdf-text',
    )).toBeUndefined()
    expect(catalogueDealRejection(
      { priceText: 'R99', title: 'Sunlight Auto Washing Powder 2kg' },
      'pdf-text',
    )).toBeUndefined()
    expect(catalogueDealRejection(
      { priceText: 'R89.99', title: 'Coca-Cola Original Taste 6x330ml' },
      'pdf-text',
    )).toBeUndefined()
  })

  it('leaves brand-cased and whole-rand vision titles alone', () => {
    // Vision reads the rendered page, so a capitalised brand name and a
    // cents-free price are both exactly what was printed.
    expect(catalogueDealRejection({ priceText: 'R129', title: 'KOO BAKED BEANS 410G' }, 'vision'))
      .toBeUndefined()
    expect(catalogueDealRejection({ priceText: 'R89.99', title: 'McCain Frozen Mixed Veg 1kg' }, 'vision'))
      .toBeUndefined()
    expect(catalogueDealRejection({ priceText: 'R49.99', title: 'iPhone Charger Cable 1m' }, 'pdf-text'))
      .toBeUndefined()
  })
})

describe('isAmbiguousRandAmount', () => {
  // The catalogue prints cents as a smaller superscript run, so the flattened
  // text says "R9999" for both R99.99 and R9 999.00 — both really occur in the
  // 21 July 2026 Walmart catalogue.
  it.each(['R9999', 'R2995', 'R11999', 'R899'])('cannot trust the flattened %s', (amount) => {
    expect(isAmbiguousRandAmount(amount)).toBe(true)
  })

  it.each(['R29.95', 'R9,99', 'R99', 'R17'])('trusts %s', (amount) => {
    expect(isAmbiguousRandAmount(amount)).toBe(false)
  })
})

describe('segmentCatalogueMarkdown', () => {
  it('splits a price welded onto the product before it', () => {
    expect(segmentCatalogueMarkdown('Tastic Long Grain Rice 2kgR29.99each')).toBe(
      'Tastic Long Grain Rice 2kg\nR29.99 each',
    )
  })

  it('keeps a was and now pair on one line', () => {
    expect(segmentCatalogueMarkdown('Tastic Long Grain Rice 2kg R29.99 was R39.99')).toBe(
      'Tastic Long Grain Rice 2kg R29.99 was R39.99',
    )
  })

  it('starts a new product after a price and its unit', () => {
    expect(segmentCatalogueMarkdown('Rice 2kg R29.99 each Sunfoil Sunflower Oil 2L R49.99 each')).toBe(
      'Rice 2kg R29.99 each\nSunfoil Sunflower Oil 2L R49.99 each',
    )
  })
})

describe('reading a PDF catalogue', () => {
  it('splits two products welded into one line into two deals with their own prices', () => {
    expect(readPdfCatalogue('Tastic Long Grain Rice 2kgR29.99eachSunfoil Sunflower Oil 2LR49.99each'))
      .toMatchObject([
        { priceText: 'R29.99', title: 'Tastic Long Grain Rice 2kg' },
        { priceText: 'R49.99', title: 'Sunfoil Sunflower Oil 2L' },
      ])
  })

  it('keeps a clean product line with its was price', () => {
    expect(readPdfCatalogue('Tastic Long Grain Rice 2kg R29.99 was R39.99')).toMatchObject([
      { previousPriceText: 'R39.99', priceText: 'R29.99', title: 'Tastic Long Grain Rice 2kg' },
    ])
  })

  it('drops a was price it cannot read rather than inventing a saving', () => {
    expect(readPdfCatalogue('Tastic Long Grain Rice 2kg R99 was R1299')).toMatchObject([
      { previousPriceText: undefined, priceText: 'R99', title: 'Tastic Long Grain Rice 2kg' },
    ])
  })

  it('stores nothing for the welded Walmart page that produced the junk rows', () => {
    const page = [
      'Page 5',
      '75”QLED/4KUSBX 2HDMIX 3eachR10999R9999190 cm (75”) QLED Google TV• Model: 75Q6600 (850033761)152 cm (60”) QLED Smart TV• Model: 60Q6600H (850033690)eachR6499',
      'Apples1.5 kgR2995eachSTARKINGORANGESFamily PocketR3995eachCLOVER',
      'Walmart Africa Credit Pricing: * Monthly instalment includes card fees, customer protection insurance and includes interest at 20.75% p.a.',
      'location. Photographic images used in advertising may not accurately represent the actual colour of the product due to printing limitations.',
    ].join('\n')

    expect(readPdfCatalogue(page)).toEqual([])
  })
})

describe('reading a vision catalogue', () => {
  it('keeps Shoprite and Checkers shaped deals untouched', () => {
    expect(readVisionCatalogue([
      visionDeal({}),
      visionDeal({ previousPrice: 'R39.99', price: 'R29.99', title: 'Clover Fresh Full Cream Milk 2L' }),
      visionDeal({ price: 'R129', title: 'Huggies Baby Soft Diapers Size 4 44s' }),
      visionDeal({ price: 'R54.99', title: 'OMO Auto Washing Powder 2kg' }),
    ])).toMatchObject([
      { priceText: 'R29.99', title: 'Tastic Long Grain Parboiled Rice 2kg' },
      { previousPriceText: 'R39.99', priceText: 'R29.99', title: 'Clover Fresh Full Cream Milk 2L' },
      { priceText: 'R129', title: 'Huggies Baby Soft Diapers Size 4 44s' },
      { priceText: 'R54.99', title: 'OMO Auto Washing Powder 2kg' },
    ])
  })

  it('still rejects page furniture and small print read off a page image', () => {
    expect(readVisionCatalogue([
      visionDeal({ title: 'Page 12' }),
      visionDeal({ title: 'Terms and conditions apply. E&OE' }),
      visionDeal({ title: 'R14995each' }),
    ])).toEqual([])
  })
})
