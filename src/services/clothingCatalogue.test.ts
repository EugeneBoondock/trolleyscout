import { describe, expect, it } from 'vitest'

import {
  buildClothingCatalogueUrl,
  parseShopifyCatalogue,
  parseWooCommerceCatalogue,
} from './clothingCatalogue'

describe('clothing catalogue requests', () => {
  it('asks each platform for its own catalogue endpoint', () => {
    expect(buildClothingCatalogueUrl('shopify', 'https://bathu.co.za/', 2))
      .toBe('https://bathu.co.za/products.json?limit=250&page=2')
    expect(buildClothingCatalogueUrl('woocommerce', 'https://chepa.co.za'))
      .toBe('https://chepa.co.za/wp-json/wc/store/v1/products?per_page=100&page=1')
  })

  it('refuses anything that is not a real http origin', () => {
    expect(buildClothingCatalogueUrl('shopify', 'not a url')).toBeUndefined()
    expect(buildClothingCatalogueUrl('shopify', 'ftp://shop.test')).toBeUndefined()
  })
})

describe('parseShopifyCatalogue', () => {
  const payload = {
    products: [
      {
        handle: 'canvas-sneaker',
        id: 771,
        images: [{ src: 'https://cdn.shop/sneaker.jpg' }],
        product_type: 'Footwear',
        tags: ['Mens', 'Sneakers'],
        title: 'Canvas Sneaker',
        variants: [{ available: true, compare_at_price: '899.00', price: '649.00' }],
      },
      {
        // Full price is still a garment worth trying on — the fitting room
        // is not a discount rail.
        handle: 'linen-dress',
        id: 772,
        images: [{ src: '/cdn/dress.jpg' }],
        title: 'Linen Dress',
        variants: [{ available: false, compare_at_price: null, price: '399.00' }],
      },
      { handle: 'no-image', id: 773, images: [], title: 'Ghost', variants: [{ price: '10.00' }] },
      { handle: 'no-price', id: 774, images: [{ src: 'x.jpg' }], title: 'Priceless', variants: [] },
    ],
  }

  it('keeps every priced, pictured garment, discounted or not', () => {
    const products = parseShopifyCatalogue(payload, 'https://bathu.co.za')
    expect(products.map((product) => product.title))
      .toEqual(['Canvas Sneaker', 'Linen Dress'])
  })

  it('reads price, markdown, stock, image and link', () => {
    const [sneaker, dress] = parseShopifyCatalogue(payload, 'https://bathu.co.za')
    expect(sneaker).toMatchObject({
      externalId: '771',
      imageUrl: 'https://cdn.shop/sneaker.jpg',
      inStock: true,
      previousPriceCents: 89900,
      priceCents: 64900,
      productUrl: 'https://bathu.co.za/products/canvas-sneaker',
    })
    expect(sneaker.categoryText).toContain('Footwear')
    expect(sneaker.categoryText).toContain('Mens')
    // No markdown, out of stock, and a relative image made absolute.
    expect(dress.previousPriceCents).toBeUndefined()
    expect(dress.inStock).toBe(false)
    expect(dress.imageUrl).toBe('https://bathu.co.za/cdn/dress.jpg')
  })
})

describe('parseWooCommerceCatalogue', () => {
  it('reads the store API shape, minor units and all', () => {
    const products = parseWooCommerceCatalogue(
      [
        {
          categories: [{ name: 'Women' }, { name: 'Tops' }],
          id: 9,
          images: [{ src: 'https://chepa.co.za/top.jpg' }],
          is_in_stock: true,
          name: 'Cropped Tee',
          permalink: 'https://chepa.co.za/product/cropped-tee/',
          prices: {
            currency_minor_unit: 2,
            price: '24900',
            regular_price: '29900',
            sale_price: '24900',
          },
        },
      ],
      'https://chepa.co.za',
    )

    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({
      categoryText: 'Women Tops',
      externalId: '9',
      inStock: true,
      previousPriceCents: 29900,
      priceCents: 24900,
      productUrl: 'https://chepa.co.za/product/cropped-tee/',
      title: 'Cropped Tee',
    })
  })

  it('ignores a payload that is not a product list', () => {
    expect(parseWooCommerceCatalogue({ error: 'nope' }, 'https://chepa.co.za'))
      .toEqual([])
  })
})
