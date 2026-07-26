import { describe, expect, it } from 'vitest'
import {
  buildZaraCategoriesUrl,
  buildZaraProductsUrl,
  decodeZaraCursor,
  encodeZaraCursor,
  parseZaraSaleCategories,
  parseZaraSaleFeed,
} from './zara'

const context = {
  capturedAt: '2026-07-26T12:00:00.000Z',
  sourceUrl: 'https://www.zara.com/za/en/sale-l1314.html',
}

const product = {
  id: 495506702,
  name: 'FAUX SHEARLING COAT',
  oldPrice: 259900,
  price: 155940,
  type: 'Product',
  seo: {
    keyword: 'faux-shearling-coat',
    seoProductId: '01255730',
  },
  detail: {
    colors: [{
      xmedia: [{
        type: 'image',
        url:
          'https://static.zara.net/assets/public/dffe/coat.jpg' +
          '?ts=1761726678908&w={width}',
      }],
    }],
  },
}

describe('Zara sale discovery', () => {
  it('discovers the live sale targets without relying on seasonal category ids', () => {
    const payload = {
      categories: [{
        id: 1,
        name: 'WOMAN',
        subcategories: [{
          id: 2,
          name: 'SALE',
          sectionName: 'WOMAN',
          subcategories: [{
            id: 3,
            name: 'VIEW ALL',
            redirectCategoryId: 2723961,
            subcategories: [],
          }],
        }],
      }, {
        id: 4,
        name: 'MAN',
        subcategories: [{
          id: 5,
          name: 'SALE',
          sectionName: 'MAN',
          subcategories: [
            { id: 2134040, name: 'COLLECTION', subcategories: [] },
            { id: 2134038, name: 'SHOES | ACCESSORIES', subcategories: [] },
          ],
        }],
      }, {
        id: 6,
        name: 'BEAUTY',
        subcategories: [{
          id: 2535898,
          name: 'SALE',
          sectionName: 'BEAUTY',
          subcategories: [],
        }],
      }],
    }

    expect(parseZaraSaleCategories(payload)).toEqual([
      2723961,
      2134040,
      2134038,
      2535898,
    ])
  })

  it('rejects a category response with no sale targets', () => {
    expect(() => parseZaraSaleCategories({ categories: [] }))
      .toThrow('Invalid Zara sale categories')
  })
})

describe('parseZaraSaleFeed', () => {
  it('maps Zara cents, old prices, product links, and official images', () => {
    const page = parseZaraSaleFeed({
      productGroups: [{
        elements: [{
          commercialComponents: [product],
        }],
      }],
    }, context)

    expect(page.totalCount).toBe(1)
    expect(page.candidates).toHaveLength(1)
    expect(page.candidates[0]).toMatchObject({
      imageUrl:
        'https://static.zara.net/assets/public/dffe/coat.jpg' +
        '?ts=1761726678908&w=750',
      previousPriceCents: 259_900,
      priceCents: 155_940,
      productId: '495506702',
      productUrl:
        'https://www.zara.com/za/en/faux-shearling-coat-p01255730.html' +
        '?v1=495506702',
      retailerId: 'zara',
      savingText: '40% off',
      title: 'FAUX SHEARLING COAT',
    })
  })

  it('drops full-price products and duplicate product ids', () => {
    const page = parseZaraSaleFeed({
      productGroups: [{
        elements: [{
          commercialComponents: [
            product,
            product,
            { ...product, id: 2, oldPrice: 155940 },
          ],
        }],
      }],
    }, context)

    expect(page.totalCount).toBe(3)
    expect(page.candidates).toHaveLength(1)
  })

  it('rejects a response without product groups', () => {
    expect(() => parseZaraSaleFeed({}, context)).toThrow('Invalid Zara sale response')
  })
})

describe('Zara request and cursor helpers', () => {
  it('builds public South African catalogue URLs', () => {
    expect(buildZaraCategoriesUrl()).toBe('https://www.zara.com/za/en/categories')
    expect(buildZaraProductsUrl(2723961))
      .toBe('https://www.zara.com/za/en/category/2723961/products')
  })

  it('round trips a bounded discovery cursor', () => {
    const cursor = { categoryIds: [2723961, 2134040], index: 1 }
    expect(decodeZaraCursor(encodeZaraCursor(cursor))).toEqual(cursor)
    expect(decodeZaraCursor('bad')).toBeUndefined()
  })
})
