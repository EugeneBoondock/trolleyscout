import { describe, expect, it } from 'vitest'

import {
  buildClothingCatalogueRequest,
  parseClothingCatalogue,
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

describe('takealot fashion', () => {
  const payload = {
    sections: {
      products: {
        results: [
          {
            product_views: {
              core: {
                id: 92979167,
                title: 'Oversize Snoodie-Blanket Hoodie',
                slug: 'oversize-snoodie-blanket-hoodie',
                brand: 'Snoodie',
              },
              buybox_summary: { prices: [222, 270] },
              gallery: { images: ['https://media.takealot.com/a/{size}.jpg'] },
              stock_availability_summary: { status: 'in_stock' },
            },
          },
        ],
      },
    },
  }

  it('reads the buybox price the shopper would actually pay', () => {
    const [product] = parseClothingCatalogue(
      'takealot',
      payload,
      'https://www.takealot.com',
    )
    expect(product.title).toBe('Oversize Snoodie-Blanket Hoodie')
    expect(product.priceCents).toBe(22200)
    expect(product.previousPriceCents).toBe(27000)
    expect(product.productUrl).toBe(
      'https://www.takealot.com/oversize-snoodie-blanket-hoodie/PLID92979167',
    )
    // The gallery hands back a templated URL; a raw {size} renders nothing.
    expect(product.imageUrl).toBe('https://media.takealot.com/a/pdpxl.jpg')
  })

  it('pages by search term, because start and page are ignored', () => {
    // Takealot pages with an opaque cursor a stateless sweep cannot carry, and
    // silently returns page one for start/page/offset — a sweep that trusted
    // them would save the same 36 products twelve times.
    const first = buildClothingCatalogueRequest(
      'takealot',
      'https://www.takealot.com',
      1,
    )
    const second = buildClothingCatalogueRequest(
      'takealot',
      'https://www.takealot.com',
      2,
    )
    expect(first?.url).toContain('qsearch=jeans')
    expect(second?.url).not.toBe(first?.url)
    expect(first?.method).toBe('GET')
  })
})

describe('mr price', () => {
  it('asks Magento with the store view that unlocks the catalogue', () => {
    const request = buildClothingCatalogueRequest(
      'magento-mrp',
      'https://www.mrp.com',
      1,
    )
    expect(request?.method).toBe('POST')
    // Without this header the endpoint 404s; with the wrong value it answers
    // "Requested store is not found".
    expect(request?.headers?.store).toBe('en_za')
    expect(request?.body).toContain('products(search:\\"t-shirt\\"')
  })

  it('rebuilds the image from the SKU, because the API serves a placeholder',
    () => {
      const [product] = parseClothingCatalogue(
        'magento-mrp',
        {
          data: {
            products: {
              items: [
                {
                  sku: '01_107235205',
                  name: 'Slim T-Shirt',
                  url_key: 'slim-t-shirt-107235205',
                  stock_status: 'IN_STOCK',
                  price_range: {
                    minimum_price: {
                      final_price: { value: 89.99 },
                      regular_price: { value: 129.99 },
                    },
                  },
                },
              ],
            },
          },
        },
        'https://www.mrp.com',
      )
      expect(product.title).toBe('Slim T-Shirt')
      expect(product.priceCents).toBe(8999)
      expect(product.previousPriceCents).toBe(12999)
      expect(product.productUrl).toBe('https://www.mrp.com/slim-t-shirt-107235205')
      expect(product.imageUrl).toContain('mrpricegroup/01_107235205_SI_00')
    })

  it('drops a row with no readable price rather than shelving a free shirt',
    () => {
      expect(
        parseClothingCatalogue(
          'magento-mrp',
          { data: { products: { items: [{ sku: 'x', name: 'y', url_key: 'z' }] } } },
          'https://www.mrp.com',
        ),
      ).toEqual([])
    })
})
