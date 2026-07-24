import { describe, expect, it } from 'vitest'
import { decodeEvetechProducts, parseEvetechFeed } from './evetech'

const capturedAt = '2026-07-25T09:00:00.000Z'
const context = {
  capturedAt,
  sourceUrl: 'https://www.evetech.co.za/amd-laptops-on-special/l/682',
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    AppPrice: 8499,
    Manufacture: 'HP',
    Name: 'HP Notebook 255R G10 8GB/512GB Ryzen 3',
    OldPrice: 12_499,
    Price: 0,
    PriceIncVat: 8499,
    ProductCode: 'D0ML8AT',
    ProductId: 40_808,
    ProductImage: 'https://img.evetech.co.za/repository/ProductImages/hp-255r.webp',
    Title: 'hp-notebook-255r-g10-ryzen-3-8gb-512gb',
    Url: 'https://www.evetech.co.za/hp-notebook-255r-g10-ryzen-3-8gb-512gb/laptops-for-sale/40808',
    objectID: 'L40808',
    ...overrides,
  }
}

/** One RSC chunk as the page streams it: a JSON string inside a push call. */
function rscChunk(text: string) {
  return `<script>self.__next_f.push([1,${JSON.stringify(text)}])</script>`
}

function rscPage(products: unknown[]) {
  const serialized = `b2:[["$","$Lb3",null,{"products":${JSON.stringify(products)}}]]`
  const half = Math.floor(serialized.length / 2)
  // The payload really does arrive split across pushes, so the fixture splits
  // it too: a decoder that reads only one chunk would fail here.
  return `<!doctype html><body>${rscChunk(serialized.slice(0, half))}` +
    `${rscChunk(serialized.slice(half))}</body>`
}

describe('decodeEvetechProducts', () => {
  it('rebuilds the products array from the streamed server-component chunks', () => {
    const decoded = decodeEvetechProducts(rscPage([product()])) as { products: unknown[] }

    expect(decoded.products).toHaveLength(1)
    expect(decoded.products[0]).toMatchObject({ ProductId: 40_808, OldPrice: 12_499 })
  })

  it('rejects a page that carries no server-component products', () => {
    expect(() => decodeEvetechProducts('<html><body>No products</body></html>'))
      .toThrow('Invalid Evetech server-component response')
    expect(() => decodeEvetechProducts(rscChunk('{"products":[broken')))
      .toThrow('Invalid Evetech server-component response')
  })
})

describe('parseEvetechFeed', () => {
  it('uses OldPrice as the previous price when it is genuinely higher', () => {
    const page = parseEvetechFeed({ products: [product()] }, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl: 'https://img.evetech.co.za/repository/ProductImages/hp-255r.webp',
      previousPriceCents: 1_249_900,
      priceCents: 849_900,
      productId: '40808',
      productUrl:
        'https://www.evetech.co.za/hp-notebook-255r-g10-ryzen-3-8gb-512gb/laptops-for-sale/40808',
      promotionId: 'evetech-specials',
      retailerId: 'evetech',
      savingText: '32% off',
      scope: { type: 'online' },
      title: 'HP Notebook 255R G10 8GB/512GB Ryzen 3',
    })
  })

  it('yields nothing for full-price listings', () => {
    const page = parseEvetechFeed({
      products: [
        product({ OldPrice: 0, ProductId: 1 }),
        product({ OldPrice: 8499, ProductId: 2 }),
        product({ OldPrice: 7999, ProductId: 3 }),
      ],
    }, context)

    expect(page.candidates).toEqual([])
    expect(page.totalCount).toBe(3)
  })

  it('falls back to AppPrice when PriceIncVat is missing', () => {
    const page = parseEvetechFeed({
      products: [product({ AppPrice: 7999, PriceIncVat: 0 })],
    }, context)

    expect(page.candidates[0].priceCents).toBe(799_900)
  })

  it('drops products without an official Evetech link', () => {
    const page = parseEvetechFeed({
      products: [
        product({ ProductId: 11, Url: '' }),
        product({ ProductId: 12, Url: 'https://example.com/p/40808' }),
      ],
    }, context)

    expect(page.candidates).toEqual([])
  })

  it('deduplicates a product listed twice on the page', () => {
    const page = parseEvetechFeed({ products: [product(), product()] }, context)
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a payload without a products array', () => {
    expect(() => parseEvetechFeed({ products: {} }, context))
      .toThrow('Invalid Evetech feed payload')
    expect(() => parseEvetechFeed(null, context)).toThrow(TypeError)
  })
})
