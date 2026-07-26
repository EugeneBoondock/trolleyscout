import { describe, expect, it } from 'vitest'
import {
  SPORTSMANS_SEARCH_URL,
  buildSportsmansSearchRequest,
  parseSportsmansFeed,
  parseSportsmansSearchToken,
} from './sportsmansWarehouse'

const context = {
  capturedAt: '2026-07-26T12:00:00.000Z',
  sourceUrl: 'https://www.sportsmanswarehouse.co.za/category/outlet/',
}

describe('parseSportsmansSearchToken', () => {
  it('reads the short-lived public search token', () => {
    expect(parseSportsmansSearchToken({
      expiresAt: 1_785_069_412,
      indices: ['swh_prod_products', 'swh_prod_products_discount_desc'],
      token: 'secured-token-value',
      userToken: 'anonymous-user',
    })).toEqual({
      expiresAt: 1_785_069_412,
      token: 'secured-token-value',
      userToken: 'anonymous-user',
    })
  })

  it('rejects a response without access to the product index', () => {
    expect(() => parseSportsmansSearchToken({
      indices: ['other'],
      token: 'secured-token-value',
      userToken: 'anonymous-user',
    })).toThrow('Invalid Sportsmans Warehouse search token')
  })
})

describe('buildSportsmansSearchRequest', () => {
  it('queries the official Outlet facet with a bounded page', () => {
    const request = buildSportsmansSearchRequest('secured-token-value', 2)
    const body = JSON.parse(String(request.init.body))

    expect(request.url).toBe(SPORTSMANS_SEARCH_URL)
    expect(request.init.headers).toMatchObject({
      'x-algolia-api-key': 'secured-token-value',
      'x-algolia-application-id': 'D6WY1Z4E62',
    })
    expect(body).toMatchObject({
      facetFilters: [['category_page_id:Outlet']],
      hitsPerPage: 100,
      page: 2,
      query: '',
    })
  })
})

describe('parseSportsmansFeed', () => {
  it('maps outlet pricing, links, images, and paging', () => {
    const page = parseSportsmansFeed({
      hits: [{
        code: '1061907',
        objectID: '33568',
        price: 499.9,
        primary_image: {
          cdn_path:
            'https://res.cloudinary.com/moresport/image/upload/' +
            'f_auto,q_auto/assets/1061907.jpg',
        },
        save_percent: 28.58,
        slug: 'spinlock-tricep-bar-86cm',
        title: 'Spinlock Tricep Bar 86cm',
        was_price: 699.9,
      }],
      nbHits: 683,
      nbPages: 7,
      page: 0,
    }, context)

    expect(page.totalCount).toBe(683)
    expect(page.nextCursor).toEqual({ kind: 'page', page: 1 })
    expect(page.candidates[0]).toMatchObject({
      imageUrl:
        'https://res.cloudinary.com/moresport/image/upload/' +
        'f_auto,q_auto/assets/1061907.jpg',
      previousPriceCents: 69_990,
      priceCents: 49_990,
      productId: '33568',
      productUrl:
        'https://www.sportsmanswarehouse.co.za/product/' +
        'spinlock-tricep-bar-86cm/',
      retailerId: 'sportsmans-warehouse',
      savingText: '29% off',
      title: 'Spinlock Tricep Bar 86cm',
    })
  })

  it('drops full-price and duplicate hits', () => {
    const page = parseSportsmansFeed({
      hits: [{
        objectID: '1',
        price: 100,
        slug: 'full-price',
        title: 'Full price',
        was_price: 100,
      }, {
        objectID: '2',
        price: 80,
        slug: 'sale',
        title: 'Sale',
        was_price: 100,
      }, {
        objectID: '2',
        price: 80,
        slug: 'sale',
        title: 'Sale',
        was_price: 100,
      }],
      nbHits: 3,
      nbPages: 1,
      page: 0,
    }, context)

    expect(page.candidates).toHaveLength(1)
    expect(page.nextCursor).toBeUndefined()
  })
})
